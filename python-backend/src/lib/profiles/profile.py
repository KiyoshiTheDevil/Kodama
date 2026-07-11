"""Filesystem operations for browser-auth and local profiles."""

import json
import os
import shutil
import sqlite3
from contextlib import contextmanager

from src.config import PROJECT_ROOT, config_dirs

from .meta import Meta


class Profile:
    """Locates profile files and identifies local-only profiles."""

    def __init__(self, profiles_dir=None, meta=None):
        self._profiles_dir = profiles_dir or config_dirs.PROFILES_DIR
        self._meta = meta or Meta()

    @property
    def directory(self):
        return self._profiles_dir

    # Old server.py: profile_path
    def profile_file_path(self, name):
        return os.path.join(self._profiles_dir, f"{name}.json")

    # Old server.py: local_db_path
    def local_database_path(self, name):
        return os.path.join(self._profiles_dir, f"{name}.db")

    def metadata_file_path(self, name):
        return self._meta.meta_path(name)

    def update_metadata(self, name, **updates):
        """Merge fields into a profile's metadata file and persist the result."""
        metadata = self.read_metadata(name)
        metadata.update(updates)
        self.write_metadata(name, metadata)
        return metadata

    def read_metadata(self, name):
        """Return a profile's metadata, or an empty mapping when it is absent."""
        return self._read_metadata(name)

    def write_metadata(self, name, metadata):
        """Persist a complete profile metadata mapping."""
        with open(self.metadata_file_path(name), "w", encoding="utf-8") as meta_file:
            json.dump(metadata, meta_file)

    def delete_files(self, name):
        """Delete browser-auth, metadata, and local-database files for a profile."""
        for path in (self.profile_file_path(name), self.metadata_file_path(name), self.local_database_path(name)):
            if os.path.exists(path):
                os.remove(path)

    # Old server.py: is_local_profile
    def is_local(self, name):
        if not name:
            return False
        path = self._meta.meta_path(name)
        if not os.path.exists(path):
            return False
        try:
            with open(path, encoding="utf-8") as profile_meta:
                return json.load(profile_meta).get("type") == "local"
        except (OSError, ValueError, TypeError):
            return False

    # Old server.py: get_local_db
    def open_local_database(self, name):
        """Open or create the SQLite database for a local profile."""
        database = sqlite3.connect(self.local_database_path(name), check_same_thread=False)
        database.execute("PRAGMA journal_mode=WAL")
        database.executescript(
            """
            CREATE TABLE IF NOT EXISTS liked_songs (
                video_id TEXT PRIMARY KEY,
                title TEXT, artists TEXT, album TEXT,
                thumbnail TEXT, duration TEXT,
                liked_at INTEGER
            );
            CREATE TABLE IF NOT EXISTS playlists (
                playlist_id TEXT PRIMARY KEY,
                title TEXT, description TEXT,
                privacy TEXT DEFAULT 'PRIVATE',
                created_at INTEGER, updated_at INTEGER
            );
            CREATE TABLE IF NOT EXISTS playlist_tracks (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                playlist_id TEXT, video_id TEXT,
                title TEXT, artists TEXT, album TEXT,
                thumbnail TEXT, duration TEXT,
                set_video_id TEXT,
                position INTEGER, added_at INTEGER
            );
            """
        )
        database.commit()
        return database

    # Old server.py: local_db
    @contextmanager
    def local_database(self, name):
        """Yield a local-profile database and always close it afterwards."""
        database = self.open_local_database(name)
        try:
            yield database
        finally:
            database.close()

    # Old server.py: get_profiles
    def list_profiles(self, active_profile=None):
        """Return Google, local, and logged-out profiles from profile storage."""
        profiles = []
        seen = set()
        for path in self.directory.glob("*.json"):
            name = path.stem
            if name.endswith(".meta") or name in seen:
                continue
            meta = self._read_metadata(name)
            if meta.get("type") == "local":
                continue
            seen.add(name)
            profiles.append(
                {
                    "name": name,
                    "displayName": meta.get("displayName", name),
                    "handle": meta.get("handle", ""),
                    "avatar": meta.get("avatar", ""),
                    "type": "google",
                    "active": name == active_profile,
                }
            )

        for path in self.directory.glob("*.meta.json"):
            name = path.name[: -len(".meta.json")]
            if name in seen:
                continue
            meta = self._read_metadata(name)
            if not meta:
                continue
            if meta.get("type") == "local":
                seen.add(name)
                profiles.append(
                    {
                        "name": name,
                        "displayName": meta.get("displayName", name),
                        "handle": "",
                        "avatar": "",
                        "type": "local",
                        "active": name == active_profile,
                    }
                )
            elif meta.get("logged_out"):
                seen.add(name)
                profiles.append(
                    {
                        "name": name,
                        "displayName": meta.get("displayName", name),
                        "handle": meta.get("handle", ""),
                        "avatar": meta.get("avatar", ""),
                        "type": "google",
                        "active": False,
                        "loggedOut": True,
                    }
                )
        return profiles

    # Old server.py: migrate_legacy
    def migrate_legacy_browser_profile(self, active_profile=None):
        """Copy the legacy browser.json profile into profile storage once."""
        legacy_path = PROJECT_ROOT / "browser.json"
        if legacy_path.exists() and not self.list_profiles(active_profile):
            shutil.copy(str(legacy_path), self.profile_file_path("default"))
            with open(self.metadata_file_path("default"), "w", encoding="utf-8") as meta_file:
                json.dump({"displayName": "Standard"}, meta_file)
            print("[i] browser.json zu profiles/default.json migriert")

    def _read_metadata(self, name):
        try:
            with open(self.metadata_file_path(name), encoding="utf-8") as meta_file:
                return json.load(meta_file)
        except (OSError, ValueError, TypeError):
            return {}
