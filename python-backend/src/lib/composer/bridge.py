"""Composer Bridge audio, thumbnail, cache, and bundled-app helpers."""

import glob
import os
import sys
import tempfile
from pathlib import Path
from typing import Dict, Iterator, Optional, Tuple

import requests

from src.config import PROJECT_ROOT, config_composer, config_dirs


class ComposerBridgeError(RuntimeError):
    """The Composer Bridge could not resolve or retrieve audio."""


class ComposerBridge:
    """Provides the shared behavior for the local Composer Bridge routes.

    Old server.py: _bridge_headers, composer_bridge_audio,
    composer_bridge_thumb, _composer_dist_dir, and composer_app.
    """

    STREAM_ENDPOINT = "http://127.0.0.1:9847/stream"
    EXPOSED_HEADERS = "Content-Type, x-track-title, x-track-artist, x-track-album"
    _AUDIO_MIME_TYPES = {
        ".opus": "audio/opus",
        ".m4a": "audio/mp4",
        ".mp4": "audio/mp4",
        ".webm": "audio/webm",
        ".mp3": "audio/mpeg",
        ".ogg": "audio/ogg",
        ".flac": "audio/flac",
        ".wav": "audio/wav",
    }

    def __init__(self, settings, cache_settings, music_session):
        self._settings = settings
        self._cache_settings = cache_settings
        self._music_session = music_session

    @property
    def autocache_enabled(self) -> bool:
        return self._settings.autocache

    def set_autocache_enabled(self, enabled) -> bool:
        return self._settings.set_autocache(enabled)

    def track_metadata(self, video_id: str) -> Dict[str, Optional[str]]:
        """Fetch optional metadata used by Composer's submission form."""
        try:
            info = self._music_session.get_active_client().get_song(video_id) or {}
            details = info.get("videoDetails", {}) or {}
            return {"title": details.get("title"), "artist": details.get("author")}
        except Exception:
            return {"title": None, "artist": None}

    def cached_audio_path(self, video_id: str) -> Optional[Path]:
        """Return a downloaded or player-prepared local audio copy when available."""
        safe_id = self._safe_video_id(video_id)
        for extension in (".opus", ".m4a", ".webm", ".mp3"):
            path = config_dirs.SONG_CACHE_DIR / f"{safe_id}{extension}"
            if path.exists():
                return path

        player_cache = Path(tempfile.gettempdir()) / "kiyoshi-audio"
        for path_text in glob.glob(str(player_cache / f"{safe_id}.*")):
            path = Path(path_text)
            if path.suffix.lower() not in self._AUDIO_MIME_TYPES:
                continue
            try:
                if path.stat().st_size > 0:
                    return path
            except OSError:
                pass
        return None

    def audio_mime_type(self, path: Path) -> str:
        return self._AUDIO_MIME_TYPES.get(path.suffix.lower(), "audio/mp4")

    def open_audio_stream(self, video_id: str):
        """Resolve the current stream through the existing local stream endpoint."""
        try:
            resolution = requests.get(f"{self.STREAM_ENDPOINT}/{video_id}", timeout=60)
            data = resolution.json()
        except Exception as error:
            raise ComposerBridgeError(str(error)) from error

        url = data.get("url") if isinstance(data, dict) else None
        if not url:
            error = data.get("error", "no_url") if isinstance(data, dict) else "no_url"
            raise ComposerBridgeError(error)
        try:
            return requests.get(url, stream=True, timeout=120)
        except Exception as error:
            raise ComposerBridgeError(str(error)) from error

    def stream_with_optional_cache(self, video_id: str, upstream) -> Iterator[bytes]:
        """Yield upstream bytes and atomically cache them when enabled."""
        content_type = upstream.headers.get("Content-Type", "audio/mp4")
        extension = ".webm" if "webm" in content_type else ".mp3" if "mpeg" in content_type or "mp3" in content_type else ".m4a"
        target = config_dirs.SONG_CACHE_DIR / f"{self._safe_video_id(video_id)}{extension}"
        temporary_target = Path(f"{target}.part")
        should_cache = self.autocache_enabled and self._cache_settings.enabled.get("songs", True)
        cache_file = None
        try:
            if should_cache:
                try:
                    cache_file = temporary_target.open("wb")
                except OSError:
                    cache_file = None
            for chunk in upstream.iter_content(chunk_size=65536):
                if not chunk:
                    continue
                if cache_file is not None:
                    try:
                        cache_file.write(chunk)
                    except OSError:
                        cache_file.close()
                        cache_file = None
                yield chunk
            if cache_file is not None:
                cache_file.close()
                cache_file = None
                try:
                    os.replace(temporary_target, target)
                except OSError:
                    pass
        finally:
            upstream.close()
            if cache_file is not None:
                cache_file.close()
                try:
                    temporary_target.unlink()
                except OSError:
                    pass

    @staticmethod
    def thumbnail(video_id: str) -> Optional[Tuple[bytes, str]]:
        """Download the best available YouTube thumbnail for Composer."""
        for name in ("maxresdefault", "hqdefault", "mqdefault"):
            try:
                response = requests.get(f"https://i.ytimg.com/vi/{video_id}/{name}.jpg", timeout=10)
                if response.ok and len(response.content) > 1024:
                    return response.content, response.headers.get("Content-Type", "image/jpeg")
            except Exception:
                continue
        return None

    @staticmethod
    def composer_dist_directory() -> Path:
        """Find the Composer SPA in development and packaged application layouts."""
        override = os.environ.get("KODAMA_COMPOSER_DIST")
        if override and Path(override).is_dir():
            return Path(override)
        if getattr(sys, "frozen", False):
            bundle_root = getattr(sys, "_MEIPASS", None)
            if bundle_root:
                bundled_dist = Path(bundle_root) / "composer_dist"
                if bundled_dist.is_dir():
                    return bundled_dist
        development_dist = PROJECT_ROOT.parent / "composer" / "dist"
        if development_dist.is_dir():
            return development_dist
        return PROJECT_ROOT / "composer_dist"

    @staticmethod
    def _safe_video_id(video_id: str) -> str:
        return video_id.replace("/", "_").replace("\\", "_")
