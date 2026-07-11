"""Serve the best available thumbnail for the local Composer app."""

from flask import Response, jsonify

from . import blueprint
from ._responses import bridge_headers
from ._services import composer_bridge


@blueprint.route("/composer-bridge/thumb/<video_id>")
def composer_bridge_thumb(video_id):
    thumbnail = composer_bridge().thumbnail(video_id)
    if thumbnail is None:
        return bridge_headers(jsonify({"error": "no_thumb"})), 404
    content, content_type = thumbnail
    return bridge_headers(Response(content, content_type=content_type))
