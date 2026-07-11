from route_test_support import RouteTestCase


class RootMusicRouteTests(RouteTestCase):
    def test_root_music_routes(self):
        self.assertEqual(self.client.get("/status").json["ok"], True)
        self.assertEqual(self.client.get("/search").json, {"results": []})
        self.assertEqual(self.client.get("/search?q=song").json["results"][0]["type"], "song")
        self.assertEqual(self.client.get("/search?q=artist&filter=artists").json["results"][0]["type"], "artist")
        self.assertEqual(self.client.get("/search?q=album&filter=albums").json["results"][0]["type"], "album")
        self.assertEqual(self.client.get("/home").json["sections"][0]["items"][0]["videoId"], "vid")
        self.assertEqual(self.client.get("/artist_albums?channelId=UCartist&params=abc").json["albums"][0]["title"], "Album")
        self.assertEqual(self.client.get("/artist_albums").status_code, 400)

        liked = self.client.get("/liked")
        self.assertEqual(liked.status_code, 200)
        self.assertEqual(liked.json["tracks"][0]["videoId"], "vid")
        self.assertEqual(self.client.get("/liked/ids").json, {"ids": ["vid"]})
        like = self.client.post("/like/vid", json={"rating": "LIKE"})
        self.assertEqual(like.json, {"ok": True, "rating": "LIKE"})
        self.assertEqual(self.music_session.client.ratings, [("vid", "LIKE")])

        self.profile_repository.local_profiles.add("default")
        local_like = self.client.post(
            "/like/local",
            json={"rating": "LIKE", "title": "Local", "artists": "Artist", "album": "Album", "thumbnail": "", "duration": "1:00"},
        )
        self.assertEqual(local_like.json, {"ok": True, "rating": "LIKE"})
        self.assertEqual(self.client.get("/liked/ids").json, {"ids": ["local"]})
        self.assertEqual(self.client.get("/liked").json["tracks"][0]["title"], "Local")
