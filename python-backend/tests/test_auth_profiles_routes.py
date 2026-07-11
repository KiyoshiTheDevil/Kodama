from unittest.mock import patch

from route_test_support import RouteTestCase


class AuthRouteTests(RouteTestCase):
    def test_auth_routes_cover_success_and_validation_paths(self):
        self.assertEqual(self.client.post("/auth/begin-add").json, {"ok": True})
        self.assertEqual(self.client.get("/auth/validate").json["reason"], "adding_account")
        self.assertEqual(self.client.post("/auth/end-add").json, {"ok": True})
        self.assertTrue(self.client.get("/auth/validate").json["valid"])

        self.assertEqual(self.client.post("/auth/refresh-cookies", json={}).status_code, 400)
        refreshed = self.client.post("/auth/refresh-cookies", json={"cookie": "PSIDTS=1"})
        self.assertEqual(refreshed.json, {"ok": True, "psidts": True})

        self.assertEqual(self.client.post("/auth/cookie-login", json={}).status_code, 400)
        with patch("src.routes.auth.cookie_login.threading.Thread") as thread:
            thread.return_value.start.return_value = None
            login = self.client.post(
                "/auth/cookie-login",
                json={"cookie": "SAPISID=1", "profile_name": "google", "user_agent": "UA"},
            )
        self.assertEqual(login.json, {"ok": True, "profile": "google"})
        self.assertIn("google", self.profile_repository.auth_headers)

        with patch("src.routes.auth.setup.threading.Thread") as thread:
            thread.return_value.start.return_value = None
            setup = self.client.post(
                "/auth/setup",
                json={"headers_raw": "cookie: SID=1", "profile_name": "headers", "display_name": "Headers"},
            )
        self.assertEqual(setup.json, {"ok": True, "profile": "headers"})

        local = self.client.post("/auth/local-create", json={"displayName": "Local User"})
        self.assertEqual(local.status_code, 200)
        self.assertEqual(local.json["displayName"], "Local User")
        self.assertEqual(self.music_session.state.current_profile, "local_user")

        self.profile_repository.local_profiles.add("local_user")
        self.assertEqual(self.client.post("/auth/logout").status_code, 400)
        self.music_session.state.current_profile = "headers"
        self.assertEqual(self.client.post("/auth/logout").json, {"ok": True})


class ProfileRouteTests(RouteTestCase):
    def test_profile_routes(self):
        listed = self.client.get("/profiles").json
        self.assertEqual(listed["current"], "default")
        self.assertGreaterEqual(len(listed["profiles"]), 1)

        self.assertEqual(self.client.post("/profiles/switch", json={}).status_code, 400)
        self.assertEqual(self.client.post("/profiles/switch", json={"name": "missing"}).status_code, 404)
        with patch("src.routes.profiles.switch.threading.Thread") as thread:
            thread.return_value.start.return_value = None
            switched = self.client.post("/profiles/switch", json={"name": "default"})
        self.assertEqual(switched.json, {"ok": True, "current": "default"})

        self.assertEqual(self.client.post("/profiles/rename", json={"name": "default", "displayName": "Renamed"}).json, {"ok": True})
        self.assertEqual(self.profile_repository.metadata["default"]["displayName"], "Renamed")
        self.assertEqual(self.client.post("/profiles/avatar", json={"name": "default", "avatar": "data"}).json, {"ok": True})
        self.assertEqual(self.profile_repository.metadata["default"]["avatar"], "data")

        self.assertEqual(self.client.post("/profiles/delete", json={"name": "default"}).json, {"ok": True})
        self.assertIn("default", self.profile_repository.deleted)
