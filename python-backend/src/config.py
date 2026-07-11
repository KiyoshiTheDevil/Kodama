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
    PREFER_IPV4 = True
    LOG_RING = collections.deque(maxlen=300)

    IMG_CACHE_TTL = 30 * 24 * 3600
    PLAYLIST_CACHE_TTL = 24 * 3600
    ALBUM_CACHE_TTL = 7 * 24 * 3600
    CACHE_DEFAULTS = {"playlists": True, "albums": True, "images": True, "songs": True, "lyrics": True}


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


class ConfigComposer:
    """Static settings for the local Composer bridge."""

    ORIGIN = "https://composer.boidu.dev"
    DEFAULT_AUTOCACHE = True

    def __init__(self, base_dir: Path):
        self.SETTINGS_FILE = base_dir / "composer_settings.json"


class ConfigLyrics:
    """Fixed limits and language mappings for lyric tools."""

    TRANSLATION_CACHE_MAX = 500
    GOOGLE_LANGUAGE_CODES = {
        "DE": "de", "EN": "en", "FR": "fr", "ES": "es", "IT": "it",
        "PT": "pt", "NL": "nl", "PL": "pl", "RU": "ru",
        "JA": "ja", "KO": "ko", "ZH": "zh-CN",
    }


class ConfigYTDLP:
    """Client options and browser-cookie refresh settings for yt-dlp."""

    WEB_MUSIC_OPTIONS = {"extractor_args": {"youtube": {"player_client": ["web_music"]}}}
    ANDROID_OPTIONS = {"extractor_args": {"youtube": {"player_client": ["android_music"], "player_skip": ["js"]}}}
    IOS_OPTIONS = {"extractor_args": {"youtube": {"player_client": ["ios"], "player_skip": ["js"]}}}
    IOS_MUSIC_OPTIONS = {"extractor_args": {"youtube": {"player_client": ["ios_music"], "player_skip": ["js"]}}}
    TV_OPTIONS = {"extractor_args": {"youtube": {"player_client": ["tv_embedded"], "player_skip": ["js"]}}}
    MWEB_OPTIONS = {"extractor_args": {"youtube": {"player_client": ["mweb"]}}}
    AUDIO_FORMAT = "bestaudio[ext=m4a]/bestaudio[acodec=aac]"
    BROWSER_COOKIE_TTL = 6 * 3600
    BROWSER_COOKIE_MIN_GAP = 600

    def __init__(self, base_dir: Path):
        self.BROWSER_COOKIE_FILE = base_dir / "browser_cookies.txt"
        self.STREAM_ATTEMPTS = [
            (self.AUDIO_FORMAT, self.WEB_MUSIC_OPTIONS, False),
            (self.AUDIO_FORMAT, None, False),
            (self.AUDIO_FORMAT, self.TV_OPTIONS, True),
            (self.AUDIO_FORMAT, self.ANDROID_OPTIONS, True),
            (self.AUDIO_FORMAT, self.IOS_OPTIONS, True),
            (self.AUDIO_FORMAT, self.IOS_MUSIC_OPTIONS, True),
            (self.AUDIO_FORMAT, self.MWEB_OPTIONS, True),
            (self.AUDIO_FORMAT, self.WEB_MUSIC_OPTIONS, True),
            (self.AUDIO_FORMAT, None, True),
        ]


class ConfigOverlay:
    """Default document settings for the OBS overlay."""

    DOCUMENT_VERSION = 2
    V1_DEFAULT = {
        "preset": "basic",
        "bgColor": "#1a1a1a", "bgOpacity": 90,
        "accentColor": "#EEA8FF", "textColor": "#ffffff",
        "borderRadius": 14,
        "showProgress": True, "showAlbumArt": True,
        "showArtist": True, "showAlbum": False,
        "border": False, "borderColor": "#EEA8FF", "borderWidth": 1.5,
        "fontFamily": "system-ui, sans-serif",
        "titleFontSize": 14, "artistFontSize": 12,
        "dynamicWidth": False, "widgetWidth": 400, "widgetHeight": 0, "artSize": 56, "artRadius": 8,
        "artRadiusTL": 8, "artRadiusTR": 8, "artRadiusBR": 8, "artRadiusBL": 8,
        "artCornerTypeTL": "r", "artCornerTypeTR": "r", "artCornerTypeBR": "r", "artCornerTypeBL": "r",
        "paddingV": 12, "paddingH": 16, "gap": 12,
        "progressHeight": 3,
        "showShadow": False, "shadowStrength": 0.35,
        "bgBlur": 10, "bgBlurEnabled": False,
        "autoHide": False,
        "scrollTitle": False, "scrollSpeed": 80,
        "radiusTL": 14, "radiusTR": 14, "radiusBR": 14, "radiusBL": 14,
        "cornerTypeTL": "r", "cornerTypeTR": "r", "cornerTypeBR": "r", "cornerTypeBL": "r",
        "borderBlur": 0,
    }


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
config_composer = ConfigComposer(config_dirs.BASE_DIR)
config_lyrics = ConfigLyrics()
config_ytdlp = ConfigYTDLP(config_dirs.BASE_DIR)
config_overlay = ConfigOverlay()
config_musixmatch = ConfigMusixMatch()
