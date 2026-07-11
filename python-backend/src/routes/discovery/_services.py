"""Shared services for discovery routes."""

from flask import current_app


def music_session():
    return current_app.extensions["youtube_music_session"]
