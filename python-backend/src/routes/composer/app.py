"""Serve the bundled Composer single-page application."""

from flask import jsonify, send_from_directory
from werkzeug.exceptions import NotFound

from . import blueprint
from ._services import composer_bridge


@blueprint.route("/composer-app/", defaults={"subpath": ""})
@blueprint.route("/composer-app/<path:subpath>")
def composer_app(subpath):
    root = composer_bridge().composer_dist_directory()
    if not root.is_dir():
        return jsonify({"error": "composer_not_built"}), 404
    if subpath:
        try:
            return send_from_directory(str(root), subpath)
        except NotFound:
            pass
    return send_from_directory(str(root), "index.html")
