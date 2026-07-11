"""Mood/genre categories and the playlists within a category."""

from flask import jsonify, request

from src.lib import YoutubeResponseMapper

from . import blueprint
from ._services import music_session


# Old server.py: _parse_two_row_item
def _parse_two_row_item(renderer):
    """Parse a musicTwoRowItemRenderer (used on mood/genre category pages) into
    our generic item shape. Handles playlists, albums, artists and songs."""
    title = ""
    try:
        title = renderer["title"]["runs"][0]["text"]
    except (KeyError, IndexError, TypeError):
        pass
    subtitle = ""
    try:
        subtitle = "".join(r.get("text", "") for r in renderer.get("subtitle", {}).get("runs", []))
    except (KeyError, TypeError):
        pass
    thumb = None
    try:
        thumbs = renderer["thumbnailRenderer"]["musicThumbnailRenderer"]["thumbnail"]["thumbnails"]
        thumb = YoutubeResponseMapper.select_thumbnail(thumbs)
    except (KeyError, TypeError):
        pass
    nav = renderer.get("navigationEndpoint", {}) or {}
    if "watchPlaylistEndpoint" in nav:
        return {"type": "playlist", "playlistId": nav["watchPlaylistEndpoint"].get("playlistId", ""),
                "title": title, "subtitle": subtitle, "thumbnail": thumb}
    if "watchEndpoint" in nav:
        we = nav["watchEndpoint"]
        return {"type": "song", "videoId": we.get("videoId", ""), "playlistId": we.get("playlistId", ""),
                "title": title, "artists": subtitle, "subtitle": subtitle, "thumbnail": thumb}
    browse_id = (nav.get("browseEndpoint", {}) or {}).get("browseId", "")
    if browse_id.startswith("VL"):
        return {"type": "playlist", "playlistId": browse_id[2:], "title": title, "subtitle": subtitle, "thumbnail": thumb}
    if browse_id.startswith("MPRE"):
        return {"type": "album", "browseId": browse_id, "title": title, "subtitle": subtitle, "thumbnail": thumb}
    if browse_id.startswith("UC"):
        return {"type": "artist", "browseId": browse_id, "title": title, "subtitle": subtitle, "thumbnail": thumb}
    if browse_id:
        return {"type": "playlist", "playlistId": browse_id, "title": title, "subtitle": subtitle, "thumbnail": thumb}
    return None


@blueprint.route("/mood/categories")
def get_mood_categories():
    """Return all mood/genre categories grouped by section (For you / Moods & moments / Genres)."""
    try:
        cats = music_session().get_active_client().get_mood_categories()
        groups = {}
        seen_params = set()
        for section_title, items in cats.items():
            chips = []
            for item in items:
                params = item.get("params", "")
                if params in seen_params:
                    continue
                seen_params.add(params)
                chips.append({
                    "title": item.get("title", ""),
                    "params": params,
                })
            if chips:
                groups[section_title] = chips
        return jsonify(groups)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@blueprint.route("/mood/playlists")
def get_mood_playlists():
    try:
        params = request.args.get("params", "")
        if not params:
            return jsonify({"error": "params required"}), 400
        # Direct browse + robust manual parse — ytmusicapi.get_mood_playlists raises
        # KeyError('musicTwoRowItemRenderer') on genre category pages.
        response = music_session().get_active_client()._send_request(
            "browse", {"browseId": "FEmusic_moods_and_genres_category", "params": params}
        )
        try:
            tab = response["contents"]["singleColumnBrowseResultsRenderer"]["tabs"][0]
            section_list = tab["tabRenderer"]["content"]["sectionListRenderer"]["contents"]
        except (KeyError, IndexError, TypeError):
            section_list = []
        result = []
        seen = set()
        for section in section_list:
            items = []
            if "gridRenderer" in section:
                items = section["gridRenderer"].get("items", [])
            elif "musicCarouselShelfRenderer" in section:
                items = section["musicCarouselShelfRenderer"].get("contents", [])
            for it in items:
                renderer = it.get("musicTwoRowItemRenderer")
                if not renderer:
                    continue
                parsed = _parse_two_row_item(renderer)
                if not parsed:
                    continue
                key = parsed.get("playlistId") or parsed.get("browseId") or parsed.get("videoId") or parsed.get("title")
                if key in seen:
                    continue
                seen.add(key)
                result.append(parsed)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500
