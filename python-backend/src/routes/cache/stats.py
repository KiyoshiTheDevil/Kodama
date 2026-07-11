"""Report cache size, item count, and enabled state by category."""

from flask import jsonify

from src.config import config_dirs
from src.lib import CacheSettings, DirectoryInspector

from . import blueprint
from ._services import cache_settings


@blueprint.route("/cache/stats")
def cache_stats():
    directories = CacheSettings.category_directories(config_dirs)
    result = {}
    settings = cache_settings()
    for category, directory in directories.items():
        size, count = DirectoryInspector.size_and_file_count(directory)
        if category == "songs":
            try:
                count = sum(path.suffix == ".json" for path in directory.iterdir())
            except OSError:
                count = 0
        result[category] = {"size": size, "count": count, "enabled": settings.enabled[category]}
    return jsonify(result)
