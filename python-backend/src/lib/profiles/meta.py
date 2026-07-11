"""Read and write profile metadata files."""

import json
import os
from typing import Optional

from src.config import config_dirs


class Meta:
    @staticmethod
    def active_meta_path(profile_name: Optional[str] = None):
        profile = profile_name or "default"
        return config_dirs.PROFILES_DIR / f"{profile}.meta.json"

    def read_active_meta(self, profile_name: Optional[str] = None) -> dict:
        try:
            with self.active_meta_path(profile_name).open(encoding="utf-8") as meta_file:
                return json.load(meta_file)
        except (OSError, ValueError, TypeError):
            return {}

    def write_active_meta(self, meta: dict, profile_name: Optional[str] = None) -> None:
        with self.active_meta_path(profile_name).open("w", encoding="utf-8") as meta_file:
            json.dump(meta, meta_file)

    def meta_path(self, name):
        return os.path.join(config_dirs.PROFILES_DIR, f"{name}.meta.json")
