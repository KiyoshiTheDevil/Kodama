from flask import Flask

from src.config import Config
from src.lib import (
    CacheSettings,
    LastFM,
    ComposerBridge,
    ComposerSettings,
    LyricsService,
    MusixMatch,
    Profile,
    StreamService,
    YoutubeMusicSession,
    YTDLP,
    setup_debug,
    setup_log_tee,
    setup_logger,
)
from src.routes import register_blueprints


def create_app():
    try:
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

        ytdlp = YTDLP(
            profiles=profile_repository,
            music_state=app.extensions["youtube_music_session"].state,
        )
        app.extensions["ytdlp"] = ytdlp
        app.extensions["stream_service"] = StreamService(ytdlp=ytdlp)

        register_blueprints(app)

        setup_debug(app)
        setup_log_tee()
        setup_logger()

        ytdlp.activate_ytdlp_update()

        return app

    except Exception as err:
        raise RuntimeError("Failed to create Flask application.") from err
