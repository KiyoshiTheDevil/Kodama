"""Application configuration and filesystem locations.

This module deliberately contains fixed settings and resolved paths only. Runtime
state, such as the active profile or a YTMusic client, belongs outside config.
"""

import collections
import json
import os
import shutil
import sys
from pathlib import Path
from typing import Optional


PROJECT_ROOT = Path(__file__).resolve().parent.parent


def _resolve_base_dir() -> Path:
    """Return the directory used for user data in dev and packaged builds."""
    if not getattr(sys, "frozen", False):
        return PROJECT_ROOT

    if sys.platform == "win32":
        data_root = Path(os.environ.get("LOCALAPPDATA", Path(sys.executable).resolve().parent))
    else:
        data_root = Path(os.environ.get("XDG_DATA_HOME", Path.home() / ".local" / "share")).expanduser()

    base_dir = data_root / "dev.kodama.music"
    old_dir = data_root / "dev.kiyoshi.music"
    if not base_dir.exists() and old_dir.is_dir():
        try:
            shutil.move(str(old_dir), str(base_dir))
        except OSError:
            # Keep using the old directory if its migration cannot complete.
            return old_dir
    return base_dir


def _lastfm_config_candidates() -> list[Path]:
    candidates = []
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        candidates.append(Path(sys._MEIPASS) / "lastfm_config.json")
    candidates.append(PROJECT_ROOT / "lastfm_config.json")
    return candidates


def _load_lastfm_credentials() -> tuple[str, str]:
    api_key = os.environ.get("LASTFM_API_KEY", "")
    api_secret = os.environ.get("LASTFM_API_SECRET", "")
    if api_key and api_secret:
        return api_key, api_secret

    for path in _lastfm_config_candidates():
        try:
            with path.open(encoding="utf-8") as config_file:
                values = json.load(config_file)
        except (OSError, ValueError, TypeError):
            continue
        return api_key or values.get("api_key", ""), api_secret or values.get("api_secret", "")

    return api_key, api_secret


class Config:
    """Flask-compatible, application-wide fixed settings."""

    DEBUG = True
    LOG_RING = collections.deque(maxlen=300)

    IMG_CACHE_TTL = 30 * 24 * 3600
    PLAYLIST_CACHE_TTL = 24 * 3600
    ALBUM_CACHE_TTL = 7 * 24 * 3600


class ConfigDirs:
    """Resolved data directories. They are created once during startup."""

    def __init__(self, base_dir: Optional[Path] = None):
        self.BASE_DIR = base_dir or _resolve_base_dir()
        self.PROFILES_DIR = self.BASE_DIR / "profiles"
        self.IMG_CACHE_DIR = self.BASE_DIR / "imgcache"
        self.PLAYLIST_CACHE_DIR = self.BASE_DIR / "playlist_cache"
        self.ALBUM_CACHE_DIR = self.BASE_DIR / "album_cache"
        self.SONG_CACHE_DIR = self.BASE_DIR / "song_cache"
        self.LYRICS_CACHE_DIR = self.BASE_DIR / "lyrics_cache"
        self.CUSTOM_LYRICS_DIR = self.BASE_DIR / "custom_lyrics"
        self.YTDLP_UPDATE_DIR = self.BASE_DIR / "ytdlp"

        for directory in (
            self.PROFILES_DIR,
            self.IMG_CACHE_DIR,
            self.PLAYLIST_CACHE_DIR,
            self.ALBUM_CACHE_DIR,
            self.SONG_CACHE_DIR,
            self.LYRICS_CACHE_DIR,
            self.CUSTOM_LYRICS_DIR,
            self.YTDLP_UPDATE_DIR,
        ):
            directory.mkdir(parents=True, exist_ok=True)


class ConfigLastFM:
    """Last.fm credentials, loaded from the environment or local config."""

    API_ROOT = "https://ws.audioscrobbler.com/2.0/"

    def __init__(self):
        self.LASTFM_API_KEY, self.LASTFM_API_SECRET = _load_lastfm_credentials()


class ConfigYTMusic:
    """Fixed YouTube Music settings."""

    PLAYLIST_CACHE_MAX = 20

class ConfigMusixMatch:
    """Fixed Music Match settings."""

    MX_APP_ID = "web-desktop-app-v1.0"
    MX_BASE = "https://apic-desktop.musixmatch.com/ws/1.1"
    MX_HEADERS = {
        "authority": "apic-desktop.musixmatch.com",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "cookie": "x-mxm-token-guid=",
    }

config = Config()
config_dirs = ConfigDirs()
config_lastfm = ConfigLastFM()
config_ytmusic = ConfigYTMusic()
config_musixmatch = ConfigMusixMatch()
