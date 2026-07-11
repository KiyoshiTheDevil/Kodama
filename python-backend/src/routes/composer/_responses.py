"""HTTP response decoration shared by Composer Bridge endpoints."""

from urllib.parse import quote

from src.config import config_composer
from src.lib import ComposerBridge


def bridge_headers(response):
    response.headers["Access-Control-Allow-Origin"] = config_composer.ORIGIN
    response.headers["Access-Control-Expose-Headers"] = ComposerBridge.EXPOSED_HEADERS
    return response


def bridge_headers_with_metadata(response, metadata):
    bridge_headers(response)
    if metadata.get("title"):
        response.headers["x-track-title"] = quote(metadata["title"])
    if metadata.get("artist"):
        response.headers["x-track-artist"] = quote(metadata["artist"])
    return response
