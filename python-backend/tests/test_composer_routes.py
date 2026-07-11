from route_test_support import RouteTestCase


class ComposerRouteTests(RouteTestCase):
    def test_composer_routes(self):
        health = self.client.get("/composer-bridge/health")
        self.assertEqual(health.json["status"], "ok")
        self.assertEqual(health.headers["Access-Control-Allow-Origin"], "https://composer.boidu.dev")

        app_response = self.client.get("/composer-app/")
        self.assertIn(b"Composer", app_response.data)
        app_response.close()
        self.assertEqual(self.client.get("/composer-bridge/autocache").json, {"enabled": True})
        self.assertEqual(self.client.post("/composer-bridge/autocache", json={"enabled": False}).json, {"enabled": False})

        thumb = self.client.get("/composer-bridge/thumb/vid")
        self.assertEqual(thumb.status_code, 200)
        self.assertEqual(thumb.content_type, "image/png")
        self.assertEqual(self.client.get("/composer-bridge/thumb/missing").status_code, 404)

        cached = self.client.get("/composer-bridge/audio/cached")
        self.assertEqual(cached.status_code, 200)
        self.assertEqual(cached.content_type, "audio/mp4")
        cached.close()
        streamed = self.client.get("/composer-bridge/audio/live")
        self.assertEqual(streamed.status_code, 200)
        self.assertEqual(streamed.data, b"upstream")
