"""Clear one cache category or every cache category."""

from flask import jsonify, request

from src.config import config_dirs
from src.lib import CacheSettings

from . import blueprint
from ._services import download_service, playlist_cache


@blueprint.route("/cache/clear", methods=["POST"])
def cache_clear():
    directories = CacheSettings.category_directories(config_dirs)
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
            playlist_cache().clear_memory()
        if current_category == "songs":
            download_service().status.clear()
    return jsonify({"ok": True})
