"""Runtime cache settings that begin with configuration defaults."""

from src.config import Config


class CacheSettings:
    """Owns the user-toggleable cache flags for one backend process."""

    CATEGORIES = ("playlists", "albums", "images", "songs", "lyrics")

    def __init__(self, defaults=None):
        # Old server.py: _cache_enabled
        self.enabled = dict(defaults or Config.CACHE_DEFAULTS)

    def update(self, values):
        """Apply only recognized cache flags and keep their values boolean."""
        for category in self.CATEGORIES:
            if category in values:
                self.enabled[category] = bool(values[category])

    @staticmethod
    def category_directories(config_dirs):
        """Map cache categories to their configured filesystem directories."""
        return {
            "playlists": config_dirs.PLAYLIST_CACHE_DIR,
            "albums": config_dirs.ALBUM_CACHE_DIR,
            "images": config_dirs.IMG_CACHE_DIR,
            "songs": config_dirs.SONG_CACHE_DIR,
            "lyrics": config_dirs.LYRICS_CACHE_DIR,
        }
