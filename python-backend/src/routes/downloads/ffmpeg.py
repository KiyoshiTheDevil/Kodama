"""FFmpeg availability, update check, and Windows auto-download (SSE)."""

from flask import Response, jsonify, request

from . import blueprint
from ._services import ffmpeg


@blueprint.route("/ffmpeg/status")
def ffmpeg_status():
    """Returns whether ffmpeg is available next to the server binary."""
    return jsonify({"available": ffmpeg().available()})


@blueprint.route("/ffmpeg/check-update")
def ffmpeg_check_update():
    """Compares the installed ffmpeg against gyan.dev's latest release version."""
    return jsonify(ffmpeg().check_update())


@blueprint.route("/ffmpeg/download")
def ffmpeg_download():
    # Read the flag here — the request context isn't live inside the generator.
    force = request.args.get("force") == "1"
    return Response(
        ffmpeg().download_stream(force),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
