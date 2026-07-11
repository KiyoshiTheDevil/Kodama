from types import SimpleNamespace
from unittest.mock import patch

from route_test_support import RouteTestCase


class LyricsRouteTests(RouteTestCase):
    def test_lyrics_and_unison_routes(self):
        lyrics = self.client.get("/lyrics?title=Song&artist=Artist&source=auto")
        self.assertEqual(lyrics.json["title"], "Song")
        self.assertEqual(self.client.post("/romanize-lyrics", json={"lines": ["kana"]}).json["romanizations"], ["ro:kana"])
        self.assertEqual(self.client.post("/translate-lyrics", json={"lines": ["hi"], "target_lang": "de"}).json["translations"], ["DE:hi"])

        self.assertEqual(self.client.post("/lyrics/custom", json={"videoId": "vid", "content": "[00:00] hi", "format": "lrc"}).json, {"ok": True})
        self.assertEqual(self.client.get("/lyrics/custom/vid").json["content"], "[00:00] hi")
        self.assertEqual(self.client.delete("/lyrics/custom/vid").json, {"ok": True})
        self.assertEqual(self.client.get("/lyrics/custom/vid").status_code, 404)

        versions = self.client.get("/lyrics/unison/versions?videoId=vid&title=Song")
        self.assertEqual(versions.json["versions"][0]["videoId"], "vid")
        self.assertEqual(self.client.get("/unison/displayname/key").json, {"displayName": "name:key"})

        upstream = SimpleNamespace(content=b'{"ok":true}', status_code=201, headers={"Content-Type": "application/json"})
        with patch("src.routes.lyrics._unison.requests.request", return_value=upstream) as request:
            vote = self.client.post("/unison/lyrics/lyr/vote", json={"signed": True})
            report = self.client.post("/unison/lyrics/lyr/report", json={"signed": True})
            nickname = self.client.put("/unison/auth/nickname", json={"signed": True})
            check = self.client.post("/unison/auth/nickname/check", json={"signed": True})
        self.assertEqual(vote.status_code, 201)
        self.assertEqual(report.status_code, 201)
        self.assertEqual(nickname.status_code, 201)
        self.assertEqual(check.status_code, 201)
        self.assertEqual(request.call_count, 4)
