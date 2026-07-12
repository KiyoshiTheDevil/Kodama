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
    NetworkSettings,
    OverlayServer,
    Playlist,
    Profile,
    RemoteControl,
    SongCreditsCache,
    StreamService,
    YoutubeMusicSession,
    YTDLP,
    load_feedback_webhook,
    setup_debug,
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


def create_app() -> Flask:
    try:
        setup_log_tee()
        setup_logger()
        app = Flask(__name__)
        app.config.from_object(Config)
        CORS(app, origins=CORS_ORIGINS)
        app.extensions["server_start_time"] = time.time()
        app.extensions["feedback_webhook_url"] = load_feedback_webhook()
        app.extensions["network_settings"] = NetworkSettings()
        app.extensions["song_credits_cache"] = SongCreditsCache()

        profile_repository = Profile()
        app.extensions["profile_repository"] = profile_repository
        playlist_cache = Playlist()
        app.extensions["playlist_cache"] = playlist_cache
        music_session = YoutubeMusicSession(
            profiles=profile_repository,
            playlist_cache=playlist_cache,
        )
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
        # yt-dlp needs Node.js for nsig decryption before it handles any request.
        ytdlp.ensure_node_in_path()
        ytdlp.activate_ytdlp_update()

        return app

    except Exception as err:
        raise RuntimeError("Failed to create Flask application.") from err
