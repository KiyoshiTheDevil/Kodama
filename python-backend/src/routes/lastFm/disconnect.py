"""Disconnect Last.fm from the active profile."""

from flask import jsonify

from . import blueprint
from ._services import read_active_metadata, write_active_metadata


@blueprint.route("/disconnect", methods=["POST"])
def lastfm_disconnect():
    metadata = read_active_metadata()
    metadata.pop("lastfm_session", None)
    metadata.pop("lastfm_user", None)
    write_active_metadata(metadata)
    return jsonify({"connected": False})
