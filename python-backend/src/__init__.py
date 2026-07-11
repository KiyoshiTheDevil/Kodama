from flask import Flask

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
    Playlist,
    Profile,
    StreamService,
    YoutubeMusicSession,
    YTDLP,
    setup_debug,
    setup_ipv4_first,
    setup_log_tee,
    setup_logger,
)
from src.routes import register_blueprints


def create_app():
    try:
        setup_ipv4_first()

        app = Flask(__name__)
        app.config.from_object(Config)

        profile_repository = Profile()
        app.extensions["profile_repository"] = profile_repository
        app.extensions["youtube_music_session"] = YoutubeMusicSession(profiles=profile_repository)
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

        register_blueprints(app)

        setup_debug(app)
        setup_log_tee()
        setup_logger()

        ytdlp.activate_ytdlp_update()

        return app

    except Exception as err:
        raise RuntimeError("Failed to create Flask application.") from err
