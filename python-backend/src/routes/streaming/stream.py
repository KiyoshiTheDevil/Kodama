"""Resolve a playable audio URL for a video."""

from flask import jsonify

from . import blueprint
from ._services import stream_service


@blueprint.route("/stream/<video_id>")
def stream_url(video_id):
    payload, status = stream_service().resolve_stream(video_id)
    return jsonify(payload), status
