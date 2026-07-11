"""Shared Last.fm track-action request handling."""

from flask import jsonify, request

from ._services import lastfm_client, read_active_metadata


def submit_track_action(method, http="POST", extra=None):
    """Submit now-playing, scrobble, love, or unlove data to Last.fm."""
    session_key = read_active_metadata().get("lastfm_session")
    if not session_key:
        return jsonify({"error": "not_connected"}), 400

    data = request.json or {}
    artist, track = data.get("artist", ""), data.get("track", "")
    if not artist or not track:
        return jsonify({"error": "missing_meta"}), 400

    params = {"sk": session_key, "artist": artist, "track": track}
    if data.get("album"):
        params["album"] = data["album"]
    if data.get("duration"):
        try:
            params["duration"] = str(int(float(data["duration"])))
        except (TypeError, ValueError):
            pass
    if extra:
        params.update(extra(data))

    ok, response = lastfm_client().lastfm_call(method, params, http=http, signed=True)
    if ok:
        return jsonify({"ok": True}), 200
    return jsonify({"ok": False, "error": response}), 502
