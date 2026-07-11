"""Shared services for music-library and detail-page routes."""

from flask import current_app


def music_session():
    return current_app.extensions["youtube_music_session"]


def profiles():
    return current_app.extensions["profile_repository"]


def cache_settings():
    return current_app.extensions["cache_settings"]


def playlist_cache():
    return current_app.extensions["playlist_cache"]


def album_cache():
    return current_app.extensions["album_cache"]


def song_credits_cache():
    return current_app.extensions["song_credits_cache"]
