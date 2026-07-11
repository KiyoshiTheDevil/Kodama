"""Song download cache, audio export, and ffmpeg / yt-dlp tool endpoints."""

from flask import Blueprint


blueprint = Blueprint("downloads", __name__)

from . import download, cached, export, ffmpeg, ytdlp  # noqa: E402,F401
