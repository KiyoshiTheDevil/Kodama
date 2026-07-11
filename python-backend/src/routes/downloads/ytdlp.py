"""yt-dlp version check and in-place updater."""

from flask import jsonify

from . import blueprint
from ._services import ytdlp


@blueprint.route("/ytdlp/check-update")
def ytdlp_check_update():
    return jsonify(ytdlp().check_update())


@blueprint.route("/ytdlp/update", methods=["POST"])
def ytdlp_update():
    payload, status = ytdlp().update()
    return jsonify(payload), status
