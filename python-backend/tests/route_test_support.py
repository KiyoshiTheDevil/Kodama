from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from typing import Generator, Iterable, Mapping, Protocol, cast, override
from unittest.mock import patch

from flask import Flask, Response

from src.routes import register_blueprints


class _DefaultOne:
    pass


_DEFAULT_ONE = _DefaultOne()


class JsonValue(Protocol):
    def __getitem__(self, key: str | int) -> JsonValue: ...
    def get(self, key: str, default: object = None) -> JsonValue: ...
    def __contains__(self, value: object) -> bool: ...
    def __len__(self) -> int: ...


class TestResponse(Protocol):
    status_code: int
    data: bytes
    json: JsonValue
    headers: Mapping[str, str]
    content_type: str
    def close(self) -> None: ...


class TestClient(Protocol):
    def get(self, path: str, **kwargs: object) -> TestResponse: ...
    def post(self, path: str, **kwargs: object) -> TestResponse: ...
    def delete(self, path: str, **kwargs: object) -> TestResponse: ...
    def put(self, path: str, **kwargs: object) -> TestResponse: ...
    def open(self, path: str, **kwargs: object) -> TestResponse: ...


class FakeCursor:
    def __init__(self, rows: Iterable[tuple[object, ...]] | None = None, one: tuple[object, ...] | None | _DefaultOne = _DEFAULT_ONE) -> None:
        self._rows = list(rows or [])
        self._one = one

    def fetchall(self) -> list[tuple[object, ...]]:
        return self._rows

    def fetchone(self) -> tuple[object, ...] | None:
        return (0,) if isinstance(self._one, _DefaultOne) else self._one


class FakeLocalDb:
    def __init__(self) -> None:
        self.liked_rows = []
        self.playlist_rows = [("local-pl", "Local Playlist", "Local description", 1)]
        self.playlist_tracks = [
            ("local-song", "set-local-song", "Local Song", "Local Artist", "Local Album", "http://img/local.jpg", "1:23")
        ]
        self.commits = 0

    def __enter__(self) -> FakeLocalDb:
        return self

    def __exit__(self, exc_type: object, exc: object, traceback: object) -> bool:
        return False

    def execute(self, sql: str, params: tuple[str, ...] = ()) -> FakeCursor:
        normalized = " ".join(sql.lower().split())
        if normalized.startswith("select video_id, title, artists"):
            return FakeCursor(self.liked_rows)
        if normalized.startswith("select video_id from liked_songs"):
            return FakeCursor([(row[0],) for row in self.liked_rows])
        if normalized.startswith("select playlist_id, title, description"):
            return FakeCursor(self.playlist_rows)
        if normalized.startswith("select title from playlists"):
            row = next((playlist for playlist in self.playlist_rows if playlist[0] == params[0]), None)
            return FakeCursor(one=(row[1],) if row else None)
        if normalized.startswith("select video_id, set_video_id"):
            return FakeCursor(self.playlist_tracks)
        if normalized.startswith("insert or replace into liked_songs"):
            self.liked_rows = [row for row in self.liked_rows if row[0] != params[0]]
            self.liked_rows.insert(0, params[:6])
            return FakeCursor()
        if normalized.startswith("insert into playlists"):
            playlist_id, title, description = params[:3]
            self.playlist_rows.insert(0, (playlist_id, title, description, 0))
            return FakeCursor()
        if normalized.startswith("delete from liked_songs"):
            self.liked_rows = [row for row in self.liked_rows if row[0] != params[0]]
            return FakeCursor()
        if normalized.startswith("delete from playlist_tracks"):
            return FakeCursor()
        if normalized.startswith("delete from playlists"):
            self.playlist_rows = [row for row in self.playlist_rows if row[0] != params[0]]
            return FakeCursor()
        if normalized.startswith("update playlists"):
            return FakeCursor()
        return FakeCursor()

    def commit(self) -> None:
        self.commits += 1


class FakeProfileRepository:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.metadata = {"default": {"displayName": "Default", "lastfm_session": "sk", "lastfm_user": "alice"}}
        self.auth_headers = {}
        self.local_profiles = set()
        self.deleted = []
        self.db = FakeLocalDb()
        self.profile_file_path("default").write_text("{}", encoding="utf-8")
        self.metadata_file_path("default").write_text("{}", encoding="utf-8")

    def metadata_file_path(self, name: str) -> Path:
        return self.root / f"{name}.metadata.json"

    def profile_file_path(self, name: str) -> Path:
        return self.root / f"{name}.headers.json"

    def write_auth_headers(self, name: str, headers: Mapping[str, str]) -> None:
        self.auth_headers[name] = dict(headers)
        self.profile_file_path(name).write_text(json.dumps(headers), encoding="utf-8")

    def remove_auth_headers(self, name: str) -> None:
        self.auth_headers.pop(name, None)
        try:
            self.profile_file_path(name).unlink()
        except FileNotFoundError:
            pass

    def read_metadata(self, name: str) -> dict[str, str]:
        return dict(self.metadata.get(name, {}))

    def write_metadata(self, name: str, metadata: Mapping[str, str]) -> None:
        self.metadata[name] = dict(metadata)
        self.metadata_file_path(name).write_text(json.dumps(metadata), encoding="utf-8")

    def update_metadata(self, name: str, **values: str) -> None:
        current = self.metadata.setdefault(name, {})
        current.update(values)
        self.write_metadata(name, current)

    def is_local(self, name: str) -> bool:
        return name in self.local_profiles

    def local_database(self, name: str) -> FakeLocalDb:
        self.local_profiles.add(name)
        return self.db

    def list_profiles(self, current: str | None) -> list[dict[str, str | bool]]:
        return [{"name": name, "current": name == current, **data} for name, data in sorted(self.metadata.items())]

    def delete_files(self, name: str) -> None:
        self.deleted.append(name)
        self.metadata.pop(name, None)


class FakeYoutubeClient:
    def __init__(self) -> None:
        self.ratings = []
        self.created_playlists = []
        self.added_playlist_items = []
        self.removed_playlist_items = []
        self.edited_playlists = []
        self.deleted_playlists = []
        self.subscribed_artists = []
        self.unsubscribed_artists = []

    def search(self, query: object, filter: object="songs", limit: object=20) -> object:
        if filter == "artists":
            return [{"browseId": "UCartist", "artist": "Artist", "subscribers": "12K", "thumbnails": cast(list[object], [])}]
        if filter == "albums":
            return [{"browseId": "MPREb", "title": "Album", "artists": [{"name": "Artist"}], "year": "2026"}]
        return [
            {
                "videoId": "vid",
                "title": "Song",
                "artists": [{"name": "Artist", "id": "UCartist"}],
                "album": {"name": "Album", "id": "MPREb"},
                "duration": "3:00",
                "thumbnails": [{"url": "http://img/s.jpg", "width": 60}],
            }
        ]

    def get_home(self, limit: object=15) -> object:
        return [
            {
                "title": "Listen again",
                "contents": [
                    {
                        "videoId": "vid",
                        "title": "Song",
                        "artists": [{"name": "Artist", "id": "UCartist"}],
                        "album": {"name": "Album", "id": "MPREb"},
                        "thumbnails": cast(list[object], []),
                    }
                ],
            },
            {
                "title": "Podcast episodes",
                "contents": [{"videoId": "ep", "browseId": "MPEP", "title": "Episode", "description": "Show", "thumbnails": cast(list[object], [])}],
            },
        ]

    def get_artist_albums(self, channel_id: object, params: object) -> object:
        return [{"browseId": "MPREb", "title": "Album", "year": "2026", "type": "Album", "thumbnails": cast(list[object], [])}]

    def get_liked_songs(self, limit: object=None) -> object:
        return {"tracks": self.search("liked")}

    def rate_song(self, video_id: object, rating: object) -> object:
        self.ratings.append((video_id, rating))

    def get_library_playlists(self, limit: object=50) -> object:
        return [{"playlistId": "pl", "title": "Playlist", "count": "2", "thumbnails": [{"url": "http://img/pl.jpg"}]}]

    def get_library_albums(self, limit: object=50) -> object:
        return [{"browseId": "alb", "title": "Album", "artists": [{"name": "Artist"}], "year": "2026", "thumbnails": cast(list[object], [])}]

    def get_library_artists(self, limit: object=50) -> object:
        return [{"browseId": "artist", "artist": "Artist", "songs": "10", "thumbnails": cast(list[object], [])}]

    def create_playlist(self, title: object, description: object, privacy_status: object="PRIVATE", video_ids: object=None) -> object:
        self.created_playlists.append((title, description, privacy_status, video_ids))
        return "created-pl"

    def add_playlist_items(self, playlist_id: object, video_ids: object) -> object:
        self.added_playlist_items.append((playlist_id, video_ids))

    def remove_playlist_items(self, playlist_id: object, videos: object) -> object:
        self.removed_playlist_items.append((playlist_id, videos))

    def edit_playlist(self, playlist_id: object, **values: object) -> object:
        self.edited_playlists.append((playlist_id, values))

    def delete_playlist(self, playlist_id: object) -> object:
        self.deleted_playlists.append(playlist_id)

    def get_playlist(self, playlist_id: object, limit: object=None) -> object:
        return {
            "title": "Playlist",
            "thumbnails": [{"url": "http://img/pl-small.jpg"}, {"url": "http://img/pl-large.jpg"}],
            "tracks": self.search("playlist"),
        }

    def get_watch_playlist(self, playlistId: object, limit: object=50) -> object:
        return {"tracks": self.search("radio")}

    def get_album(self, browse_id: object) -> object:
        return {
            "title": "Album",
            "artists": [{"name": "Artist", "id": "UCartist"}],
            "year": "2026",
            "thumbnails": [{"url": "http://img/album.jpg"}],
            "tracks": self.search("album"),
        }

    def get_artist(self, browse_id: object) -> object:
        return {
            "name": "Artist",
            "description": "Artist description",
            "thumbnails": [{"url": "http://img/artist.jpg"}],
            "subscribers": "12K",
            "monthlyListeners": "1M",
            "radioId": "RDEM",
            "subscribed": False,
            "channelId": "UCartist",
            "songs": {"browseId": "VLsongs", "results": self.search("artist")},
            "albums": {"browseId": "MPADALBUMS", "params": "albums-param", "results": self.get_library_albums()},
            "singles": {"browseId": "MPADSINGLES", "params": "singles-param", "results": self.get_library_albums()},
            "videos": {"results": [{"videoId": "video", "title": "Video", "artists": [{"name": "Artist"}], "views": "1K", "thumbnails": cast(list[object], [])}]},
            "related": {"results": [{"browseId": "related", "title": "Related", "subscribers": "5K", "thumbnails": cast(list[object], [])}]},
        }

    def subscribe_artists(self, channel_ids: object) -> object:
        self.subscribed_artists.append(channel_ids)

    def unsubscribe_artists(self, channel_ids: object) -> object:
        self.unsubscribed_artists.append(channel_ids)

    def get_song(self, video_id: object) -> object:
        return {
            "videoDetails": {
                "videoId": video_id,
                "title": "Song",
                "author": "Artist",
                "lengthSeconds": "185",
                "thumbnail": {"thumbnails": [{"url": "http://img/song-small.jpg"}, {"url": "http://img/song-large.jpg"}]},
            },
            "microformat": {"microformatDataRenderer": {"uploadDate": "2024-05-12"}},
        }

    def get_podcast(self, playlist_id: object, limit: object=50) -> object:
        return {
            "title": "Podcast",
            "description": "Podcast description",
            "author": {"name": "Host", "id": "UChost"},
            "thumbnails": [{"url": "http://img/podcast.jpg"}],
            "episodes": [
                {
                    "videoId": "episode",
                    "browseId": "MPEPISODE",
                    "title": "Episode",
                    "description": "Episode description",
                    "duration": "42:00",
                    "date": "2026-07-11",
                    "thumbnails": [{"url": "http://img/episode.jpg"}],
                },
                {"title": "Trailer without video"},
            ],
        }

    def get_mood_categories(self) -> object:
        return {
            "For you": [
                {"title": "Energize", "params": "energy"},
                {"title": "Duplicate", "params": "energy"},
            ],
            "Genres": [{"title": "Jazz", "params": "jazz"}],
        }

    def _send_request(self, endpoint: object, payload: object) -> object:
        renderer = {
            "title": {"runs": [{"text": "Mood Playlist"}]},
            "subtitle": {"runs": [{"text": "Kodama Mix"}]},
            "thumbnailRenderer": {
                "musicThumbnailRenderer": {
                    "thumbnail": {"thumbnails": [{"url": "http://img/mood.jpg"}]}
                }
            },
            "navigationEndpoint": {"watchPlaylistEndpoint": {"playlistId": "mood-pl"}},
        }
        duplicate_renderer = {
            **renderer,
            "title": {"runs": [{"text": "Duplicate Mood Playlist"}]},
        }
        song_renderer = {
            "title": {"runs": [{"text": "Mood Song"}]},
            "subtitle": {"runs": [{"text": "Mood Artist"}]},
            "navigationEndpoint": {"watchEndpoint": {"videoId": "mood-song", "playlistId": "mood-radio"}},
        }
        return {
            "contents": {
                "singleColumnBrowseResultsRenderer": {
                    "tabs": [
                        {
                            "tabRenderer": {
                                "content": {
                                    "sectionListRenderer": {
                                        "contents": [
                                            {"gridRenderer": {"items": [{"musicTwoRowItemRenderer": renderer}]}},
                                            {
                                                "musicCarouselShelfRenderer": {
                                                    "contents": [
                                                        {"musicTwoRowItemRenderer": duplicate_renderer},
                                                        {"musicTwoRowItemRenderer": song_renderer},
                                                    ]
                                                }
                                            },
                                        ]
                                    }
                                }
                            }
                        }
                    ]
                }
            }
        }


class FakeMusicSession:
    def __init__(self) -> None:
        self.state = SimpleNamespace(
            adding_account=False,
            current_profile="default",
            ytm=object(),
            playlist_cache={"cached": {"playlist": []}},
        )
        self.client = FakeYoutubeClient()

    def prepare_auth_headers(self, headers: Mapping[str, str]) -> dict[str, str | bool]:
        return {"prepared": True, **headers}

    def activate_verified_profile(self, name: str) -> bool:
        self.state.current_profile = name
        self.state.ytm = object()
        return True

    def refresh_account_info(self, name: str) -> None:
        return None

    def activate_profile(self, name: str) -> bool:
        if name == "missing":
            return False
        self.state.current_profile = name
        self.state.ytm = object()
        return True

    def apply_webview_cookies(self, cookie_string: str) -> tuple[bool, str | None, bool]:
        if not cookie_string:
            return False, "invalid", False
        return True, None, "PSIDTS=" in cookie_string

    def clear_active_profile(self) -> None:
        self.state.current_profile = None
        self.state.ytm = None

    def autoload_first_profile(self) -> None:
        self.state.current_profile = "default"
        self.state.ytm = object()

    def get_active_client(self) -> FakeYoutubeClient:
        return self.client


class FakeCacheSettings:
    def __init__(self) -> None:
        self.enabled = {"playlists": True, "albums": True, "images": True, "songs": True, "lyrics": True}

    def update(self, values: Mapping[str, bool]) -> None:
        self.enabled.update(values)


class FakeNetworkSettings:
    def __init__(self) -> None:
        self.ipv4_first_enabled = True

    def set_ipv4_first_enabled(self, enabled: bool) -> None:
        self.ipv4_first_enabled = enabled


class FakeLastFM:
    def __init__(self) -> None:
        self.calls = []
        self.enabled = True

    def lastfm_enabled(self) -> bool:
        return self.enabled

    def lastfm_call(self, method: str, params: Mapping[str, str] | None = None, http: str = "POST", signed: bool = False) -> tuple[bool, dict[str, object]]:
        self.calls.append((method, params or {}, http, signed))
        if method == "auth.getToken":
            return True, {"token": "tok"}
        if method == "auth.getSession":
            return True, {"session": {"key": "new-sk", "name": "bob"}}
        return True, {}


class FakeLyricsService:
    def __init__(self) -> None:
        self.custom = {}

    def get_lyrics(self, **kwargs: str) -> dict[str, object]:
        return {"source": kwargs["source"], "title": kwargs["title"], "lyrics": []}

    def romanize(self, lines: list[str]) -> list[str]:
        return [f"ro:{line}" for line in lines]

    def translate(self, lines: list[str], target_lang: str) -> list[str]:
        return [f"{target_lang}:{line}" for line in lines]

    def save_custom(self, video_id: str, content: str, lyric_format: str) -> None:
        self.custom[video_id] = {"videoId": video_id, "content": content, "format": lyric_format}

    def get_custom(self, video_id: str) -> dict[str, str] | None:
        return self.custom.get(video_id)

    def delete_custom(self, video_id: str) -> bool:
        return self.custom.pop(video_id, None) is not None

    def unison_versions(self, **kwargs: str) -> list[dict[str, str]]:
        return [{"id": "lyr", "videoId": kwargs["video_id"]}]

    def display_name(self, key_id: str | None) -> str:
        return f"name:{key_id}"


class FakeUpstream:
    def __init__(self, status_code: int = 206, content: bytes = b"audio", content_type: str = "audio/mp4") -> None:
        self.status_code = status_code
        self.content = content
        self.headers = {"Content-Type": content_type, "Content-Length": str(len(content))}

    def iter_content(self, chunk_size: int = 65536) -> Generator[bytes, None, None]:
        yield self.content

    def raise_for_status(self) -> None:
        return None


class FakeStreamService:
    def __init__(self) -> None:
        self.warmed = []

    def resolve_stream(self, video_id: str) -> tuple[dict[str, str], int]:
        return {"url": f"https://stream/{video_id}"}, 200

    def prepare_download(self, video_id: str) -> tuple[dict[str, str], int]:
        return {"path": f"/tmp/{video_id}.m4a"}, 200

    def open_audio_stream(self, video_id: str, range_header: str | None = None) -> tuple[FakeUpstream | None, tuple[dict[str, str], int] | None]:
        if video_id == "error":
            return None, ({"error": "failed"}, 502)
        return FakeUpstream(), None

    def build_proxy_headers(self, upstream: FakeUpstream) -> dict[str, str]:
        return {"Accept-Ranges": "bytes", "Content-Length": upstream.headers["Content-Length"]}

    def iter_upstream(self, upstream: FakeUpstream) -> Generator[bytes, None, None]:
        yield upstream.content

    def warm(self, video_id: str) -> bool:
        self.warmed.append(video_id)
        return True


class FakeComposerBridge:
    EXPOSED_HEADERS = "x-track-title,x-track-artist"

    def __init__(self, root: Path) -> None:
        self.root = root
        self.dist = self.root / "composer_dist"
        self.dist.mkdir()
        (self.dist / "index.html").write_text("<main>Composer</main>", encoding="utf-8")
        self.audio_file = self.root / "cached.m4a"
        self.audio_file.write_bytes(b"cached audio")
        self.autocache_enabled = True

    def composer_dist_directory(self) -> Path:
        return self.dist

    def set_autocache_enabled(self, enabled: bool) -> None:
        self.autocache_enabled = enabled

    def track_metadata(self, video_id: str) -> dict[str, str]:
        return {"title": "Song", "artist": "Artist"}

    def cached_audio_path(self, video_id: str) -> Path | None:
        return self.audio_file if video_id == "cached" else None

    def audio_mime_type(self, path: Path) -> str:
        return "audio/mp4"

    def open_audio_stream(self, video_id: str) -> FakeUpstream:
        return FakeUpstream(status_code=200, content=b"upstream")

    def stream_with_optional_cache(self, video_id: str, upstream: FakeUpstream) -> Generator[bytes, None, None]:
        yield upstream.content

    def thumbnail(self, video_id: str) -> tuple[bytes, str] | None:
        if video_id == "missing":
            return None
        return b"png", "image/png"


class FakePlaylistCache:
    @staticmethod
    def memory_key(playlist_id: object, profile_name: object) -> object:
        return (profile_name or "default", playlist_id)

    def __init__(self) -> None:
        self.playlist_cache = {}
        self.disk = {}
        self.purged = []
        self.saved = []

    def purge_playlist_cache(self, playlist_id: object, profile_name: object) -> object:
        self.purged.append((playlist_id, profile_name))
        self.discard_memory(playlist_id, profile_name)
        self.disk.pop((profile_name, playlist_id), None)

    def get_memory(self, playlist_id: object, profile_name: object) -> object:
        return self.playlist_cache.get(self.memory_key(playlist_id, profile_name))

    def discard_memory(self, playlist_id: object, profile_name: object) -> object:
        self.playlist_cache.pop(self.memory_key(playlist_id, profile_name), None)

    def clear_memory(self) -> object:
        self.playlist_cache.clear()

    def load_playlist_disk(self, playlist_id: object, profile_name: object) -> object:
        return self.disk.get((profile_name, playlist_id))

    def save_playlist_disk(self, playlist_id: object, profile_name: object, data: object) -> object:
        self.saved.append((playlist_id, profile_name, data))
        self.disk[(profile_name, playlist_id)] = data

    def put(self, playlist_id: object, profile_name: object, data: object) -> object:
        self.playlist_cache[self.memory_key(playlist_id, profile_name)] = data


class FakeAlbumCache:
    def __init__(self) -> None:
        self.disk = {}
        self.saved = []

    def load_album_disk(self, browse_id: object) -> object:
        return self.disk.get(browse_id)

    def save_album_disk(self, browse_id: object, data: object) -> object:
        self.saved.append((browse_id, data))
        self.disk[browse_id] = data


class FakeSongCreditsCache:
    def __init__(self) -> None:
        self.entries = {}

    def get(self, video_id: object) -> object:
        return self.entries.get(video_id)

    def put(self, video_id: object, payload: object) -> object:
        self.entries[video_id] = payload

    def clear(self) -> object:
        self.entries.clear()


class FakeDownloadService:
    def __init__(self, root: Path) -> None:
        self.root = root
        self.status = {}
        self.queue = {}
        self.started = []
        self.deleted = []
        self.cached = {}
        self.cached_meta = [{"videoId": "cached", "title": "Cached Song"}]

    def add_cached(self, video_id: str, suffix: str = ".opus", content: bytes = b"cached audio") -> Path:
        path = self.root / f"{video_id}{suffix}"
        path.write_bytes(content)
        self.cached[video_id] = path
        return path

    def song_audio_path(self, video_id: str) -> Path | None:
        return self.cached.get(video_id)

    @staticmethod
    def audio_mime_type(path: Path) -> str:
        suffix = path.suffix.lower()
        return {
            ".opus": "audio/opus",
            ".m4a": "audio/mp4",
            ".webm": "audio/webm",
            ".mp3": "audio/mpeg",
        }.get(suffix, "application/octet-stream")

    def start(self, video_id: str, meta: Mapping[str, object]) -> None:
        self.started.append((video_id, meta))
        self.status[video_id] = "downloading"
        self.queue[video_id] = {
            "videoId": video_id,
            "title": meta.get("title", ""),
            "artists": meta.get("artists", ""),
            "thumbnail": meta.get("thumbnail", ""),
            "status": "downloading",
            "progress": 0.0,
        }

    def queue_snapshot(self) -> list[dict[str, object]]:
        return list(self.queue.values())

    def list_cached(self) -> list[dict[str, str]]:
        return list(self.cached_meta)

    def delete_cached(self, video_id: str) -> None:
        self.deleted.append(video_id)
        self.cached.pop(video_id, None)
        self.status.pop(video_id, None)


class FakeExportService:
    def __init__(self) -> None:
        self.status = {}
        self.started = []

    def start(self, video_id: object, output_path: object, fmt: object, meta: object) -> object:
        self.started.append((video_id, output_path, fmt, meta))
        self.status[video_id] = "exporting"


class FakeFFmpeg:
    def __init__(self) -> None:
        self.is_available = True
        self.download_forces = []
        self.update_payload = {"installed": "7.0", "latest": "8.0", "updateAvailable": True}

    def available(self) -> object:
        return self.is_available

    def check_update(self) -> object:
        return dict(self.update_payload)

    def download_stream(self, force: bool = False) -> Generator[str, None, None]:
        self.download_forces.append(force)
        yield 'data: {"status": "progress", "percent": 50}\n\n'
        yield 'data: {"status": "done"}\n\n'


class FakeYTDLP:
    def __init__(self) -> None:
        self.update_payload = {"ok": True, "version": "2026.07.11"}
        self.update_status = 200
        self.check_payload = {"installed": "2026.01.01", "latest": "2026.07.11", "updateAvailable": True}

    def check_update(self) -> object:
        return dict(self.check_payload)

    def update(self) -> object:
        return dict(self.update_payload), self.update_status


class FakeOverlayServer:
    def __init__(self) -> None:
        self.state = {}
        self.config: dict[str, object] = {"version": 2, "canvas": {"width": 400}, "layers": cast(list[object], [])}
        self.started_ports = []
        self.stopped = 0
        self.running = False

    def page_response(self) -> object:
        response = Response("<main>Overlay</main>", content_type="text/html; charset=utf-8")
        response.headers["X-Frame-Options"] = "ALLOWALL"
        return response

    def stream_response(self) -> object:
        return Response('data: {"title": "Song"}\n\n', content_type="text/event-stream")

    def update_state(self, data: Mapping[str, object] | None) -> None:
        self.state.update(data or {})

    def set_config(self, config: Mapping[str, object] | None) -> None:
        self.config = dict(config or {})

    def get_config(self) -> object:
        return dict(self.config)

    def start(self, port: object) -> object:
        self.started_ports.append(port)
        self.running = True
        return True

    def stop(self) -> object:
        self.stopped += 1
        self.running = False

    def status(self) -> object:
        return {"running": self.running, "clients": 0}


class FakeRemoteControl:
    def __init__(self) -> None:
        self.enabled = False
        self.token: str | None = None
        self.state: dict[str, object] = {"title": "", "isPlaying": False}
        self.devices = {}
        self.commands = []
        self.pushed_states = []

    def enable(self, data: Mapping[str, object]) -> dict[str, object]:
        self.enabled = bool(data.get("enabled"))
        raw_token = data.get("token")
        self.token = raw_token if self.enabled and isinstance(raw_token, str) else "tok" if self.enabled else None
        if self.enabled:
            trusted_devices = data.get("trusted")
            for trusted in trusted_devices if isinstance(trusted_devices, list) else []:
                if not isinstance(trusted, dict):
                    continue
                device_id = trusted.get("id")
                if isinstance(device_id, str):
                    self.devices[device_id] = {
                        "name": trusted.get("name", "Device"),
                        "status": "approved",
                    }
        else:
            self.devices.clear()
            self.commands.clear()
        return {"enabled": self.enabled, "token": self.token, "port": 9847, "ips": ["127.0.0.1"]}

    def status_payload(self) -> object:
        devices = [
            {"id": device_id, "name": device["name"], "status": device["status"], "online": True}
            for device_id, device in self.devices.items()
        ]
        return {"enabled": self.enabled, "token": self.token, "port": 9847, "ips": ["127.0.0.1"], "devices": devices}

    def device_action(self, data: Mapping[str, object]) -> tuple[dict[str, object], int]:
        device_id = data.get("id")
        if not isinstance(device_id, str):
            return {"error": "unknown"}, 404
        device = self.devices.get(device_id)
        if not device:
            return {"error": "unknown"}, 404
        if data.get("action") == "approve":
            device["status"] = "approved"
        elif data.get("action") in ("deny", "remove"):
            self.devices.pop(device_id, None)
        return {"ok": True}, 200

    def push_state(self, data: Mapping[str, object]) -> None:
        self.pushed_states.append(dict(data or {}))
        self.state.update(data)

    def poll(self) -> list[str]:
        commands, self.commands = self.commands, cast(list[str], [])
        return commands

    def sync(self, data: Mapping[str, object]) -> list[str]:
        state = data.get("state")
        if isinstance(state, dict):
            self.state.update(state)
        return self.poll()

    def hello(self, data: Mapping[str, object]) -> tuple[dict[str, object], int]:
        if data.get("token") != self.token:
            return {"error": "invalid_token"}, 403
        device_id = data.get("deviceId")
        if not isinstance(device_id, str) or not device_id:
            return {"error": "no_device"}, 400
        self.devices.setdefault(device_id, {"name": data.get("name", "Device"), "status": "pending"})
        return {"status": self.devices[device_id]["status"]}, 200

    def get_state(self, token: str | None, device_id: str | None) -> tuple[dict[str, object], int]:
        if token != self.token:
            return {"error": "invalid_token"}, 403
        device = self.devices.get(device_id or "")
        if not device:
            return {"status": "unknown"}, 200
        if device["status"] != "approved":
            return {"status": device["status"]}, 200
        return {"status": "approved", "state": self.state}, 200

    def command(self, data: Mapping[str, object]) -> tuple[dict[str, object], int]:
        if data.get("token") != self.token:
            return {"error": "invalid_token"}, 403
        raw_device_id = data.get("deviceId")
        device = self.devices.get(raw_device_id) if isinstance(raw_device_id, str) else None
        if not device or device["status"] != "approved":
            return {"error": "not_allowed"}, 403
        action = data.get("action")
        if not isinstance(action, str) or action not in ("playpause", "next", "prev", "shuffle", "repeat"):
            return {"error": "bad_action"}, 400
        self.commands.append(action)
        return {"ok": True}, 200

    def page_html(self) -> object:
        return "<main>Remote</main>"


class RouteTestCase(unittest.TestCase):
    @override
    def setUp(self) -> None:
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.app = Flask(__name__)
        self.app.config["TESTING"] = True
        self.profile_repository = FakeProfileRepository(self.root)
        self.music_session = FakeMusicSession()
        self.cache_settings = FakeCacheSettings()
        self.network_settings = FakeNetworkSettings()
        self.lastfm = FakeLastFM()
        self.lyrics = FakeLyricsService()
        self.composer = FakeComposerBridge(self.root)
        self.stream = FakeStreamService()
        self.playlist_cache = FakePlaylistCache()
        self.album_cache = FakeAlbumCache()
        self.song_credits_cache = FakeSongCreditsCache()
        self.download_service = FakeDownloadService(self.root)
        self.export_service = FakeExportService()
        self.ffmpeg = FakeFFmpeg()
        self.ytdlp = FakeYTDLP()
        self.overlay_server = FakeOverlayServer()
        self.remote_control = FakeRemoteControl()
        self.app.extensions.update(
            {
                "profile_repository": self.profile_repository,
                "youtube_music_session": self.music_session,
                "cache_settings": self.cache_settings,
                "network_settings": self.network_settings,
                "lastfm_client": self.lastfm,
                "lyrics_service": self.lyrics,
                "composer_bridge": self.composer,
                "stream_service": self.stream,
                "playlist_cache": self.playlist_cache,
                "album_cache": self.album_cache,
                "song_credits_cache": self.song_credits_cache,
                "download_service": self.download_service,
                "export_service": self.export_service,
                "ffmpeg": self.ffmpeg,
                "ytdlp": self.ytdlp,
                "overlay_server": self.overlay_server,
                "remote_control": self.remote_control,
                "server_start_time": 1000.0,
                "feedback_webhook_url": "",
            }
        )
        with patch("builtins.print"):
            register_blueprints(self.app)
        self.client: TestClient = cast(TestClient, self.app.test_client())

        self.cache_dirs = SimpleNamespace(
            PLAYLIST_CACHE_DIR=self.root / "playlist_cache",
            ALBUM_CACHE_DIR=self.root / "album_cache",
            IMG_CACHE_DIR=self.root / "img_cache",
            SONG_CACHE_DIR=self.root / "song_cache",
            LYRICS_CACHE_DIR=self.root / "lyrics_cache",
        )
        for path in vars(self.cache_dirs).values():
            path.mkdir()
            (path / "item.txt").write_text("cached", encoding="utf-8")
        (self.cache_dirs.SONG_CACHE_DIR / "song.json").write_text("{}", encoding="utf-8")

        self.addCleanup(self.temp.cleanup)
