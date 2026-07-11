"""Export a song to a user-chosen path (opus/mp3) with embedded metadata."""

import logging
import os
import threading

from src.config import config_ytdlp
from src.lib.integrations.ytdlp import is_hard_error
from src.lib.runtime.maintenance import DelayedCleanup


class ExportService:
    """Downloads/converts a song to a user path and tags it with cover art."""

    def __init__(self, ytdlp, ffmpeg, logger=None):
        self._ytdlp = ytdlp
        self._ffmpeg = ffmpeg
        self._logger = logger or logging.getLogger(__name__)
        # Old server.py: _export_status — video_id -> "exporting" | "done" | "error"
        self.status = {}

    # Old server.py: _embed_metadata
    def embed_metadata(self, file_path, meta, fmt="opus"):
        """Embed artist, title, album, year, and cover art into audio file."""
        try:
            import requests as _req
            from mutagen import File as MutagenFile
            title = meta.get("title", "")
            artists = meta.get("artists", "")
            album = meta.get("album", "")
            year = meta.get("year", "")
            thumbnail = meta.get("thumbnail", "")

            print(f"Metadata: embedding for {file_path} | title={title} | artists={artists} | album={album} | year={year} | thumbnail={thumbnail[:80] if thumbnail else 'EMPTY'}")

            # Download cover art and convert to JPEG for maximum compatibility
            cover_data = None
            cover_mime = "image/jpeg"
            if thumbnail:
                try:
                    # Request high-res version (YouTube Music thumbnails support size params)
                    thumb_url = thumbnail
                    if "lh3.googleusercontent.com" in thumb_url:
                        # Replace size suffix to get 500x500 cover
                        import re
                        thumb_url = re.sub(r'=w\d+-h\d+.*$', '=w500-h500-l90-rj', thumb_url)
                        if '=' not in thumb_url:
                            thumb_url += '=w500-h500-l90-rj'
                    r = _req.get(thumb_url, timeout=10)
                    print(f"Metadata: thumbnail download status={r.status_code} content-type={r.headers.get('content-type','')} size={len(r.content)}")
                    if r.ok and len(r.content) > 100:
                        ct = r.headers.get("content-type", "")
                        # Convert to JPEG for best compatibility (WebP is not widely supported in tags)
                        if "webp" in ct or "png" in ct or thumbnail.endswith(".webp") or thumbnail.endswith(".png"):
                            try:
                                from io import BytesIO
                                from PIL import Image
                                img = Image.open(BytesIO(r.content))
                                img = img.convert("RGB")
                                buf = BytesIO()
                                img.save(buf, format="JPEG", quality=90)
                                cover_data = buf.getvalue()
                                print(f"Metadata: converted image to JPEG, {len(cover_data)} bytes")
                            except ImportError:
                                # Pillow not available, use raw data with detected mime
                                cover_data = r.content
                                if "webp" in ct:
                                    cover_mime = "image/webp"
                                elif "png" in ct:
                                    cover_mime = "image/png"
                                print(f"Metadata: Pillow not available, using raw {cover_mime}")
                            except Exception as img_err:
                                print(f"Metadata: image conversion failed: {img_err}, using raw")
                                cover_data = r.content
                        else:
                            cover_data = r.content
                            print(f"Metadata: using JPEG cover, {len(cover_data)} bytes")
                    else:
                        print(f"Metadata: thumbnail download failed or empty")
                except Exception as e:
                    print(f"Metadata: thumbnail download error: {e}")
            else:
                print(f"Metadata: no thumbnail URL provided")

            # Auto-detect actual container format
            audio = MutagenFile(file_path)
            if audio is None:
                print(f"Metadata: mutagen could not identify {file_path}")
                return

            type_name = type(audio).__name__
            print(f"Metadata: detected {type_name} for {file_path}")

            if type_name in ("OggOpus", "OggVorbis"):
                if title:
                    audio["title"] = [title]
                if artists:
                    audio["artist"] = [artists]
                if album:
                    audio["album"] = [album]
                if year:
                    audio["date"] = [str(year)]
                if cover_data:
                    from mutagen.flac import Picture
                    import base64
                    pic = Picture()
                    pic.type = 3
                    pic.mime = cover_mime
                    pic.desc = "Cover"
                    pic.data = cover_data
                    audio["metadata_block_picture"] = [base64.b64encode(pic.write()).decode("ascii")]
                    print(f"Metadata: embedded OGG cover ({len(cover_data)} bytes, {cover_mime})")
                audio.save()
                print(f"Metadata: OGG tags saved successfully")

            elif type_name == "MP3":
                from mutagen.id3 import TIT2, TPE1, TALB, TDRC, TYER, APIC
                if audio.tags is None:
                    audio.add_tags()
                tags = audio.tags
                if title:
                    tags.add(TIT2(encoding=3, text=[title]))
                if artists:
                    tags.add(TPE1(encoding=3, text=[artists]))
                if album:
                    tags.add(TALB(encoding=3, text=[album]))
                if year:
                    tags.add(TDRC(encoding=3, text=[str(year)]))
                    tags.add(TYER(encoding=3, text=[str(year)]))  # ID3v2.3 year tag for Windows compatibility
                if cover_data:
                    tags.add(APIC(encoding=3, mime=cover_mime, type=3, desc="Cover", data=cover_data))
                    print(f"Metadata: embedded MP3 cover ({len(cover_data)} bytes, {cover_mime})")
                # Save as ID3v2.3 for Windows Explorer compatibility
                audio.save(v2_version=3)
                print(f"Metadata: MP3 tags saved as ID3v2.3 successfully")

            elif type_name in ("MP4",):
                if title:
                    audio["\xa9nam"] = [title]
                if artists:
                    audio["\xa9ART"] = [artists]
                if album:
                    audio["\xa9alb"] = [album]
                if year:
                    audio["\xa9day"] = [str(year)]
                if cover_data:
                    from mutagen.mp4 import MP4Cover
                    audio["covr"] = [MP4Cover(cover_data, imageformat=MP4Cover.FORMAT_JPEG)]
                audio.save()

            else:
                print(f"Metadata: unsupported format {type_name} for {file_path}")

        except Exception as e:
            print(f"Metadata embed error: {e}")

    # Old server.py: _export_audio_bg
    def _export_bg(self, video_id, output_path, fmt="opus", meta=None):
        """Download / convert song and save to user-chosen path."""
        try:
            import yt_dlp
            import shutil
            import tempfile

            # For OPUS: download, convert WebM→OGG/Opus via ffmpeg, then tag with mutagen
            if fmt == "opus":
                tmp_dir = tempfile.mkdtemp()
                tmp_tpl = os.path.join(tmp_dir, "export.%(ext)s")
                ffmpeg_dir = self._ffmpeg.find()
                last_exp_err = None
                for attempt_fmt, extra, no_auth in config_ytdlp.STREAM_ATTEMPTS:
                    try:
                        ydl_opts = {
                            "format": attempt_fmt,
                            "quiet": True,
                            "no_warnings": True,
                            "outtmpl": tmp_tpl,
                        }
                        if extra:
                            ydl_opts.update(extra)
                        if not no_auth:
                            self._ytdlp.apply_active_session_auth(ydl_opts)
                        # Convert to proper OGG/Opus via ffmpeg so mutagen can tag it
                        if ffmpeg_dir is not False:
                            ydl_opts["postprocessors"] = [{
                                "key": "FFmpegExtractAudio",
                                "preferredcodec": "opus",
                                "preferredquality": "0",
                            }]
                            if ffmpeg_dir:
                                ydl_opts["ffmpeg_location"] = ffmpeg_dir
                        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                            ydl.download([f"https://music.youtube.com/watch?v={video_id}"])
                        last_exp_err = None
                        break
                    except Exception as exp_e:
                        last_exp_err = exp_e
                        if is_hard_error(str(exp_e)):
                            break
                        self._logger.warning(f"[export-opus] {video_id} fmt={attempt_fmt} auth={not no_auth}: {exp_e}")
                if last_exp_err:
                    raise last_exp_err
                # Find the resulting file
                for f in os.listdir(tmp_dir):
                    if f.startswith("export.") and not f.endswith((".json", ".jpg", ".png", ".webp")):
                        src = os.path.join(tmp_dir, f)
                        shutil.move(src, output_path)
                        break
                # Now embed metadata via mutagen (works on proper OGG/Opus files)
                if meta and os.path.exists(output_path):
                    self.embed_metadata(output_path, meta, "opus")
                self.status[video_id] = "done"
                DelayedCleanup.schedule_removal(self.status, video_id)
                try:
                    shutil.rmtree(tmp_dir)
                except Exception:
                    pass
                return

            # For MP3: need ffmpeg
            ffmpeg_dir = self._ffmpeg.find()
            if ffmpeg_dir is False:
                self.status[video_id] = "error"
                DelayedCleanup.schedule_removal(self.status, video_id)
                print(f"MP3 export error: ffmpeg not found")
                return

            tmp_dir = tempfile.mkdtemp()
            tmp_tpl = os.path.join(tmp_dir, "export.%(ext)s")
            last_mp3_err = None
            for attempt_fmt, extra, no_auth in config_ytdlp.STREAM_ATTEMPTS:
                try:
                    ydl_opts = {
                        "format": attempt_fmt,
                        "quiet": True,
                        "no_warnings": True,
                        "outtmpl": tmp_tpl,
                        "postprocessors": [{
                            "key": "FFmpegExtractAudio",
                            "preferredcodec": "mp3",
                            "preferredquality": "192",
                        }],
                    }
                    if extra:
                        ydl_opts.update(extra)
                    if not no_auth:
                        self._ytdlp.apply_active_session_auth(ydl_opts)
                    if ffmpeg_dir:
                        ydl_opts["ffmpeg_location"] = ffmpeg_dir
                    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                        ydl.download([f"https://music.youtube.com/watch?v={video_id}"])
                    last_mp3_err = None
                    break
                except Exception as mp3_e:
                    last_mp3_err = mp3_e
                    if is_hard_error(str(mp3_e)):
                        break
                    self._logger.warning(f"[export-mp3] {video_id} fmt={attempt_fmt} auth={not no_auth}: {mp3_e}")
            if last_mp3_err:
                raise last_mp3_err

            mp3 = os.path.join(tmp_dir, "export.mp3")
            if os.path.exists(mp3):
                shutil.move(mp3, output_path)
            if meta and os.path.exists(output_path):
                self.embed_metadata(output_path, meta, "mp3")
            self.status[video_id] = "done"
            DelayedCleanup.schedule_removal(self.status, video_id)
            try:
                shutil.rmtree(tmp_dir)
            except Exception:
                pass
        except Exception as e:
            self.status[video_id] = "error"
            DelayedCleanup.schedule_removal(self.status, video_id)
            print(f"Audio export error for {video_id}: {e}")

    # Old server.py: the thread-spawn portion of export_audio
    def start(self, video_id, output_path, fmt, meta):
        self.status[video_id] = "exporting"
        threading.Thread(target=self._export_bg, args=(video_id, output_path, fmt, meta), daemon=True).start()
