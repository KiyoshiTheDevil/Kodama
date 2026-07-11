"""In-memory playlist cache helper."""

import collections
import json
import os
import time

from src.config import config_ytmusic


class Playlist:
    def __init__(self):
        self.playlist_cache = collections.OrderedDict()

    def playlist_disk_path(self, playlist_id):
        profile = _current_profile or "default" # idk
        safe = playlist_id.replace("/", "_").replace("\\", "_")
        return os.path.join(config_ytmusic.PLAYLIST_CACHE_DIR, f"{profile}_{safe}.json")

    def load_playlist_disk(self, playlist_id, ttl=config_ytmusic.PLAYLIST_CACHE_TTL):
        path = self.playlist_disk_path(playlist_id)
        if not os.path.exists(path):
            return None
        if time.time() - os.path.getmtime(path) > ttl:
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

    def save_playlist_disk(self, playlist_id, data):
        path = self.playlist_disk_path(playlist_id)
        try:
            with open(path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False)
        except Exception:
            pass

    def purge_playlist_cache(self, playlist_id):
        self.playlist_cache.pop(playlist_id, None)
        p = self.playlist_disk_path(playlist_id)
        if os.path.exists(p):
            os.remove(p)

    def put(self, playlist_id: str, data) -> None:
        """Insert/update a playlist and evict the least-recently-used entry."""
        self.playlist_cache[playlist_id] = data
        self.playlist_cache.move_to_end(playlist_id)
        while len(self.playlist_cache) > config_ytmusic.PLAYLIST_CACHE_MAX:
            self.playlist_cache.popitem(last=False)
