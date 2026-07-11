import unittest
from unittest.mock import patch

from src.lib.integrations.musixmatch import MusixMatch


class MusixMatchTests(unittest.TestCase):
    def test_lookup_uses_instance_token_state_and_returns_richsync(self):
        responses = [
            {"message": {"body": {"user_token": "token"}}},
            {"message": {"body": {"track_list": [{"track": {"track_id": 42}}]}}},
            {"message": {"body": {"richsync": {"richsync_body": '[{"ts": 0}]'}}}},
        ]

        class Response:
            def __init__(self, payload):
                self._payload = payload

            def json(self):
                return self._payload

        with patch(
            "src.lib.integrations.musixmatch.requests.get",
            side_effect=[Response(payload) for payload in responses],
        ) as get:
            result = MusixMatch().lookup("Song", "Artist")

        self.assertEqual(
            result,
            {"source": "Musixmatch", "richsync": [{"ts": 0}], "synced": None, "plain": None},
        )
        self.assertEqual(get.call_count, 3)
        self.assertIsNone(MusixMatch()._token)
