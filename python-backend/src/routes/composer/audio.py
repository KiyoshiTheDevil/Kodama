"""Stream Composer audio from local cache or the local stream resolver."""

from flask import Response, jsonify, send_file

from src.lib import ComposerBridgeError

from . import blueprint
from ._responses import bridge_headers, bridge_headers_with_metadata
from ._services import composer_bridge


@blueprint.route("/composer-bridge/audio/<video_id>")
def composer_bridge_audio(video_id):
    bridge = composer_bridge()
    metadata = bridge.track_metadata(video_id)
    cached_path = bridge.cached_audio_path(video_id)
    if cached_path:
        return bridge_headers_with_metadata(
            send_file(str(cached_path), mimetype=bridge.audio_mime_type(cached_path)),
            metadata,
        )

    try:
        upstream = bridge.open_audio_stream(video_id)
    except ComposerBridgeError as error:
        return bridge_headers(jsonify({"error": str(error)})), 502

    content_type = upstream.headers.get("Content-Type", "audio/mp4")
    return bridge_headers_with_metadata(
        Response(bridge.stream_with_optional_cache(video_id, upstream), content_type=content_type),
        metadata,
    )
