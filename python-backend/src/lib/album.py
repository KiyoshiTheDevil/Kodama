"""Reserved home for album-specific helpers during the next extraction pass."""
import json
import os
import time

from src.config import config


class Album:
    def album_disk_path(self, browse_id):
        safe = browse_id.replace("/", "_").replace("\\", "_")
        return os.path.join(config.ALBUM_CACHE_DIR, f"{safe}.json")

    def load_album_disk(self, browse_id):
        path = self.album_disk_path(browse_id)
        if not os.path.exists(path):
            return None
        if time.time() - os.path.getmtime(path) > config.ALBUM_CACHE_TTL:
            return None
        try:
            with open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            # Invalidate old caches that don't have isExplicit yet
            tracks = data.get("tracks", [])
            if tracks and "isExplicit" not in tracks[0]:
                return None
            return data
        except Exception:
            return None

    def save_album_disk(self, browse_id, data):
        path = self.album_disk_path(browse_id)
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False)
        except Exception:
            pass
