from flask import Blueprint


blueprint = Blueprint("lastfm", __name__, url_prefix="/lastfm")

from . import connect, disconnect, love, now_playing, scrobble, session, status, unlove
