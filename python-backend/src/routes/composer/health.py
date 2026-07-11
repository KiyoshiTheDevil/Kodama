"""Composer Bridge health endpoint."""

from flask import jsonify

from . import blueprint
from ._responses import bridge_headers


@blueprint.route("/composer-bridge/health")
def composer_bridge_health():
    return bridge_headers(jsonify({"bridge": "kodama", "ytdlp": "ok", "status": "ok"}))
