import unittest
from unittest.mock import MagicMock, call, patch

from src.lib.music.playlist import Playlist
from src.lib.music.youtube_music import YoutubeMusicSession


class YoutubeMusicSessionTests(unittest.TestCase):
    def test_cookie_refresh_loop_starts_only_once_per_session(self):
        session = YoutubeMusicSession(profiles=MagicMock())

        with patch("src.lib.music.youtube_music.threading.Thread") as thread_class:
            self.assertTrue(session.start_cookie_refresh_loop())
            self.assertFalse(session.start_cookie_refresh_loop())

        thread_class.assert_called_once_with(
            target=session.run_cookie_refresh_loop,
            name="youtube-cookie-refresh",
            daemon=True,
        )
        thread_class.return_value.start.assert_called_once_with()

    def test_reauth_and_logout_clear_only_that_profiles_playlist_memory(self):
        playlist_cache = MagicMock()
        session = YoutubeMusicSession(profiles=MagicMock(), playlist_cache=playlist_cache)
        client = MagicMock()

        with (
            patch.object(session, "create_client", return_value=client),
            patch("src.lib.music.youtube_music.threading.Thread"),
        ):
            self.assertIs(session.activate_verified_profile("default"), client)

        session.clear_active_profile()

        self.assertEqual(
            playlist_cache.clear_memory_for_profile.call_args_list,
            [call("default"), call("default")],
        )

    def test_profile_memory_clear_preserves_other_profiles_entries(self):
        playlist_cache = Playlist()
        playlist_cache.put("LM", "default", {"tracks": ["old"]})
        playlist_cache.put("LM", "second", {"tracks": ["other"]})

        playlist_cache.clear_memory_for_profile("default")

        self.assertIsNone(playlist_cache.get_memory("LM", "default"))
        self.assertEqual(playlist_cache.get_memory("LM", "second"), {"tracks": ["other"]})
