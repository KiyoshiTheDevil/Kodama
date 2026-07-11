"""Read and update Composer Bridge audio caching."""

from flask import jsonify, request

from . import blueprint
from ._services import composer_bridge


@blueprint.route("/composer-bridge/autocache", methods=["GET", "POST"])
def composer_bridge_autocache():
    bridge = composer_bridge()
    body = request.get_json(silent=True) or {}
    if request.method == "POST" and "enabled" in body:
        bridge.set_autocache_enabled(body["enabled"])
    return jsonify({"enabled": bridge.autocache_enabled})
