"""Progressive range-forwarding audio proxy and stream-URL prewarming."""

from flask import Response, jsonify, request

from . import blueprint
from ._services import stream_service


@blueprint.route("/audio-stream/<video_id>")
def audio_stream(video_id):
    service = stream_service()
    upstream, error = service.open_audio_stream(video_id, request.headers.get("Range"))
    if error is not None:
        payload, status = error
        return jsonify(payload), status

    headers = service.build_proxy_headers(upstream)
    content_type = upstream.headers.get("Content-Type", "audio/mp4")
    return Response(
        service.iter_upstream(upstream),
        status=upstream.status_code,
        headers=headers,
        content_type=content_type,
    )


@blueprint.route("/audio-stream/<video_id>/warm")
def audio_stream_warm(video_id):
    return jsonify({"ok": stream_service().warm(video_id)})
