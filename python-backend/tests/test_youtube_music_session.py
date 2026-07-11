from unittest.mock import MagicMock, patch

from src.lib.music.youtube_music import YoutubeMusicSession


def test_cookie_refresh_loop_starts_only_once_per_session():
    session = YoutubeMusicSession(profiles=MagicMock())

    with patch("src.lib.music.youtube_music.threading.Thread") as thread_class:
        assert session.start_cookie_refresh_loop() is True
        assert session.start_cookie_refresh_loop() is False

    thread_class.assert_called_once_with(
        target=session.run_cookie_refresh_loop,
        name="youtube-cookie-refresh",
        daemon=True,
    )
    thread_class.return_value.start.assert_called_once_with()
