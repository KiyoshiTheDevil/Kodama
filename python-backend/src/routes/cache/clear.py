"""Clear one cache category or every cache category."""

from flask import jsonify, request

from src.config import config_dirs

from . import blueprint
from ._services import music_session


@blueprint.route("/cache/clear", methods=["POST"])
def cache_clear():
    directories = {
        "playlists": config_dirs.PLAYLIST_CACHE_DIR,
        "albums": config_dirs.ALBUM_CACHE_DIR,
        "images": config_dirs.IMG_CACHE_DIR,
        "songs": config_dirs.SONG_CACHE_DIR,
        "lyrics": config_dirs.LYRICS_CACHE_DIR,
    }
    category = (request.get_json(silent=True) or {}).get("category", "all")
    categories = [category] if category in directories else list(directories)
    for current_category in categories:
        try:
            paths = list(directories[current_category].iterdir())
        except OSError:
            paths = []
        for path in paths:
            try:
                path.unlink()
            except OSError:
                pass
        if current_category == "playlists":
            music_session().state.playlist_cache.clear()
    return jsonify({"ok": True})
