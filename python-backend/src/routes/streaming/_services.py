"""Shared access to the audio stream service."""

from flask import current_app


def stream_service():
    return current_app.extensions["stream_service"]
