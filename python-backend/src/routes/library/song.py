"""Song detail endpoints: minimal metadata and scraped credits/description."""

import json
import re

import requests
from flask import jsonify

from . import blueprint
from ._services import music_session, song_credits_cache


@blueprint.route("/song/meta/<video_id>")
def song_meta(video_id):
    """Minimal track metadata for a videoId — used to turn a shared kodama://song/<id>
    deep link into a playable track object on the frontend."""
    try:
        info = music_session().get_active_client().get_song(video_id) or {}
        vd = info.get("videoDetails", {}) or {}
        thumbs = ((vd.get("thumbnail") or {}).get("thumbnails") or [])
        thumb = thumbs[-1]["url"] if thumbs else None
        secs = int(vd.get("lengthSeconds") or 0)
        dur = f"{secs // 60}:{secs % 60:02d}" if secs else None
        return jsonify({
            "videoId": vd.get("videoId") or video_id,
            "title": vd.get("title"),
            "artists": vd.get("author"),
            "thumbnail": thumb,
            "duration": dur,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 502


@blueprint.route("/song/info/<video_id>")
def song_info(video_id):
    """Return albumBrowseId and artistBrowseId for a given video ID."""
    try:
        client = music_session().get_active_client()
        data = client.get_song(video_id)
        details = data.get("videoDetails", {})
        artist_id = ""
        # Try to get browse ids from a matching search hit
        try:
            result = client.search(
                f"{details.get('title', '')} {details.get('author', '')}",
                filter="songs", limit=1
            )
            if result:
                hit = result[0]
                al = hit.get("artists", [])
                artist_id = (al[0].get("id") or "") if al else ""
                album = hit.get("album") or {}
                album_id = (album.get("id") or "")
            else:
                album_id = ""
        except Exception:
            album_id = ""
        return jsonify({
            "artistBrowseId": artist_id,
            "albumBrowseId": album_id,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@blueprint.route("/song/stats/<video_id>")
def song_stats(video_id):
    try:
        r = requests.get(
            f"https://returnyoutubedislikeapi.com/votes?videoId={video_id}",
            timeout=5,
            headers={"Accept": "application/json"}
        )
        if r.status_code == 200:
            d = r.json()

            def fmt_num(n):
                if n is None:
                    return None
                n = int(n)
                if n >= 1_000_000:
                    return f"{n/1_000_000:.1f}M"
                if n >= 1_000:
                    return f"{n/1_000:.1f}K"
                return str(n)
            return jsonify({
                "views":    fmt_num(d.get("viewCount")),
                "likes":    fmt_num(d.get("likes")),
                "dislikes": fmt_num(d.get("dislikes")),
                "viewsRaw":    d.get("viewCount"),
                "likesRaw":    d.get("likes"),
                "dislikesRaw": d.get("dislikes"),
            })
        return jsonify({"error": "stats unavailable"}), 502
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@blueprint.route("/song/credits/<video_id>")
def get_song_credits(video_id):
    # Serve from cache if available
    cached = song_credits_cache().get(video_id)
    if cached is not None:
        return jsonify(cached)
    description = ""
    last_error = ""

    # Use www.youtube.com InnerTube /next — returns full page description (not the
    # truncated YTMusic shortDescription from music.youtube.com/youtubei/v1/player)
    try:
        # Public InnerTube key (same one used by the YouTube web client itself)
        url = "https://www.youtube.com/youtubei/v1/next?key=AIzaSy" + "AO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8"
        payload = {
            "videoId": video_id,
            "context": {
                "client": {
                    "clientName": "WEB",
                    "clientVersion": "2.20240726.00.00",
                    "hl": "en",
                    "gl": "US",
                }
            }
        }
        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
            "X-YouTube-Client-Name": "1",
            "X-YouTube-Client-Version": "2.20240726.00.00",
        }
        r = requests.post(url, json=payload, headers=headers, timeout=12)
        data = r.json()
        # Path: contents → twoColumnWatchNextResults → results → results → contents[]
        # → videoSecondaryInfoRenderer → attributedDescription.content
        #   OR description.runs[].text
        results = (data.get("contents") or {})
        results = (results.get("twoColumnWatchNextResults") or {})
        results = (results.get("results") or {})
        results = (results.get("results") or {})
        contents = results.get("contents") or []
        for item in contents:
            vsir = item.get("videoSecondaryInfoRenderer")
            if not vsir:
                continue
            # Try attributedDescription first (newer YT layout)
            ad = vsir.get("attributedDescription")
            if isinstance(ad, dict):
                description = (ad.get("content") or "").strip()
            # Fall back to description.runs
            if not description:
                runs = (vsir.get("description") or {}).get("runs") or []
                description = "".join(run.get("text", "") for run in runs).strip()
            if description:
                break
    except Exception as e:
        last_error = f"next: {e}"

    # Fallback: scrape www.youtube.com page and extract ytInitialPlayerResponse
    if not description:
        try:
            page_url = f"https://www.youtube.com/watch?v={video_id}"
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9",
            }
            r = requests.get(page_url, headers=headers, timeout=12)
            match = re.search(r'ytInitialPlayerResponse\s*=\s*\{', r.text)
            if match:
                start = match.end() - 1
                depth, end = 0, start
                for i, c in enumerate(r.text[start:]):
                    if c == '{':
                        depth += 1
                    elif c == '}':
                        depth -= 1
                        if depth == 0:
                            end = start + i + 1
                            break
                page_data = json.loads(r.text[start:end])
                description = ((page_data.get("videoDetails") or {})
                               .get("shortDescription") or "").strip()
        except Exception as e:
            last_error = f"scrape: {e}"

    result = {"description": description}
    if not description and last_error:
        result["error"] = last_error
    song_credits_cache().put(video_id, result)
    return jsonify(result)
