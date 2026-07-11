"""Complete Last.fm desktop authorization."""

from flask import jsonify, request

from . import blueprint
from ._services import lastfm_client, read_active_metadata, write_active_metadata


@blueprint.route("/session", methods=["POST"])
def lastfm_session():
    token = (request.json or {}).get("token", "")
    if not token:
        return jsonify({"error": "missing_token"}), 400

    ok, response = lastfm_client().lastfm_call("auth.getSession", {"token": token}, signed=True)
    if not ok:
        return jsonify({"error": response.get("message", "session_failed")}), 400

    lastfm_session = response.get("session", {})
    metadata = read_active_metadata()
    metadata["lastfm_session"] = lastfm_session.get("key", "")
    metadata["lastfm_user"] = lastfm_session.get("name", "")
    write_active_metadata(metadata)
    return jsonify({"connected": True, "username": lastfm_session.get("name", "")})
