"""Shared services for the operations and integrations routes."""

from typing import cast

from flask import current_app

from src.lib.music.youtube_music import YoutubeMusicSession
from src.lib.runtime.network import NetworkSettings
from src.lib.runtime.overlay import OverlayServer
from src.lib.runtime.remote import RemoteControl


def overlay_server() -> OverlayServer:
    return cast(OverlayServer, current_app.extensions["overlay_server"])


def remote_control() -> RemoteControl:
    return cast(RemoteControl, current_app.extensions["remote_control"])


def network_settings() -> NetworkSettings:
    return cast(NetworkSettings, current_app.extensions["network_settings"])


def music_session() -> YoutubeMusicSession:
    return cast(YoutubeMusicSession, current_app.extensions["youtube_music_session"])


def server_start_time() -> float:
    return cast(float, current_app.extensions["server_start_time"])
