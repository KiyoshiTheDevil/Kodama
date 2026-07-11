"""Shared access to the Composer Bridge service."""

from flask import current_app


def composer_bridge():
    return current_app.extensions["composer_bridge"]
