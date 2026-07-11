from unittest.mock import patch

from route_test_support import RouteTestCase


class CacheRouteTests(RouteTestCase):
    def test_cache_routes_use_isolated_directories(self):
        with patch("src.routes.cache.stats.config_dirs", self.cache_dirs):
            stats = self.client.get("/cache/stats")
        self.assertEqual(stats.status_code, 200)
        self.assertIn("playlists", stats.json)
        self.assertTrue(stats.json["songs"]["enabled"])

        self.assertEqual(self.client.get("/cache/settings").json["images"], True)
        self.assertEqual(self.client.post("/cache/settings", json={"images": False}).json, {"ok": True})
        self.assertFalse(self.cache_settings.enabled["images"])

        self.playlist_cache.put("x", "default", {"tracks": []})
        with patch("src.routes.cache.clear.config_dirs", self.cache_dirs):
            cleared = self.client.post("/cache/clear", json={"category": "playlists"})
        self.assertEqual(cleared.json, {"ok": True})
        self.assertEqual(self.playlist_cache.playlist_cache, {})
        self.assertEqual(list(self.cache_dirs.PLAYLIST_CACHE_DIR.iterdir()), [])

        self.download_service.status["cleared-song"] = "done"
        with patch("src.routes.cache.clear.config_dirs", self.cache_dirs):
            cleared = self.client.post("/cache/clear", json={"category": "songs"})
        self.assertEqual(cleared.json, {"ok": True})
        self.assertEqual(self.download_service.status, {})
        self.assertEqual(
            self.client.get("/song/download/status/cleared-song").json,
            {"status": "not_found"},
        )
