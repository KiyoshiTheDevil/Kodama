import json
from unittest.mock import patch

from route_test_support import RouteTestCase


def sse_events(response):
    events = []
    for block in response.data.decode("utf-8").strip().split("\n\n"):
        if block.startswith("data: "):
            events.append(json.loads(block[6:]))
    return events


class LibraryListingRouteTests(RouteTestCase):
    def test_online_library_listing_routes(self):
        playlists = self.client.get("/library/playlists")
        self.assertEqual(playlists.status_code, 200)
        self.assertEqual(playlists.json["playlists"][0]["playlistId"], "pl")

        albums = self.client.get("/library/albums")
        self.assertEqual(albums.status_code, 200)
        self.assertEqual(albums.json["albums"][0]["artists"], "Artist")

        artists = self.client.get("/library/artists")
        self.assertEqual(artists.status_code, 200)
        self.assertEqual(artists.json["artists"][0]["artist"], "Artist")

    def test_local_library_listing_routes(self):
        self.profile_repository.local_profiles.add("default")

        playlists = self.client.get("/library/playlists")
        self.assertEqual(playlists.status_code, 200)
        self.assertEqual(playlists.json["playlists"][0]["playlistId"], "local-pl")
        self.assertEqual(playlists.json["playlists"][0]["count"], "1")

        self.assertEqual(self.client.get("/library/albums").json, {"albums": []})
        self.assertEqual(self.client.get("/library/artists").json, {"artists": []})


class PlaylistRouteTests(RouteTestCase):
    def test_online_playlist_mutation_routes(self):
        self.assertEqual(self.client.post("/playlist/create", json={}).status_code, 400)
        created = self.client.post(
            "/playlist/create",
            json={"title": "New", "description": "Desc", "privacyStatus": "PUBLIC", "videoIds": ["vid"]},
        )
        self.assertEqual(created.json, {"ok": True, "playlistId": "created-pl"})
        self.assertEqual(self.music_session.client.created_playlists, [("New", "Desc", "PUBLIC", ["vid"])])

        self.assertEqual(self.client.post("/playlist/pl/add", json={}).status_code, 400)
        self.assertEqual(self.client.post("/playlist/pl/add", json={"videoIds": ["vid"]}).json, {"ok": True})
        self.assertEqual(self.music_session.client.added_playlist_items, [("pl", ["vid"])])
        self.assertEqual(self.playlist_cache.purged[-1], ("pl", "default"))

        self.assertEqual(self.client.post("/playlist/pl/remove", json={}).status_code, 400)
        videos = [{"videoId": "vid", "setVideoId": "set"}]
        self.assertEqual(self.client.post("/playlist/pl/remove", json={"videos": videos}).json, {"ok": True})
        self.assertEqual(self.music_session.client.removed_playlist_items, [("pl", videos)])

        self.assertEqual(self.client.post("/playlist/pl/edit", json={"title": "Edited"}).json, {"ok": True})
        self.assertEqual(self.music_session.client.edited_playlists[-1][0], "pl")

        self.assertEqual(self.client.delete("/playlist/pl").json, {"ok": True})
        self.assertEqual(self.music_session.client.deleted_playlists, ["pl"])

    def test_online_playlist_fetch_and_stream_cache(self):
        playlist = self.client.get("/playlist/pl")
        self.assertEqual(playlist.status_code, 200)
        self.assertEqual(playlist.json["title"], "Playlist")
        self.assertEqual(playlist.json["tracks"][0]["videoId"], "vid")

        streamed = self.client.get("/playlist/pl/stream")
        events = sse_events(streamed)
        self.assertEqual(events[0]["type"], "loading")
        self.assertEqual(events[1]["type"], "header")
        self.assertEqual(events[-1], {"type": "done"})
        self.assertEqual(self.playlist_cache.saved[-1][0:2], ("pl", "default"))

        cached = self.client.get("/playlist/pl/stream")
        cached_events = sse_events(cached)
        self.assertTrue(cached_events[0]["cached"])
        self.assertEqual(cached_events[-1], {"type": "done"})

    def test_liked_songs_playlist_fetch_and_stream(self):
        playlist = self.client.get("/playlist/LM")
        self.assertEqual(playlist.status_code, 200)
        self.assertEqual(playlist.json["title"], "Liked Songs")
        self.assertEqual(playlist.json["tracks"][0]["videoId"], "vid")

        events = sse_events(self.client.get("/playlist/LM/stream?refresh=1"))
        self.assertEqual(events[0]["type"], "loading")
        self.assertEqual(events[1]["type"], "header")
        self.assertEqual(events[-1], {"type": "done"})

    def test_local_playlist_routes(self):
        self.profile_repository.local_profiles.add("default")

        created = self.client.post("/playlist/create", json={"title": "Local New"})
        self.assertEqual(created.status_code, 200)
        self.assertTrue(created.json["ok"])

        self.assertEqual(self.client.post("/playlist/local-pl/add", json={"videoIds": ["vid"]}).json, {"ok": True})
        self.assertEqual(self.client.post("/playlist/local-pl/remove", json={"videos": [{"videoId": "vid"}]}).json, {"ok": True})
        self.assertEqual(self.client.post("/playlist/local-pl/edit", json={"title": "Edited"}).json, {"ok": True})

        playlist = self.client.get("/playlist/local-pl")
        self.assertEqual(playlist.status_code, 200)
        self.assertEqual(playlist.json["title"], "Local Playlist")
        self.assertEqual(playlist.json["tracks"][0]["videoId"], "local-song")

        events = sse_events(self.client.get("/playlist/local-pl/stream"))
        self.assertEqual(events[0]["type"], "header")
        self.assertTrue(events[0]["cached"])
        self.assertEqual(events[-1], {"type": "done"})

        self.assertEqual(self.client.delete("/playlist/local-pl").json, {"ok": True})


class LibraryDetailRouteTests(RouteTestCase):
    def test_radio_album_artist_and_song_meta_routes(self):
        radio = self.client.get("/radio/pl")
        self.assertEqual(radio.status_code, 200)
        self.assertEqual(radio.json["tracks"][0]["videoId"], "vid")

        album = self.client.get("/album/alb")
        self.assertEqual(album.status_code, 200)
        self.assertEqual(album.json["title"], "Album")
        self.assertEqual(album.json["tracks"][0]["album"], "Album")
        self.assertEqual(self.album_cache.saved[-1][0], "alb")

        cached = self.client.get("/album/alb")
        self.assertEqual(cached.json["title"], "Album")

        artist = self.client.get("/artist/UCartist")
        self.assertEqual(artist.status_code, 200)
        self.assertEqual(artist.json["name"], "Artist")
        self.assertEqual(artist.json["songsBrowseId"], "songs")

        self.assertEqual(self.client.post("/artist/UCartist/subscribe", json={"channelId": "UCchannel"}).json, {"ok": True})
        self.assertEqual(self.music_session.client.subscribed_artists, [["UCchannel"]])
        self.assertEqual(self.client.post("/artist/UCartist/unsubscribe", json={"channelId": "UCchannel"}).json, {"ok": True})
        self.assertEqual(self.music_session.client.unsubscribed_artists, [["UCchannel"]])

        meta = self.client.get("/song/meta/vid")
        self.assertEqual(meta.status_code, 200)
        self.assertEqual(meta.json["duration"], "3:05")

    def test_song_credits_routes_use_cache_after_first_fetch(self):
        from src.routes.library import song

        song._credits_cache.clear()
        payload = {
            "contents": {
                "twoColumnWatchNextResults": {
                    "results": {
                        "results": {
                            "contents": [
                                {"videoSecondaryInfoRenderer": {"attributedDescription": {"content": "Credits text"}}}
                            ]
                        }
                    }
                }
            }
        }

        class JsonResponse:
            def json(self):
                return payload

        with patch("src.routes.library.song.requests.post", return_value=JsonResponse()) as post:
            first = self.client.get("/song/credits/vid")
            second = self.client.get("/song/credits/vid")

        self.assertEqual(first.json, {"description": "Credits text"})
        self.assertEqual(second.json, {"description": "Credits text"})
        self.assertEqual(post.call_count, 1)
