import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from flask import Flask, Response

from src.routes import register_blueprints


_DEFAULT_ONE = object()


class FakeCursor:
    def __init__(self, rows=None, one=_DEFAULT_ONE):
        self._rows = rows or []
        self._one = one

    def fetchall(self):
        return self._rows

    def fetchone(self):
        return (0,) if self._one is _DEFAULT_ONE else self._one


class FakeLocalDb:
    def __init__(self):
        self.liked_rows = []
        self.playlist_rows = [("local-pl", "Local Playlist", "Local description", 1)]
        self.playlist_tracks = [
            ("local-song", "set-local-song", "Local Song", "Local Artist", "Local Album", "http://img/local.jpg", "1:23")
        ]
        self.commits = 0

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, traceback):
        return False

    def execute(self, sql, params=()):
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

    def commit(self):
        self.commits += 1


class FakeProfileRepository:
    def __init__(self, root):
        self.root = Path(root)
        self.metadata = {"default": {"displayName": "Default", "lastfm_session": "sk", "lastfm_user": "alice"}}
        self.auth_headers = {}
        self.local_profiles = set()
        self.deleted = []
        self.db = FakeLocalDb()
        self.profile_file_path("default").write_text("{}", encoding="utf-8")
        self.metadata_file_path("default").write_text("{}", encoding="utf-8")

    def metadata_file_path(self, name):
        return self.root / f"{name}.metadata.json"

    def profile_file_path(self, name):
        return self.root / f"{name}.headers.json"

    def write_auth_headers(self, name, headers):
        self.auth_headers[name] = dict(headers)
        self.profile_file_path(name).write_text(json.dumps(headers), encoding="utf-8")

    def remove_auth_headers(self, name):
        self.auth_headers.pop(name, None)
        try:
            self.profile_file_path(name).unlink()
        except FileNotFoundError:
            pass

    def read_metadata(self, name):
        return dict(self.metadata.get(name, {}))

    def write_metadata(self, name, metadata):
        self.metadata[name] = dict(metadata)
        self.metadata_file_path(name).write_text(json.dumps(metadata), encoding="utf-8")

    def update_metadata(self, name, **values):
        current = self.metadata.setdefault(name, {})
        current.update(values)
        self.write_metadata(name, current)

    def is_local(self, name):
        return name in self.local_profiles

    def local_database(self, name):
        self.local_profiles.add(name)
        return self.db

    def list_profiles(self, current):
        return [{"name": name, "current": name == current, **data} for name, data in sorted(self.metadata.items())]

    def delete_files(self, name):
        self.deleted.append(name)
        self.metadata.pop(name, None)


class FakeYoutubeClient:
    def __init__(self):
        self.ratings = []
        self.created_playlists = []
        self.added_playlist_items = []
        self.removed_playlist_items = []
        self.edited_playlists = []
        self.deleted_playlists = []
        self.subscribed_artists = []
        self.unsubscribed_artists = []

    def search(self, query, filter="songs", limit=20):
        if filter == "artists":
            return [{"browseId": "UCartist", "artist": "Artist", "subscribers": "12K", "thumbnails": []}]
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

    def get_home(self, limit=15):
        return [
            {
                "title": "Listen again",
                "contents": [
                    {
                        "videoId": "vid",
                        "title": "Song",
                        "artists": [{"name": "Artist", "id": "UCartist"}],
                        "album": {"name": "Album", "id": "MPREb"},
                        "thumbnails": [],
                    }
                ],
            },
            {
                "title": "Podcast episodes",
                "contents": [{"videoId": "ep", "browseId": "MPEP", "title": "Episode", "description": "Show", "thumbnails": []}],
            },
        ]

    def get_artist_albums(self, channel_id, params):
        return [{"browseId": "MPREb", "title": "Album", "year": "2026", "type": "Album", "thumbnails": []}]

    def get_liked_songs(self, limit=None):
        return {"tracks": self.search("liked")}

    def rate_song(self, video_id, rating):
        self.ratings.append((video_id, rating))

    def get_library_playlists(self, limit=50):
        return [{"playlistId": "pl", "title": "Playlist", "count": "2", "thumbnails": [{"url": "http://img/pl.jpg"}]}]

    def get_library_albums(self, limit=50):
        return [{"browseId": "alb", "title": "Album", "artists": [{"name": "Artist"}], "year": "2026", "thumbnails": []}]

    def get_library_artists(self, limit=50):
        return [{"browseId": "artist", "artist": "Artist", "songs": "10", "thumbnails": []}]

    def create_playlist(self, title, description, privacy_status="PRIVATE", video_ids=None):
        self.created_playlists.append((title, description, privacy_status, video_ids))
        return "created-pl"

    def add_playlist_items(self, playlist_id, video_ids):
        self.added_playlist_items.append((playlist_id, video_ids))

    def remove_playlist_items(self, playlist_id, videos):
        self.removed_playlist_items.append((playlist_id, videos))

    def edit_playlist(self, playlist_id, **values):
        self.edited_playlists.append((playlist_id, values))

    def delete_playlist(self, playlist_id):
        self.deleted_playlists.append(playlist_id)

    def get_playlist(self, playlist_id, limit=None):
        return {
            "title": "Playlist",
            "thumbnails": [{"url": "http://img/pl-small.jpg"}, {"url": "http://img/pl-large.jpg"}],
            "tracks": self.search("playlist"),
        }

    def get_watch_playlist(self, playlistId, limit=50):
        return {"tracks": self.search("radio")}

    def get_album(self, browse_id):
        return {
            "title": "Album",
            "artists": [{"name": "Artist", "id": "UCartist"}],
            "year": "2026",
            "thumbnails": [{"url": "http://img/album.jpg"}],
            "tracks": self.search("album"),
        }

    def get_artist(self, browse_id):
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
            "videos": {"results": [{"videoId": "video", "title": "Video", "artists": [{"name": "Artist"}], "views": "1K", "thumbnails": []}]},
            "related": {"results": [{"browseId": "related", "title": "Related", "subscribers": "5K", "thumbnails": []}]},
        }

    def subscribe_artists(self, channel_ids):
        self.subscribed_artists.append(channel_ids)

    def unsubscribe_artists(self, channel_ids):
        self.unsubscribed_artists.append(channel_ids)

    def get_song(self, video_id):
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

    def get_podcast(self, playlist_id, limit=50):
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

    def get_mood_categories(self):
        return {
            "For you": [
                {"title": "Energize", "params": "energy"},
                {"title": "Duplicate", "params": "energy"},
            ],
            "Genres": [{"title": "Jazz", "params": "jazz"}],
        }

    def _send_request(self, endpoint, payload):
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
    def __init__(self):
        self.state = SimpleNamespace(
            adding_account=False,
            current_profile="default",
            ytm=object(),
            playlist_cache={"cached": {"playlist": []}},
        )
        self.client = FakeYoutubeClient()

    def prepare_auth_headers(self, headers):
        return {"prepared": True, **headers}

    def activate_verified_profile(self, name):
        self.state.current_profile = name
        self.state.ytm = object()
        return True

    def refresh_account_info(self, name):
        return None

    def activate_profile(self, name):
        if name == "missing":
            return False
        self.state.current_profile = name
        self.state.ytm = object()
        return True

    def apply_webview_cookies(self, cookie_string):
        if not cookie_string:
            return False, "invalid", False
        return True, None, "PSIDTS=" in cookie_string

    def clear_active_profile(self):
        self.state.current_profile = None
        self.state.ytm = None

    def autoload_first_profile(self):
        self.state.current_profile = "default"
        self.state.ytm = object()

    def get_active_client(self):
        return self.client


class FakeCacheSettings:
    def __init__(self):
        self.enabled = {"playlists": True, "albums": True, "images": True, "songs": True, "lyrics": True}

    def update(self, values):
        self.enabled.update(values)


class FakeLastFM:
    def __init__(self):
        self.calls = []
        self.enabled = True

    def lastfm_enabled(self):
        return self.enabled

    def lastfm_call(self, method, params=None, http="POST", signed=False):
        self.calls.append((method, params or {}, http, signed))
        if method == "auth.getToken":
            return True, {"token": "tok"}
        if method == "auth.getSession":
            return True, {"session": {"key": "new-sk", "name": "bob"}}
        return True, {}


class FakeLyricsService:
    def __init__(self):
        self.custom = {}

    def get_lyrics(self, **kwargs):
        return {"source": kwargs["source"], "title": kwargs["title"], "lyrics": []}

    def romanize(self, lines):
        return [f"ro:{line}" for line in lines]

    def translate(self, lines, target_lang):
        return [f"{target_lang}:{line}" for line in lines]

    def save_custom(self, video_id, content, lyric_format):
        self.custom[video_id] = {"videoId": video_id, "content": content, "format": lyric_format}

    def get_custom(self, video_id):
        return self.custom.get(video_id)

    def delete_custom(self, video_id):
        return self.custom.pop(video_id, None) is not None

    def unison_versions(self, **kwargs):
        return [{"id": "lyr", "videoId": kwargs["video_id"]}]

    def display_name(self, key_id):
        return f"name:{key_id}"


class FakeUpstream:
    def __init__(self, status_code=206, content=b"audio", content_type="audio/mp4"):
        self.status_code = status_code
        self.content = content
        self.headers = {"Content-Type": content_type, "Content-Length": str(len(content))}

    def iter_content(self, chunk_size=65536):
        yield self.content

    def raise_for_status(self):
        return None


class FakeStreamService:
    def __init__(self):
        self.warmed = []

    def resolve_stream(self, video_id):
        return {"url": f"https://stream/{video_id}"}, 200

    def prepare_download(self, video_id):
        return {"path": f"/tmp/{video_id}.m4a"}, 200

    def open_audio_stream(self, video_id, range_header=None):
        if video_id == "error":
            return None, ({"error": "failed"}, 502)
        return FakeUpstream(), None

    def build_proxy_headers(self, upstream):
        return {"Accept-Ranges": "bytes", "Content-Length": upstream.headers["Content-Length"]}

    def iter_upstream(self, upstream):
        yield upstream.content

    def warm(self, video_id):
        self.warmed.append(video_id)
        return True


class FakeComposerBridge:
    EXPOSED_HEADERS = "x-track-title,x-track-artist"

    def __init__(self, root):
        self.root = Path(root)
        self.dist = self.root / "composer_dist"
        self.dist.mkdir()
        (self.dist / "index.html").write_text("<main>Composer</main>", encoding="utf-8")
        self.audio_file = self.root / "cached.m4a"
        self.audio_file.write_bytes(b"cached audio")
        self.autocache_enabled = True

    def composer_dist_directory(self):
        return self.dist

    def set_autocache_enabled(self, enabled):
        self.autocache_enabled = bool(enabled)

    def track_metadata(self, video_id):
        return {"title": "Song", "artist": "Artist"}

    def cached_audio_path(self, video_id):
        return self.audio_file if video_id == "cached" else None

    def audio_mime_type(self, path):
        return "audio/mp4"

    def open_audio_stream(self, video_id):
        return FakeUpstream(status_code=200, content=b"upstream")

    def stream_with_optional_cache(self, video_id, upstream):
        yield upstream.content

    def thumbnail(self, video_id):
        if video_id == "missing":
            return None
        return b"png", "image/png"


class FakePlaylistCache:
    @staticmethod
    def memory_key(playlist_id, profile_name):
        return (profile_name or "default", playlist_id)

    def __init__(self):
        self.playlist_cache = {}
        self.disk = {}
        self.purged = []
        self.saved = []

    def purge_playlist_cache(self, playlist_id, profile_name):
        self.purged.append((playlist_id, profile_name))
        self.discard_memory(playlist_id, profile_name)
        self.disk.pop((profile_name, playlist_id), None)

    def get_memory(self, playlist_id, profile_name):
        return self.playlist_cache.get(self.memory_key(playlist_id, profile_name))

    def discard_memory(self, playlist_id, profile_name):
        self.playlist_cache.pop(self.memory_key(playlist_id, profile_name), None)

    def clear_memory(self):
        self.playlist_cache.clear()

    def load_playlist_disk(self, playlist_id, profile_name):
        return self.disk.get((profile_name, playlist_id))

    def save_playlist_disk(self, playlist_id, profile_name, data):
        self.saved.append((playlist_id, profile_name, data))
        self.disk[(profile_name, playlist_id)] = data

    def put(self, playlist_id, profile_name, data):
        self.playlist_cache[self.memory_key(playlist_id, profile_name)] = data


class FakeAlbumCache:
    def __init__(self):
        self.disk = {}
        self.saved = []

    def load_album_disk(self, browse_id):
        return self.disk.get(browse_id)

    def save_album_disk(self, browse_id, data):
        self.saved.append((browse_id, data))
        self.disk[browse_id] = data


class FakeSongCreditsCache:
    def __init__(self):
        self.entries = {}

    def get(self, video_id):
        return self.entries.get(video_id)

    def put(self, video_id, payload):
        self.entries[video_id] = payload

    def clear(self):
        self.entries.clear()


class FakeDownloadService:
    def __init__(self, root):
        self.root = Path(root)
        self.status = {}
        self.queue = {}
        self.started = []
        self.deleted = []
        self.cached = {}
        self.cached_meta = [{"videoId": "cached", "title": "Cached Song"}]

    def add_cached(self, video_id, suffix=".opus", content=b"cached audio"):
        path = self.root / f"{video_id}{suffix}"
        path.write_bytes(content)
        self.cached[video_id] = path
        return path

    def song_audio_path(self, video_id):
        return self.cached.get(video_id)

    @staticmethod
    def audio_mime_type(path):
        suffix = Path(path).suffix.lower()
        return {
            ".opus": "audio/opus",
            ".m4a": "audio/mp4",
            ".webm": "audio/webm",
            ".mp3": "audio/mpeg",
        }.get(suffix, "application/octet-stream")

    def start(self, video_id, meta):
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

    def queue_snapshot(self):
        return list(self.queue.values())

    def list_cached(self):
        return list(self.cached_meta)

    def delete_cached(self, video_id):
        self.deleted.append(video_id)
        self.cached.pop(video_id, None)
        self.status.pop(video_id, None)


class FakeExportService:
    def __init__(self):
        self.status = {}
        self.started = []

    def start(self, video_id, output_path, fmt, meta):
        self.started.append((video_id, output_path, fmt, meta))
        self.status[video_id] = "exporting"


class FakeFFmpeg:
    def __init__(self):
        self.is_available = True
        self.download_forces = []
        self.update_payload = {"installed": "7.0", "latest": "8.0", "updateAvailable": True}

    def available(self):
        return self.is_available

    def check_update(self):
        return dict(self.update_payload)

    def download_stream(self, force=False):
        self.download_forces.append(force)
        yield 'data: {"status": "progress", "percent": 50}\n\n'
        yield 'data: {"status": "done"}\n\n'


class FakeYTDLP:
    def __init__(self):
        self.update_payload = {"ok": True, "version": "2026.07.11"}
        self.update_status = 200
        self.check_payload = {"installed": "2026.01.01", "latest": "2026.07.11", "updateAvailable": True}

    def check_update(self):
        return dict(self.check_payload)

    def update(self):
        return dict(self.update_payload), self.update_status


class FakeOverlayServer:
    def __init__(self):
        self.state = {}
        self.config = {"version": 2, "canvas": {"width": 400}, "layers": []}
        self.started_ports = []
        self.stopped = 0
        self.running = False

    def page_response(self):
        response = Response("<main>Overlay</main>", content_type="text/html; charset=utf-8")
        response.headers["X-Frame-Options"] = "ALLOWALL"
        return response

    def stream_response(self):
        return Response('data: {"title": "Song"}\n\n', content_type="text/event-stream")

    def update_state(self, data):
        self.state.update(data or {})

    def set_config(self, config):
        self.config = dict(config or {})

    def get_config(self):
        return dict(self.config)

    def start(self, port):
        self.started_ports.append(port)
        self.running = True
        return True

    def stop(self):
        self.stopped += 1
        self.running = False

    def status(self):
        return {"running": self.running, "clients": 0}


class FakeRemoteControl:
    def __init__(self):
        self.enabled = False
        self.token = None
        self.state = {"title": "", "isPlaying": False}
        self.devices = {}
        self.commands = []
        self.pushed_states = []

    def enable(self, data):
        self.enabled = bool(data.get("enabled"))
        self.token = (data.get("token") or "tok") if self.enabled else None
        if self.enabled:
            for trusted in data.get("trusted") or []:
                device_id = trusted.get("id")
                if device_id:
                    self.devices[device_id] = {
                        "name": trusted.get("name", "Device"),
                        "status": "approved",
                    }
        else:
            self.devices.clear()
            self.commands.clear()
        return {"enabled": self.enabled, "token": self.token, "port": 9847, "ips": ["127.0.0.1"]}

    def status_payload(self):
        devices = [
            {"id": device_id, "name": device["name"], "status": device["status"], "online": True}
            for device_id, device in self.devices.items()
        ]
        return {"enabled": self.enabled, "token": self.token, "port": 9847, "ips": ["127.0.0.1"], "devices": devices}

    def device_action(self, data):
        device_id = data.get("id")
        device = self.devices.get(device_id)
        if not device:
            return {"error": "unknown"}, 404
        if data.get("action") == "approve":
            device["status"] = "approved"
        elif data.get("action") in ("deny", "remove"):
            self.devices.pop(device_id, None)
        return {"ok": True}, 200

    def push_state(self, data):
        self.pushed_states.append(dict(data or {}))
        self.state.update(data or {})

    def poll(self):
        commands, self.commands = self.commands, []
        return commands

    def sync(self, data):
        state = (data or {}).get("state")
        if isinstance(state, dict):
            self.state.update(state)
        return self.poll()

    def hello(self, data):
        if data.get("token") != self.token:
            return {"error": "invalid_token"}, 403
        device_id = data.get("deviceId")
        if not device_id:
            return {"error": "no_device"}, 400
        self.devices.setdefault(device_id, {"name": data.get("name", "Device"), "status": "pending"})
        return {"status": self.devices[device_id]["status"]}, 200

    def get_state(self, token, device_id):
        if token != self.token:
            return {"error": "invalid_token"}, 403
        device = self.devices.get(device_id or "")
        if not device:
            return {"status": "unknown"}, 200
        if device["status"] != "approved":
            return {"status": device["status"]}, 200
        return {"status": "approved", "state": self.state}, 200

    def command(self, data):
        if data.get("token") != self.token:
            return {"error": "invalid_token"}, 403
        device = self.devices.get(data.get("deviceId"))
        if not device or device["status"] != "approved":
            return {"error": "not_allowed"}, 403
        action = data.get("action")
        if action not in ("playpause", "next", "prev", "shuffle", "repeat"):
            return {"error": "bad_action"}, 400
        self.commands.append(action)
        return {"ok": True}, 200

    def page_html(self):
        return "<main>Remote</main>"


class RouteTestCase(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.app = Flask(__name__)
        self.app.config["TESTING"] = True
        self.profile_repository = FakeProfileRepository(self.root)
        self.music_session = FakeMusicSession()
        self.cache_settings = FakeCacheSettings()
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
        self.client = self.app.test_client()

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
