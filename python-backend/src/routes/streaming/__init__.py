"""Audio streaming and progressive-proxy endpoints."""

from flask import Blueprint


blueprint = Blueprint("streaming", __name__)

from . import stream, prepare, audio  # noqa: E402,F401
