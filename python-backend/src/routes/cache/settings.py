"""Read and update runtime cache feature flags."""

from flask import jsonify, request

from . import blueprint
from ._services import cache_settings


@blueprint.route("/cache/settings", methods=["GET", "POST"])
def cache_settings_route():
    settings = cache_settings()
    if request.method == "POST":
        settings.update(request.get_json(silent=True) or {})
        return jsonify({"ok": True})
    return jsonify(settings.enabled)
