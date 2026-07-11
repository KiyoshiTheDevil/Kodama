from contextlib import ExitStack
from unittest.mock import MagicMock, call, patch

from src import create_app


def test_app_startup_restores_a_saved_profile():
    with ExitStack() as patches:
        patches.enter_context(patch("src.setup_ipv4_first"))
        patches.enter_context(patch("src.Profile"))
        session_class = patches.enter_context(patch("src.YoutubeMusicSession"))
        patches.enter_context(patch("src.LastFM"))
        patches.enter_context(patch("src.CacheSettings"))
        patches.enter_context(patch("src.ComposerBridge"))
        patches.enter_context(patch("src.ComposerSettings"))
        patches.enter_context(patch("src.LyricsService"))
        patches.enter_context(patch("src.MusixMatch"))
        patches.enter_context(patch("src.Playlist"))
        patches.enter_context(patch("src.Album"))
        ytdlp_class = patches.enter_context(patch("src.YTDLP"))
        patches.enter_context(patch("src.StreamService"))
        patches.enter_context(patch("src.FFmpeg"))
        patches.enter_context(patch("src.DownloadService"))
        patches.enter_context(patch("src.ExportService"))
        patches.enter_context(patch("src.OverlayServer"))
        patches.enter_context(patch("src.RemoteControl"))
        patches.enter_context(patch("src.register_blueprints"))
        patches.enter_context(patch("src.setup_debug"))
        patches.enter_context(patch("src.setup_log_tee"))
        patches.enter_context(patch("src.setup_logger"))
        session = session_class.return_value
        session.state = MagicMock()
        app = create_app()

    session.autoload_first_profile.assert_called_once_with()
    session.start_cookie_refresh_loop.assert_called_once_with()
    assert session.method_calls[:2] == [
        call.autoload_first_profile(),
        call.start_cookie_refresh_loop(),
    ]
    assert app.extensions["youtube_music_session"] is session
    assert ytdlp_class.return_value.method_calls == [
        call.ensure_node_in_path(),
        call.activate_ytdlp_update(),
    ]
