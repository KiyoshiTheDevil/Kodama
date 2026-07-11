"""Shared services for the download, export, and tool-update routes."""

from flask import current_app


def download_service():
    return current_app.extensions["download_service"]


def export_service():
    return current_app.extensions["export_service"]


def ffmpeg():
    return current_app.extensions["ffmpeg"]


def ytdlp():
    return current_app.extensions["ytdlp"]


def music_session():
    return current_app.extensions["youtube_music_session"]
