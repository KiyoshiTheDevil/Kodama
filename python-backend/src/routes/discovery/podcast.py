"""Podcast metadata and playable episodes."""

from flask import jsonify

from src.lib import YoutubeResponseMapper

from . import blueprint
from ._services import music_session


@blueprint.route("/podcast/<playlist_id>")
def get_podcast(playlist_id):
    """Fetch podcast metadata + episodes. Episodes have videoId and are playable."""
    try:
        data = music_session().get_active_client().get_podcast(playlist_id, limit=50)
        episodes = []
        for ep in (data.get("episodes") or []):
            if not ep.get("videoId"):
                continue
            episodes.append({
                "videoId": ep.get("videoId", ""),
                "browseId": ep.get("browseId", ""),
                "title": ep.get("title", ""),
                "description": ep.get("description", ""),
                "duration": ep.get("duration", ""),
                "date": ep.get("date", ""),
                "thumbnail": YoutubeResponseMapper.select_thumbnail(ep.get("thumbnails", [])),
            })
        author = data.get("author") or {}
        thumbs = data.get("thumbnails", [])
        return jsonify({
            "title": data.get("title", ""),
            "description": data.get("description", ""),
            "author": {"name": author.get("name", ""), "id": author.get("id", "")},
            "thumbnail": YoutubeResponseMapper.select_thumbnail(thumbs) if thumbs else None,
            "episodes": episodes,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500
