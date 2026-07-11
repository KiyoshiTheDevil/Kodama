from types import SimpleNamespace
from unittest.mock import patch

from route_test_support import FakeUpstream, RouteTestCase


class MiscRouteTests(RouteTestCase):
    def test_imgproxy_news_feedback_clientlog_and_shutdown(self):
        image_response = FakeUpstream(status_code=200, content=b"img", content_type="image/jpeg")
        with patch("src.routes.root.imgproxy.config_dirs", self.cache_dirs), patch(
            "src.routes.root.imgproxy.requests.get", return_value=image_response
        ):
            proxied = self.client.get("/imgproxy?url=https://example.test/image.jpg")
        self.assertEqual(proxied.status_code, 200)
        self.assertEqual(proxied.headers["X-Cache"], "MISS")
        self.assertEqual(proxied.data, b"img")

        project_root = self.root / "python-backend"
        news_path = project_root.parent / "updates" / "news.json"
        news_path.parent.mkdir(parents=True)
        news_path.write_text('[{"id": "release-1"}]', encoding="utf-8")
        with patch("src.routes.news.PROJECT_ROOT", project_root):
            news = self.client.get("/news")
        self.assertEqual(news.status_code, 200)
        self.assertEqual(news.json, [{"id": "release-1"}])
        self.assertEqual(self.client.post("/feedback", json={"title": "Bug"}).status_code, 503)

        self.app.extensions["feedback_webhook_url"] = "https://hooks.example.test"
        webhook = SimpleNamespace(status_code=204)
        with patch("src.routes.feedback.requests.post", return_value=webhook) as post:
            feedback = self.client.post("/feedback", json={"title": "Bug", "description": "Details", "includeLogs": False})
        self.assertEqual(feedback.json, {"ok": True})
        self.assertEqual(post.call_count, 1)

        self.assertEqual(self.client.open("/clientlog", method="OPTIONS").status_code, 204)
        with patch("builtins.print"):
            self.assertEqual(self.client.post("/clientlog", data="hello").status_code, 204)

        with patch("src.routes.root.shutdown.threading.Thread") as thread:
            thread.return_value.start.return_value = None
            shutdown = self.client.post("/shutdown")
        self.assertEqual(shutdown.data, b"ok")
