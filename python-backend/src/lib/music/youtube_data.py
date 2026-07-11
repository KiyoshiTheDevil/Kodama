"""Mapping helpers for YouTube Music response payloads."""

import re


class YoutubeResponseMapper:
    """Normalizes artists and thumbnails from YouTube response payloads."""

    @staticmethod
    # Old server.py: _artist_links
    def build_artist_links(artist_list):
        """Return artists with a name and browse identifier."""
        return [
            {"name": artist.get("name", ""), "browseId": artist.get("id") or artist.get("browseId") or ""}
            for artist in (artist_list or [])
            if artist.get("name")
        ]

    @staticmethod
    # Old server.py: _pick_thumb
    def select_thumbnail(thumbs, min_size=226):
        """Pick the smallest thumbnail at least ``min_size`` pixels wide."""
        if not thumbs:
            return ""
        candidates = [thumb for thumb in thumbs if isinstance(thumb, dict) and thumb.get("width", 0) >= min_size]
        chosen = min(candidates, key=lambda thumb: thumb["width"]) if candidates else thumbs[0]
        return chosen.get("url", "") if isinstance(chosen, dict) else ""

    @staticmethod
    # Old server.py: _upscale_thumbnail_url
    def upscale_thumbnail_url(url: str) -> str:
        """Return a higher-resolution variant of a YouTube or Google image URL."""
        url = re.sub(r"=w\d+-h\d+[^&?#\s]*", "=w0-h0", url)
        return re.sub(r"/(mq|sd)?default\.jpg", "/hqdefault.jpg", url)
