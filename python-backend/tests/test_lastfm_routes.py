from route_test_support import RouteTestCase


class LastFMRouteTests(RouteTestCase):
    def test_lastfm_routes(self):
        self.assertEqual(self.client.get("/lastfm/status").json["username"], "alice")
        connect = self.client.get("/lastfm/connect")
        self.assertEqual(connect.status_code, 200)
        self.assertEqual(connect.json["token"], "tok")

        session = self.client.post("/lastfm/session", json={"token": "tok"})
        self.assertEqual(session.json, {"connected": True, "username": "bob"})
        self.assertEqual(self.profile_repository.metadata["default"]["lastfm_session"], "new-sk")

        for path in ("/lastfm/now-playing", "/lastfm/scrobble", "/lastfm/love", "/lastfm/unlove"):
            response = self.client.post(path, json={"artist": "Artist", "track": "Song", "duration": "180"})
            self.assertEqual(response.json, {"ok": True})

        self.assertEqual(self.client.post("/lastfm/disconnect").json, {"connected": False})
        self.assertNotIn("lastfm_session", self.profile_repository.metadata["default"])
        missing_meta = self.client.post("/lastfm/love", json={"artist": "Artist", "track": "Song"})
        self.assertEqual(missing_meta.status_code, 400)
