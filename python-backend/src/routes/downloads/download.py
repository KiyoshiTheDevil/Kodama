"""Trigger and track background song downloads into the permanent cache."""

from flask import jsonify, request

from . import blueprint
from ._services import download_service


@blueprint.route("/song/download/<video_id>", methods=["POST"])
def download_song(video_id):
    service = download_service()
    if service.song_audio_path(video_id):
        service.status[video_id] = "done"
        return jsonify({"ok": True, "status": "done"})
    if service.status.get(video_id) == "downloading":
        return jsonify({"ok": True, "status": "downloading"})
    data = request.get_json() or {}
    meta = {
        "videoId": video_id,
        "title": data.get("title", ""),
        "artists": data.get("artists", ""),
        "album": data.get("album", ""),
        "duration": data.get("duration", ""),
        "thumbnail": data.get("thumbnail", ""),
    }
    service.start(video_id, meta)
    return jsonify({"ok": True, "status": "downloading"})


@blueprint.route("/song/download/status/<video_id>")
def download_status(video_id):
    service = download_service()
    if service.song_audio_path(video_id):
        return jsonify({"status": "done"})
    return jsonify({"status": service.status.get(video_id, "not_found")})


@blueprint.route("/downloads/queue")
def downloads_queue():
    return jsonify({"queue": download_service().queue_snapshot()})
