"""Background song downloads and the on-disk song cache."""

import json
import logging
import os
import threading

from src.config import config_dirs, config_ytdlp
from src.lib.integrations.ytdlp import is_hard_error
from src.lib.runtime.maintenance import DelayedCleanup


class DownloadService:
    """Downloads songs to the permanent song cache and tracks their progress."""

    # Old server.py: mime map in serve_cached_song
    MIME_BY_EXT = {".opus": "audio/opus", ".m4a": "audio/mp4", ".webm": "audio/webm", ".mp3": "audio/mpeg"}

    def __init__(self, ytdlp, logger=None):
        self._ytdlp = ytdlp
        self._logger = logger or logging.getLogger(__name__)
        # Old server.py: _download_status — video_id -> "downloading" | "done" | "error"
        self.status = {}
        # Old server.py: _download_queue — video_id -> {title, artists, thumbnail, status, progress}
        self.queue = {}

    # Old server.py: _song_audio_path
    @staticmethod
    def song_audio_path(video_id):
        """Return the path to the cached audio file (.opus or .m4a), or None."""
        safe = video_id.replace("/", "_").replace("\\", "_")
        for ext in (".opus", ".m4a", ".webm", ".mp3"):
            path = os.path.join(config_dirs.SONG_CACHE_DIR, safe + ext)
            if os.path.exists(path):
                return path
        return None

    # Old server.py: _song_meta_path
    @staticmethod
    def song_meta_path(video_id):
        safe = video_id.replace("/", "_").replace("\\", "_")
        return os.path.join(config_dirs.SONG_CACHE_DIR, safe + ".json")

    @classmethod
    def audio_mime_type(cls, path):
        return cls.MIME_BY_EXT.get(os.path.splitext(path)[1].lower(), "application/octet-stream")

    # Old server.py: _download_song_bg
    def _download_bg(self, video_id, meta):
        """Background download via yt-dlp."""
        try:
            import yt_dlp
            safe = video_id.replace("/", "_").replace("\\", "_")
            output_tpl = os.path.join(config_dirs.SONG_CACHE_DIR, safe + ".%(ext)s")

            def progress_hook(d):
                if d.get("status") == "downloading":
                    total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
                    downloaded = d.get("downloaded_bytes", 0)
                    if total > 0 and video_id in self.queue:
                        self.queue[video_id]["progress"] = round(downloaded / total, 3)

            last_dl_err = None
            for fmt, extra, no_auth in config_ytdlp.STREAM_ATTEMPTS:
                try:
                    ydl_opts = {
                        "format": fmt,
                        "quiet": True,
                        "no_warnings": True,
                        "outtmpl": output_tpl,
                        "progress_hooks": [progress_hook],
                    }
                    if extra:
                        ydl_opts.update(extra)
                    if not no_auth:
                        self._ytdlp.apply_active_session_auth(ydl_opts)
                    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                        ydl.download([f"https://music.youtube.com/watch?v={video_id}"])
                    last_dl_err = None
                    break
                except Exception as dl_e:
                    last_dl_err = dl_e
                    if is_hard_error(str(dl_e)):
                        break
                    self._logger.warning(f"[download] {video_id} fmt={fmt} auth={not no_auth}: {dl_e}")
            if last_dl_err:
                raise last_dl_err
            # Save metadata
            with open(self.song_meta_path(video_id), "w", encoding="utf-8") as f:
                json.dump(meta, f, ensure_ascii=False)
            self.status[video_id] = "done"
            if video_id in self.queue:
                self.queue[video_id]["status"] = "done"
                self.queue[video_id]["progress"] = 1.0
            DelayedCleanup.schedule_removal(self.status, video_id)
            DelayedCleanup.schedule_removal(self.queue, video_id)
        except Exception as e:
            self.status[video_id] = "error"
            if video_id in self.queue:
                self.queue[video_id]["status"] = "error"
                if "Music Premium" in str(e):
                    self.queue[video_id]["error_type"] = "premium_only"
            DelayedCleanup.schedule_removal(self.status, video_id)
            DelayedCleanup.schedule_removal(self.queue, video_id)
            self._logger.error(f"[download] {video_id}: {type(e).__name__}: {e}")

    # Old server.py: the state-setup portion of download_song
    def start(self, video_id, meta):
        """Mark a song as downloading and spawn the background worker."""
        self.status[video_id] = "downloading"
        self.queue[video_id] = {
            "videoId": video_id,
            "title": meta.get("title", ""),
            "artists": meta.get("artists", ""),
            "thumbnail": meta.get("thumbnail", ""),
            "status": "downloading",
            "progress": 0.0,
        }
        threading.Thread(target=self._download_bg, args=(video_id, meta), daemon=True).start()

    # Old server.py: downloads_queue
    def queue_snapshot(self):
        """Return active + recently finished entries and prune the finished ones."""
        to_remove = [vid for vid, d in self.queue.items() if d["status"] in ("done", "error")]
        result = list(self.queue.values())
        for vid in to_remove:
            self.queue.pop(vid, None)
        return result

    # Old server.py: list_cached_songs
    def list_cached(self):
        songs = []
        try:
            for name in os.listdir(config_dirs.SONG_CACHE_DIR):
                if name.endswith(".json"):
                    try:
                        with open(os.path.join(config_dirs.SONG_CACHE_DIR, name), "r", encoding="utf-8") as fh:
                            songs.append(json.load(fh))
                    except Exception:
                        pass
        except Exception:
            pass
        return songs

    # Old server.py: the body of delete_cached_song
    def delete_cached(self, video_id):
        audio = self.song_audio_path(video_id)
        if audio:
            try:
                os.remove(audio)
            except Exception:
                pass
        meta = self.song_meta_path(video_id)
        if os.path.exists(meta):
            try:
                os.remove(meta)
            except Exception:
                pass
        self.status.pop(video_id, None)
