"""Persisted runtime settings for the local Composer bridge."""

import json

from src.config import config_composer


class ComposerSettings:
    """Loads and stores the Composer audio-cache preference."""

    def __init__(self, settings_file=None):
        self._settings_file = settings_file or config_composer.SETTINGS_FILE
        # Old server.py: _composer_autocache
        self.autocache = self.load_autocache()

    # Old server.py: _load_composer_autocache
    def load_autocache(self):
        try:
            with open(self._settings_file, encoding="utf-8") as settings_file:
                return bool(json.load(settings_file).get("autocache", config_composer.DEFAULT_AUTOCACHE))
        except (OSError, ValueError, TypeError):
            return config_composer.DEFAULT_AUTOCACHE

    def set_autocache(self, enabled):
        """Persist the bridge's audio-cache preference."""
        self.autocache = bool(enabled)
        try:
            with open(self._settings_file, "w", encoding="utf-8") as settings_file:
                json.dump({"autocache": self.autocache}, settings_file)
        except OSError:
            pass
        return self.autocache
