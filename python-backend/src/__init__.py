import time

from flask import Flask
from flask_cors import CORS

from src.config import Config
from src.lib import (
    Album,
    CacheSettings,
    LastFM,
    ComposerBridge,
    ComposerSettings,
    DownloadService,
    ExportService,
    FFmpeg,
    LyricsService,
    MusixMatch,
    OverlayServer,
    Playlist,
    Profile,
    RemoteControl,
    StreamService,
    YoutubeMusicSession,
    YTDLP,
    setup_debug,
    setup_ipv4_first,
    setup_log_tee,
    setup_logger,
)
from src.routes import register_blueprints


CORS_ORIGINS = [
    "http://localhost:1421",     # Tauri dev server
    "tauri://localhost",         # Tauri production (Windows/Linux)
    "https://tauri.localhost",   # Tauri production (Tauri 2.x, WebView2)
    "http://tauri.localhost",    # fallback
    "http://localhost",
    "http://127.0.0.1",
]


def create_app():
    try:
        setup_ipv4_first()

        app = Flask(__name__)
        app.config.from_object(Config)
        CORS(app, origins=CORS_ORIGINS)
        app.extensions["server_start_time"] = time.time()

        profile_repository = Profile()
        app.extensions["profile_repository"] = profile_repository
        music_session = YoutubeMusicSession(profiles=profile_repository)
        # Restore the most recently available profile before serving auth checks.
        # Without this, saved accounts exist on disk but no active YTMusic client is
        # created until the user manually switches profiles.
        music_session.autoload_first_profile()
        music_session.start_cookie_refresh_loop()
        app.extensions["youtube_music_session"] = music_session
        app.extensions["lastfm_client"] = LastFM()
        app.extensions["cache_settings"] = CacheSettings()
        app.extensions["composer_bridge"] = ComposerBridge(
            settings=ComposerSettings(),
            cache_settings=app.extensions["cache_settings"],
            music_session=app.extensions["youtube_music_session"],
        )
        app.extensions["lyrics_service"] = LyricsService(
            cache_settings=app.extensions["cache_settings"],
            musixmatch=MusixMatch(),
        )
        app.extensions["playlist_cache"] = Playlist()
        app.extensions["album_cache"] = Album()

        ytdlp = YTDLP(
            profiles=profile_repository,
            music_state=app.extensions["youtube_music_session"].state,
        )
        app.extensions["ytdlp"] = ytdlp
        app.extensions["stream_service"] = StreamService(ytdlp=ytdlp)

        ffmpeg = FFmpeg()
        app.extensions["ffmpeg"] = ffmpeg
        app.extensions["download_service"] = DownloadService(ytdlp=ytdlp)
        app.extensions["export_service"] = ExportService(ytdlp=ytdlp, ffmpeg=ffmpeg)

        app.extensions["overlay_server"] = OverlayServer()
        app.extensions["remote_control"] = RemoteControl()

        register_blueprints(app)

        setup_debug(app)
        setup_log_tee()
        setup_logger()

        # yt-dlp needs Node.js for nsig decryption before it handles any request.
        ytdlp.ensure_node_in_path()
        ytdlp.activate_ytdlp_update()

        return app

    except Exception as err:
        raise RuntimeError("Failed to create Flask application.") from err
