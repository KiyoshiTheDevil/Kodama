"""Shared app state used by the cache endpoints."""

from flask import current_app


def cache_settings():
    return current_app.extensions["cache_settings"]


def music_session():
    return current_app.extensions["youtube_music_session"]


def playlist_cache():
    return current_app.extensions["playlist_cache"]


def download_service():
    return current_app.extensions["download_service"]
