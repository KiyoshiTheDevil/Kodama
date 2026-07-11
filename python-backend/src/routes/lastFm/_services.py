"""Shared access to Last.fm and active-profile services."""

from flask import current_app


def lastfm_client():
    return current_app.extensions["lastfm_client"]


def profile_repository():
    return current_app.extensions["profile_repository"]


def active_profile_name():
    session = current_app.extensions["youtube_music_session"]
    return session.state.current_profile or "default"


def read_active_metadata():
    return profile_repository().read_metadata(active_profile_name())


def write_active_metadata(metadata):
    profile_repository().write_metadata(active_profile_name(), metadata)
