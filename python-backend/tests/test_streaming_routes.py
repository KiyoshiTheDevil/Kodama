from route_test_support import RouteTestCase


class StreamingRouteTests(RouteTestCase):
    def test_streaming_routes(self):
        self.assertEqual(self.client.get("/stream/vid").json, {"url": "https://stream/vid"})
        self.assertEqual(self.client.get("/stream-prepare/vid").json, {"path": "/tmp/vid.m4a"})
        self.assertEqual(self.client.get("/audio-stream/vid", headers={"Range": "bytes=0-1"}).data, b"audio")
        self.assertEqual(self.client.get("/audio-stream/error").status_code, 502)
        self.assertEqual(self.client.get("/audio-stream/vid/warm").json, {"ok": True})
