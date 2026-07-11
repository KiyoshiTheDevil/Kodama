"""Start Last.fm desktop authorization."""

from flask import jsonify

from src.config import config_lastfm

from . import blueprint
from ._services import lastfm_client


@blueprint.route("/connect")
def lastfm_connect():
    client = lastfm_client()
    if not client.lastfm_enabled():
        return jsonify({"error": "lastfm_not_configured"}), 400

    ok, response = client.lastfm_call("auth.getToken", signed=True)
    if not ok:
        return jsonify({"error": response.get("message", "token_failed")}), 500
    token = response.get("token", "")
    return jsonify(
        {
            "token": token,
            "authUrl": f"https://www.last.fm/api/auth/?api_key={config_lastfm.LASTFM_API_KEY}&token={token}",
        }
    )
