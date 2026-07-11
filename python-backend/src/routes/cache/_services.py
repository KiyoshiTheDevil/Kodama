"""Shared app state used by the cache endpoints."""

from flask import current_app


def cache_settings():
    return current_app.extensions["cache_settings"]


def music_session():
    return current_app.extensions["youtube_music_session"]
