"""Runtime cache settings that begin with configuration defaults."""

from src.config import Config


class CacheSettings:
    """Owns the user-toggleable cache flags for one backend process."""

    def __init__(self, defaults=None):
        # Old server.py: _cache_enabled
        self.enabled = dict(defaults or Config.CACHE_DEFAULTS)
