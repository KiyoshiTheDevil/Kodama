"""
Kodama - Python Backend
Lokaler API-Server der ytmusicapi nutzt.
Starte mit: python server.py
"""

# ── Prefer IPv4 for all outbound connections ────────────────────────────────
# On machines with broken/blackholed IPv6, Python's socket stack tries the IPv6
# address first and stalls ~40s waiting for it to time out before falling back
# to IPv4 (unlike curl/browsers, it does not do Happy-Eyeballs). That made every
# outbound fetch — Google thumbnail CDN, YouTube Music — hang for ~40s. Filtering
# getaddrinfo to IPv4 removes the stall; harmless where IPv6 works.
import socket as _socket
_orig_getaddrinfo = _socket.getaddrinfo
def _ipv4_first_getaddrinfo(*args, **kwargs):
    res = _orig_getaddrinfo(*args, **kwargs)
    v4 = [r for r in res if r[0] == _socket.AF_INET]
    return v4 or res
_socket.getaddrinfo = _ipv4_first_getaddrinfo
# ────────────────────────────────────────────────────────────────────────────

from flask import Flask, jsonify, request, Response
from flask_cors import CORS
from ytmusicapi import YTMusic
import sys, os, json, glob, threading, time, requests, sqlite3, uuid, collections

app = Flask(__name__)
CORS(app, origins=[
    "http://localhost:1421",    # Tauri dev server
    "tauri://localhost",         # Tauri production (Windows/Linux)
    "https://tauri.localhost",   # Tauri production (Tauri 2.x, WebView2)
    "http://tauri.localhost",    # fallback
    "http://localhost",
    "http://127.0.0.1",
])

from contextlib import contextmanager

@app.route("/shutdown", methods=["GET", "POST"])
def shutdown():
    """Beendet den Server sauber."""
    import threading, os
    def _shutdown():
        import time
        time.sleep(0.2)
        os._exit(0)
    threading.Thread(target=_shutdown, daemon=True).start()
    return "ok"

@app.route("/status")
def status():
    return jsonify({"ok": True, "message": "Kodama Backend laeuft"})

def _is_signed_out_ytm_error(e):
    """Detect the ytmusicapi failure that occurs when the YouTube session is
    expired / signed out. In that state YT Music returns the signed-out
    'singleColumnBrowseResultsRenderer' (with a 'Sign in' prompt) instead of the
    authenticated 'twoColumnBrowseResultsRenderer', and ytmusicapi throws a
    cryptic parse error. We surface this as a clean 'please re-login' instead."""
    s = str(e)
    return "twoColumnBrowseResultsRenderer" in s or "singleColumnBrowseResultsRenderer" in s


@app.route("/liked")
def liked_songs():
    try:
        if is_local_profile(_current_profile):
            with local_db(_current_profile) as db:
                rows = db.execute(
                    "SELECT video_id, title, artists, album, thumbnail, duration FROM liked_songs ORDER BY liked_at DESC"
                ).fetchall()
            tracks = [{"videoId": r[0], "title": r[1], "artists": r[2], "album": r[3],
                       "thumbnail": r[4], "duration": r[5]} for r in rows]
            return jsonify({"tracks": tracks})
        limit = request.args.get("limit", None, type=int)
        songs = get_ytmusic().get_liked_songs(limit=limit)
        tracks = []
        for t in songs.get("tracks", []):
            artist_list = t.get("artists", [])
            artists = ", ".join(a["name"] for a in artist_list)
            artist_browse_id = (artist_list[0].get("id") or "") if artist_list else ""
            album = t.get("album", {})
            thumbs = t.get("thumbnails", [])
            thumbnail = _pick_thumb(thumbs)
            tracks.append({
                "videoId": t.get("videoId", ""),
                "title": t.get("title", ""),
                "artists": artists,
                "artistBrowseId": artist_browse_id,
                "artistLinks": _artist_links(artist_list),
                "album": album.get("name", "") if album else "",
                "albumBrowseId": (album.get("id") or "") if album else "",
                "duration": t.get("duration", ""),
                "thumbnail": thumbnail,
                "isExplicit": bool(t.get("isExplicit", False)),
            })
        return jsonify({"tracks": tracks})
    except Exception as e:
        if _is_signed_out_ytm_error(e):
            return jsonify({"error": "YouTube session expired", "code": "auth_expired"}), 401
        return jsonify({"error": str(e)}), 500

def _ydl_extract_url(video_id, fmt, skip_download=True, extra_opts=None, skip_auth=False, use_ytm=True):
    """Run yt-dlp extraction with the given format string. Returns info dict.

    use_ytm=True  → music.youtube.com (authenticated / YouTube Music content)
    use_ytm=False → www.youtube.com   (anonymous fallback; wider format availability)
    """
    import yt_dlp
    ydl_opts = {
        "format": fmt,
        "quiet": True,
        "no_warnings": True,
        "skip_download": skip_download,
    }
    if extra_opts:
        ydl_opts.update(extra_opts)
    if not skip_auth:
        _apply_ydl_auth(ydl_opts)
    base = "music.youtube.com" if use_ytm else "www.youtube.com"
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        return ydl.extract_info(
            f"https://{base}/watch?v={video_id}",
            download=False
        )

def _ydl_pick_any_audio(video_id, extra_opts=None, skip_auth=False, use_ytm=True):
    """Last-resort: fetch all formats without a selector and pick manually."""
    import yt_dlp
    ydl_opts = {"quiet": True, "no_warnings": True, "skip_download": True}
    if extra_opts:
        ydl_opts.update(extra_opts)
    if not skip_auth:
        _apply_ydl_auth(ydl_opts)
    base = "music.youtube.com" if use_ytm else "www.youtube.com"
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        info = ydl.extract_info(
            f"https://{base}/watch?v={video_id}",
            download=False
        )
    fmts = info.get("formats") or []
    _logging.info(f"[stream] {video_id} available formats: {[f.get('format_id') for f in fmts]}")
    audio_only = [f for f in fmts if f.get("acodec") != "none" and f.get("vcodec") == "none" and f.get("url")]
    has_audio  = [f for f in fmts if f.get("acodec") != "none" and f.get("url")]
    candidates = audio_only or has_audio or [f for f in fmts if f.get("url")]
    if candidates:
        return candidates[-1]["url"]
    return info.get("url")

# Strategy (2026): Web cookies ONLY work correctly with web clients.
# Mixing mobile client headers (android_music, ios) with web cookies causes
# YouTube to detect an inconsistency and return "Sign in to confirm you're not a bot".
# → Authenticated requests use web_music / default web client only.
# → Mobile clients are ALWAYS anonymous (no cookies = no client mismatch).
# → Anonymous fallbacks try youtube.com (use_ytm=False) for wider format availability.
def _browser_cookie_opts():
    """
    Return a list of ydl_opts dicts that use cookiesfrombrowser for each
    major browser installed on this machine.

    Uses the default web client (no extractor_args override) so that:
    - Browser cookies and web-client headers are consistent (no mismatch)
    - Newer yt-dlp versions can auto-extract PO tokens from browser storage
    """
    # Do NOT check PATH — browsers on Windows are NOT in PATH.
    # yt-dlp finds cookies via platform-specific default profile locations
    # (e.g. %LOCALAPPDATA%\Google\Chrome\User Data\Default\Network\Cookies).
    browsers = ["edge", "chrome", "firefox", "brave", "opera", "vivaldi", "chromium"]
    return [{"cookiesfrombrowser": (b,)} for b in browsers]


# ── Cached browser-cookie file ──────────────────────────────────────────────
# yt-dlp's `cookiesfrombrowser` re-decrypts the browser's cookie DB on EVERY
# call. On macOS that means a "Chrome Safe Storage" keychain prompt for every
# single /stream request (the "Always Allow" grant does not persist for an
# unsigned dev Python). To avoid that, we extract the browser cookies ONCE into
# a Netscape cookie file and reuse it via `cookiefile`, so the keychain is
# touched at most once per refresh interval instead of once per track.
#
# Trade-off vs. cookiesfrombrowser: a static cookie file cannot auto-extract PO
# tokens from live browser storage. In practice this is fine here; log in via
# the app for a first-class authenticated session if a track ever needs it.
_browser_cookie_lock = threading.Lock()
_browser_cookie_last_extract = 0.0

def _get_browser_cookiefile(force=False):
    """Return a path to a cached Netscape cookie file extracted from the user's
    browser, or None if none could be produced. Extraction (which may trigger a
    keychain prompt) runs at most once per TTL, and never more than once per
    _BROWSER_COOKIE_MIN_GAP even when forced."""
    global _browser_cookie_last_extract
    with _browser_cookie_lock:
        now = time.time()
        have = os.path.exists(_BROWSER_COOKIEFILE)
        fresh = have and (now - os.path.getmtime(_BROWSER_COOKIEFILE) < _BROWSER_COOKIE_TTL)
        if fresh and not force:
            return _BROWSER_COOKIEFILE
        if now - _browser_cookie_last_extract < _BROWSER_COOKIE_MIN_GAP:
            return _BROWSER_COOKIEFILE if have else None
        _browser_cookie_last_extract = now
        try:
            from yt_dlp.cookies import extract_cookies_from_browser, YoutubeDLCookieJar
        except Exception as e:
            _logging.debug(f"[cookies] yt-dlp cookie API unavailable: {e}")
            return _BROWSER_COOKIEFILE if have else None
        for browser in ("chrome", "edge", "brave", "firefox", "opera", "vivaldi", "chromium"):
            try:
                jar = extract_cookies_from_browser(browser)
            except Exception as e:
                _logging.debug(f"[cookies] {browser} extract failed: {e}")
                continue
            # Keep only YouTube/Google cookies — never dump the whole browser
            # cookie store to a plaintext file.
            filtered = YoutubeDLCookieJar()
            for c in jar:
                d = (c.domain or "").lower()
                if "youtube" in d or "google" in d:
                    filtered.set_cookie(c)
            if len(filtered):
                try:
                    filtered.save(_BROWSER_COOKIEFILE, ignore_discard=True, ignore_expires=True)
                    _logging.info(f"[cookies] cached {len(filtered)} cookies from {browser} -> browser_cookies.txt")
                    return _BROWSER_COOKIEFILE
                except Exception as e:
                    _logging.debug(f"[cookies] failed to save cookie file: {e}")
        _logging.info("[cookies] no browser cookies found to cache")
        return _BROWSER_COOKIEFILE if have else None


def _stream_url_from_info(info):
    url = info.get("url")
    if not url and info.get("formats"):
        audio_fmts = [f for f in info["formats"]
                      if f.get("acodec") != "none" and f.get("vcodec") == "none"]
        chosen = audio_fmts[-1] if audio_fmts else info["formats"][-1]
        url = chosen.get("url")
    return url

def _is_hard_error(err_str):
    # Only Music Premium is a guaranteed dead end regardless of client.
    # "Video unavailable" can still succeed with web_music/android_music
    # for YouTube Music exclusive content.
    return "Music Premium" in err_str

def _is_unavailable(err_str):
    return any(k in err_str for k in ("Video unavailable", "This video is not available"))

@app.route("/stream/<video_id>")
def stream_url(video_id):
    last_err = None
    _t_total = time.time()

    # ── Tier 1: browser cookies via a CACHED cookie file ─────────────────────
    # Uses a cookie file extracted from the browser once (see
    # _get_browser_cookiefile) rather than re-reading the browser on every call,
    # which would trigger a keychain prompt per track on macOS.
    _bcf = _get_browser_cookiefile()
    if _bcf:
        _t = time.time()
        try:
            info = _ydl_extract_url(video_id, _M4A_FMT, extra_opts={"cookiefile": _bcf}, skip_auth=True)
            url = _stream_url_from_info(info)
            if url:
                _logging.info(f"[stream] {video_id} OK via cached browser cookies in {time.time()-_t:.1f}s (total {time.time()-_t_total:.1f}s)")
                return jsonify({"url": url})
        except Exception as e:
            last_err = e
            _logging.warning(f"[stream] {video_id} cached-browser-cookies FAILED in {time.time()-_t:.1f}s: {e}")
            # Cookies may have gone stale — force one refresh (rate-limited to
            # once per 10 min) and retry, then fall through to the other tiers.
            if not _is_hard_error(str(e)):
                _bcf2 = _get_browser_cookiefile(force=True)
                if _bcf2:
                    try:
                        info = _ydl_extract_url(video_id, _M4A_FMT, extra_opts={"cookiefile": _bcf2}, skip_auth=True)
                        url = _stream_url_from_info(info)
                        if url:
                            _logging.info(f"[stream] {video_id} OK via refreshed browser cookies in {time.time()-_t:.1f}s")
                            return jsonify({"url": url})
                    except Exception as e2:
                        last_err = e2
                        _logging.warning(f"[stream] {video_id} refreshed-browser-cookies FAILED: {e2}")

    # ── Tier 2: _STREAM_ATTEMPTS (app cookies + anonymous mobile/web) ────────
    for fmt, extra, no_auth in _STREAM_ATTEMPTS:
        _t = time.time()
        try:
            info = _ydl_extract_url(video_id, fmt, extra_opts=extra, skip_auth=no_auth)
            url = _stream_url_from_info(info)
            if url:
                _logging.info(f"[stream] {video_id} OK via attempt {extra} no_auth={no_auth} in {time.time()-_t:.1f}s (total {time.time()-_t_total:.1f}s)")
                return jsonify({"url": url})
        except Exception as e:
            last_err = e
            _logging.warning(f"[stream] {video_id} attempt {extra} no_auth={no_auth} FAILED in {time.time()-_t:.1f}s: {e}")
            if _is_hard_error(str(e)):
                break

    # ── Tier 3: brute-force — no format selector, any audio format ───────────
    # Also retries with youtube.com URL for anonymous attempts: youtube.com
    # has wider format availability and is less restrictive than music.youtube.com
    # for anonymous/unauthenticated access.
    _hard_stop = False
    for no_auth, use_ytm in ((False, True), (True, True), (True, False)):
        if _hard_stop:
            break
        for extra in (None, _WEB_MUSIC_OPTS, _MWEB_OPTS, _ANDROID_OPTS, _IOS_OPTS, _TV_OPTS):
            if extra in (_ANDROID_OPTS, _IOS_OPTS, _TV_OPTS, _MWEB_OPTS) and not no_auth:
                continue  # never combine mobile clients with cookies
            try:
                url = _ydl_pick_any_audio(video_id, extra_opts=extra, skip_auth=no_auth, use_ytm=use_ytm)
                if url:
                    _logging.info(f"[stream] {video_id} recovered via brute-force no_auth={no_auth} ytm={use_ytm}")
                    return jsonify({"url": url})
            except Exception as e:
                last_err = e
                if _is_hard_error(str(e)) or _is_unavailable(str(e)):
                    _hard_stop = True
                    break
                _logging.warning(f"[stream] {video_id} brute-force no_auth={no_auth} ytm={use_ytm}: {e}")

    err_str = str(last_err) if last_err else "No URL found"
    premium = "Music Premium" in err_str
    unavailable = _is_unavailable(err_str)
    _logging.error(f"[stream] {video_id}: {type(last_err).__name__}: {err_str}")
    return jsonify({"error": err_str, "premium_only": premium, "unavailable": unavailable}), 500


@app.route("/stream-prepare/<video_id>")
def stream_prepare(video_id):
    """Download audio via yt-dlp to a temp file and return the local path.
    Rust reads from disk — no HTTP proxy overhead, no truncation."""
    import tempfile, glob as _glob
    cache_dir = os.path.join(tempfile.gettempdir(), "kiyoshi-audio")
    os.makedirs(cache_dir, exist_ok=True)

    # Check if already downloaded (skip WebM — symphonia has no Opus decoder)
    _PLAYABLE_EXTS = {".m4a", ".mp4", ".mp3", ".ogg", ".flac", ".wav"}
    existing = _glob.glob(os.path.join(cache_dir, f"{video_id}.*"))
    for ex in existing:
        ext = os.path.splitext(ex)[1].lower()
        if ext in _PLAYABLE_EXTS and os.path.getsize(ex) > 0:
            print(f"[stream-prepare] Cache hit: {ex}", flush=True)
            return jsonify({"path": ex})
        elif ext not in _PLAYABLE_EXTS and os.path.exists(ex):
            print(f"[stream-prepare] Removing unplayable cache file: {ex}", flush=True)
            try:
                os.remove(ex)
            except OSError:
                pass

    import yt_dlp
    outtmpl = os.path.join(cache_dir, "%(id)s.%(ext)s")
    last_err = None
    for fmt, extra, no_auth in _STREAM_ATTEMPTS:
        try:
            ydl_opts = {
                "format": fmt,
                "outtmpl": outtmpl,
                "quiet": True,
                "no_warnings": True,
            }
            if extra:
                ydl_opts.update(extra)
            if not no_auth:
                _apply_ydl_auth(ydl_opts)
            with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                info = ydl.extract_info(
                    f"https://music.youtube.com/watch?v={video_id}",
                    download=True
                )
                path = ydl.prepare_filename(info)
            _logging.info(f"[stream-prepare] downloaded {video_id}: {os.path.getsize(path)} bytes")
            return jsonify({"path": path})
        except Exception as e:
            last_err = e
            err_str = str(e)
            if _is_hard_error(err_str):
                break
            _logging.warning(f"[stream-prepare] {video_id} fmt={fmt} auth={not no_auth} failed: {e}")
    err_str = str(last_err) if last_err else "Download failed"
    premium = "Music Premium" in err_str
    unavailable = _is_unavailable(err_str)
    _logging.error(f"[stream-prepare] {video_id}: {type(last_err).__name__}: {err_str}")
    return jsonify({"error": err_str, "premium_only": premium, "unavailable": unavailable}), 500


# ── Progressive streaming proxy ─────────────────────────────────────────────
# Range-forwarding proxy so the Rust audio core can stream a song (fast start) instead of
# downloading it whole first, while keeping playback in the app process (OBS-capturable).
# The resolved googlevideo URL is cached per video (it's expensive to extract and the Rust
# source makes several range requests per song).
_audio_stream_url_cache = {}  # video_id -> (url, expiry_ts)

def _resolve_audio_url(video_id):
    import requests as req
    now = time.time()
    ent = _audio_stream_url_cache.get(video_id)
    if ent and ent[1] > now:
        return ent[0]
    try:
        d = req.get(f"http://127.0.0.1:9847/stream/{video_id}", timeout=60).json()
    except Exception:
        return None
    if d.get("premium_only"):
        return "premium_only"
    url = d.get("url")
    if url:
        _audio_stream_url_cache[video_id] = (url, now + 5 * 3600)
    return url

@app.route("/audio-stream/<video_id>")
def audio_stream(video_id):
    import requests as req
    from flask import Response
    range_header = request.headers.get("Range")
    up_headers = {"User-Agent": "Mozilla/5.0"}
    if range_header:
        up_headers["Range"] = range_header

    upstream = None
    for attempt in range(2):
        url = _resolve_audio_url(video_id)
        if url == "premium_only":
            return jsonify({"premium_only": True}), 403
        if not url:
            return jsonify({"error": "no_url"}), 502
        try:
            upstream = req.get(url, headers=up_headers, stream=True, timeout=60)
        except Exception as e:
            _audio_stream_url_cache.pop(video_id, None)
            if attempt == 0:
                continue
            return jsonify({"error": str(e)}), 502
        # Expired/blocked signed URL → drop cache and re-resolve once.
        if upstream.status_code in (403, 410) and attempt == 0:
            _audio_stream_url_cache.pop(video_id, None)
            continue
        break

    resp_headers = {"Accept-Ranges": "bytes"}
    for h in ("Content-Type", "Content-Length", "Content-Range"):
        v = upstream.headers.get(h)
        if v:
            resp_headers[h] = v
    ctype = upstream.headers.get("Content-Type", "audio/mp4")
    def gen():
        for chunk in upstream.iter_content(chunk_size=65536):
            if chunk:
                yield chunk
    return Response(gen(), status=upstream.status_code, headers=resp_headers, content_type=ctype)


@app.route("/audio-stream/<video_id>/warm")
def audio_stream_warm(video_id):
    """Resolve + cache the stream URL ahead of time (no byte transfer) so the next play of
    this song skips the yt-dlp extraction wait. Used to prewarm upcoming queue tracks."""
    url = _resolve_audio_url(video_id)
    return jsonify({"ok": bool(url) and url != "premium_only"})


@app.route("/library/playlists")
def library_playlists():
    try:
        if is_local_profile(_current_profile):
            with local_db(_current_profile) as db:
                rows = db.execute(
                    "SELECT playlist_id, title, description, (SELECT COUNT(*) FROM playlist_tracks WHERE playlist_id=p.playlist_id) FROM playlists p ORDER BY updated_at DESC"
                ).fetchall()
            result = [{"playlistId": r[0], "title": r[1], "description": r[2], "count": str(r[3]), "thumbnail": ""} for r in rows]
            return jsonify({"playlists": result})
        playlists = get_ytmusic().get_library_playlists(limit=50)
        result = []
        for p in playlists:
            thumbs = p.get("thumbnails", [])
            thumbnail = _pick_thumb(thumbs)
            result.append({
                "playlistId": p.get("playlistId", ""),
                "title": p.get("title", ""),
                "count": p.get("count", ""),
                "thumbnail": thumbnail,
            })
        return jsonify({"playlists": result})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/playlist/create", methods=["POST"])
def create_playlist():
    try:
        data = request.get_json() or {}
        title = data.get("title", "").strip()
        if not title:
            return jsonify({"error": "Title is required"}), 400
        description = data.get("description", "")
        privacy = data.get("privacyStatus", "PRIVATE")
        if is_local_profile(_current_profile):
            playlist_id = str(uuid.uuid4())
            now = int(time.time())
            with local_db(_current_profile) as db:
                db.execute(
                    "INSERT INTO playlists (playlist_id, title, description, privacy, created_at, updated_at) VALUES (?,?,?,?,?,?)",
                    (playlist_id, title, description, privacy, now, now)
                )
                db.commit()
            return jsonify({"ok": True, "playlistId": playlist_id})
        video_ids = data.get("videoIds")
        result = get_ytmusic().create_playlist(title, description, privacy_status=privacy, video_ids=video_ids)
        return jsonify({"ok": True, "playlistId": result})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/playlist/<playlist_id>/add", methods=["POST"])
def playlist_add_tracks(playlist_id):
    try:
        data = request.get_json() or {}
        video_ids = data.get("videoIds", [])
        if not video_ids:
            return jsonify({"error": "videoIds required"}), 400
        if is_local_profile(_current_profile):
            tracks_meta = {t["videoId"]: t for t in data.get("tracks", []) if "videoId" in t}
            now = int(time.time())
            with local_db(_current_profile) as db:
                max_pos = db.execute("SELECT COALESCE(MAX(position),0) FROM playlist_tracks WHERE playlist_id=?", (playlist_id,)).fetchone()[0]
                for i, vid in enumerate(video_ids):
                    meta = tracks_meta.get(vid, {})
                    svid = str(uuid.uuid4())
                    db.execute(
                        "INSERT INTO playlist_tracks (playlist_id, video_id, title, artists, album, thumbnail, duration, set_video_id, position, added_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                        (playlist_id, vid, meta.get("title",""), meta.get("artists",""),
                         meta.get("album",""), meta.get("thumbnail",""), meta.get("duration",""),
                         svid, max_pos + i + 1, now)
                    )
                db.execute("UPDATE playlists SET updated_at=? WHERE playlist_id=?", (now, playlist_id))
                db.commit()
            return jsonify({"ok": True})
        get_ytmusic().add_playlist_items(playlist_id, video_ids)
        _purge_playlist_cache(playlist_id)
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/playlist/<playlist_id>/remove", methods=["POST"])
def playlist_remove_tracks(playlist_id):
    try:
        data = request.get_json() or {}
        videos = data.get("videos", [])
        if not videos:
            return jsonify({"error": "videos required"}), 400
        if is_local_profile(_current_profile):
            with local_db(_current_profile) as db:
                for v in videos:
                    svid = v.get("setVideoId")
                    if svid:
                        db.execute("DELETE FROM playlist_tracks WHERE playlist_id=? AND set_video_id=?", (playlist_id, svid))
                    else:
                        db.execute("DELETE FROM playlist_tracks WHERE playlist_id=? AND video_id=?", (playlist_id, v.get("videoId","")))
                db.execute("UPDATE playlists SET updated_at=? WHERE playlist_id=?", (int(time.time()), playlist_id))
                db.commit()
            return jsonify({"ok": True})
        get_ytmusic().remove_playlist_items(playlist_id, videos)
        _purge_playlist_cache(playlist_id)
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/playlist/<playlist_id>/edit", methods=["POST"])
def playlist_edit(playlist_id):
    try:
        data = request.get_json() or {}
        title = data.get("title")
        description = data.get("description")
        privacy = data.get("privacyStatus")
        if is_local_profile(_current_profile):
            with local_db(_current_profile) as db:
                if title:
                    db.execute("UPDATE playlists SET title=?, updated_at=? WHERE playlist_id=?", (title, int(time.time()), playlist_id))
                if description is not None:
                    db.execute("UPDATE playlists SET description=? WHERE playlist_id=?", (description, playlist_id))
                if privacy:
                    db.execute("UPDATE playlists SET privacy=? WHERE playlist_id=?", (privacy, playlist_id))
                db.commit()
            return jsonify({"ok": True})
        get_ytmusic().edit_playlist(playlist_id, title=title, description=description, privacyStatus=privacy)
        _purge_playlist_cache(playlist_id)
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/playlist/<playlist_id>", methods=["DELETE"])
def delete_playlist(playlist_id):
    try:
        if is_local_profile(_current_profile):
            with local_db(_current_profile) as db:
                db.execute("DELETE FROM playlist_tracks WHERE playlist_id=?", (playlist_id,))
                db.execute("DELETE FROM playlists WHERE playlist_id=?", (playlist_id,))
                db.commit()
            return jsonify({"ok": True})
        get_ytmusic().delete_playlist(playlist_id)
        _purge_playlist_cache(playlist_id)
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/library/albums")
def library_albums():
    try:
        if is_local_profile(_current_profile):
            return jsonify({"albums": []})
        albums = get_ytmusic().get_library_albums(limit=50)
        result = []
        for a in albums:
            thumbs = a.get("thumbnails", [])
            thumbnail = _pick_thumb(thumbs)
            artists = ", ".join(x["name"] for x in a.get("artists", []))
            result.append({
                "browseId": a.get("browseId", ""),
                "title": a.get("title", ""),
                "artists": artists,
                "year": a.get("year", ""),
                "thumbnail": thumbnail,
            })
        return jsonify({"albums": result})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/library/artists")
def library_artists():
    try:
        if is_local_profile(_current_profile):
            return jsonify({"artists": []})
        artists = get_ytmusic().get_library_artists(limit=50)
        result = []
        for a in artists:
            thumbs = a.get("thumbnails", [])
            thumbnail = _pick_thumb(thumbs)
            result.append({
                "browseId": a.get("browseId", ""),
                "artist": a.get("artist", ""),
                "songs": a.get("songs", ""),
                "thumbnail": thumbnail,
            })
        return jsonify({"artists": result})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/playlist/<playlist_id>/stream")
def stream_playlist(playlist_id):
    import json
    from flask import Response, stream_with_context

    force_refresh = request.args.get("refresh", "0") == "1"

    def generate():
        try:
            CHUNK = 200

            # Local profile: serve locally-owned playlists (and Liked Songs) from
            # SQLite. Online playlists opened from Home/Explore (RDCLAK…, PL…,
            # OLAK5…) don't exist in the local DB — in that case fall through to
            # the online ytmusicapi fetch below instead of returning an empty
            # playlist titled with the raw ID.
            if is_local_profile(_current_profile):
                tracks = None
                pl_title = playlist_id
                with local_db(_current_profile) as db:
                    if playlist_id == "LM":
                        rows = db.execute(
                            "SELECT video_id, title, artists, album, thumbnail, duration FROM liked_songs ORDER BY liked_at DESC"
                        ).fetchall()
                        tracks = [{"videoId": r[0], "setVideoId": r[0], "title": r[1], "artists": r[2],
                                   "album": r[3], "thumbnail": r[4], "duration": r[5]} for r in rows]
                        pl_title = "Gelikte Songs"
                    else:
                        pl_row = db.execute("SELECT title FROM playlists WHERE playlist_id=?", (playlist_id,)).fetchone()
                        if pl_row:
                            pl_title = pl_row[0]
                            rows = db.execute(
                                "SELECT video_id, set_video_id, title, artists, album, thumbnail, duration FROM playlist_tracks WHERE playlist_id=? ORDER BY position ASC",
                                (playlist_id,)
                            ).fetchall()
                            tracks = [{"videoId": r[0], "setVideoId": r[1], "title": r[2], "artists": r[3],
                                       "album": r[4], "thumbnail": r[5], "duration": r[6]} for r in rows]
                if tracks is not None:
                    yield f"data: {json.dumps({'type':'header','title':pl_title,'thumbnail':'','total':len(tracks),'cached':True})}\n\n"
                    for i in range(0, len(tracks), CHUNK):
                        yield f"data: {json.dumps({'type':'tracks','tracks':tracks[i:i+CHUNK]})}\n\n"
                    yield f"data: {json.dumps({'type':'done'})}\n\n"
                    return
                # Not a local playlist → fall through to the online fetch below.

            def fmt(t):
                artist_list = t.get("artists", [])
                artists = ", ".join(a["name"] for a in artist_list)
                artist_browse_id = (artist_list[0].get("id") or "") if artist_list else ""
                thumbs = t.get("thumbnails", [])
                thumb = _pick_thumb(thumbs)
                album = t.get("album") or {}
                return {
                    "videoId": t.get("videoId", ""),
                    "setVideoId": t.get("setVideoId", ""),
                    "title": t.get("title", ""),
                    "artists": artists,
                    "artistBrowseId": artist_browse_id,
                    "artistLinks": _artist_links(artist_list),
                    "album": album.get("name", ""),
                    "albumBrowseId": (album.get("id") or ""),
                    "duration": t.get("duration", ""),
                    "thumbnail": thumb,
                    "isExplicit": bool(t.get("isExplicit", False)),
                }

            def send(obj):
                return f"data: {json.dumps(obj)}\n\n"

            def serve_cached(data):
                tracks = data["tracks"]
                yield send({"type": "header", "title": data["title"], "thumbnail": data["thumbnail"], "total": len(tracks), "cached": True})
                for i in range(0, len(tracks), CHUNK):
                    yield send({"type": "tracks", "tracks": tracks[i:i+CHUNK]})
                yield send({"type": "done"})

            if not force_refresh and _cache_enabled["playlists"]:
                # 1. In-memory cache (fastest) — skip if missing isExplicit field
                if playlist_id in _playlist_cache:
                    mem = _playlist_cache[playlist_id]
                    mem_tracks = mem.get("tracks", [])
                    if mem_tracks and "isExplicit" not in mem_tracks[0]:
                        del _playlist_cache[playlist_id]
                    else:
                        yield from serve_cached(mem)
                        return
                # 2. Disk cache
                disk = _load_playlist_disk(playlist_id)
                if disk:
                    _playlist_cache_put(playlist_id, disk)  # warm in-memory cache too
                    yield from serve_cached(disk)
                    return

            if playlist_id == "LM":
                yield send({"type": "loading", "message": "Liked Songs werden abgerufen\u2026", "progress": 0})
                songs = get_ytmusic().get_liked_songs(limit=None)
                all_tracks = [fmt(t) for t in songs.get("tracks", []) if t.get("videoId")]
                total = len(all_tracks)
                yield send({"type": "header", "title": "Liked Songs", "thumbnail": "", "total": total})
                for i in range(0, total, CHUNK):
                    pct = min(100, round((i + CHUNK) / total * 100)) if total else 100
                    yield send({"type": "progress", "progress": pct})
                    yield send({"type": "tracks", "tracks": all_tracks[i:i+CHUNK]})
                data = {"title": "Liked Songs", "thumbnail": "", "tracks": all_tracks}
                if _cache_enabled["playlists"]:
                    _playlist_cache_put(playlist_id, data)
                    _save_playlist_disk(playlist_id, data)
                yield send({"type": "done"})
                return

            yield send({"type": "loading", "message": "Playlist wird abgerufen\u2026", "progress": 0})
            playlist = get_ytmusic().get_playlist(playlist_id, limit=None)
            thumbs = playlist.get("thumbnails") or []
            thumbnail = _pick_thumb(thumbs)
            all_tracks = [fmt(t) for t in playlist.get("tracks", []) if t.get("videoId")]
            total = len(all_tracks)

            yield send({"type": "header", "title": playlist.get("title", ""), "thumbnail": thumbnail, "total": total})
            for i in range(0, total, CHUNK):
                pct = min(100, round((i + CHUNK) / total * 100)) if total else 100
                yield send({"type": "progress", "progress": pct})
                yield send({"type": "tracks", "tracks": all_tracks[i:i+CHUNK]})
            data = {"title": playlist.get("title", ""), "thumbnail": thumbnail, "tracks": all_tracks}
            if _cache_enabled["playlists"]:
                _playlist_cache_put(playlist_id, data)
                _save_playlist_disk(playlist_id, data)
            yield send({"type": "done"})

        except Exception as e:
            yield send({"type": "error", "message": str(e)})

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Transfer-Encoding": "chunked"}
    )

@app.route("/radio/<playlist_id>")
def get_radio(playlist_id):
    try:
        watch = get_ytmusic().get_watch_playlist(playlistId=playlist_id, limit=50)
        tracks = []
        for t in watch.get("tracks", []):
            if not t.get("videoId"):
                continue
            artist_list = t.get("artists") or []
            artists = ", ".join(a["name"] for a in artist_list if isinstance(a, dict) and a.get("name"))
            # get_watch_playlist returns thumbnail as a list of dicts OR a plain string
            thumb_raw = t.get("thumbnails") or t.get("thumbnail") or []
            if isinstance(thumb_raw, list):
                thumb = _pick_thumb(thumb_raw)
            elif isinstance(thumb_raw, str):
                thumb = thumb_raw
            else:
                thumb = ""
            album = t.get("album") or {}
            tracks.append({
                "videoId":    t.get("videoId", ""),
                "title":      t.get("title", ""),
                "artists":    artists,
                "album":      album.get("name", "") if isinstance(album, dict) else "",
                "thumbnail":  thumb,
                "duration":   t.get("duration") or t.get("length", ""),
                "isExplicit": bool(t.get("isExplicit", False)),
            })
        return jsonify({"tracks": tracks})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/playlist/<playlist_id>")
def get_playlist(playlist_id):
    try:
        if is_local_profile(_current_profile):
            with local_db(_current_profile) as db:
                if playlist_id == "LM":
                    rows = db.execute(
                        "SELECT video_id, title, artists, album, thumbnail, duration FROM liked_songs ORDER BY liked_at DESC"
                    ).fetchall()
                    tracks = [{"videoId": r[0], "setVideoId": r[0], "title": r[1], "artists": r[2],
                               "album": r[3], "thumbnail": r[4], "duration": r[5]} for r in rows]
                    return jsonify({"title": "Gelikte Songs", "thumbnail": "", "tracks": tracks})
                pl_row = db.execute("SELECT title FROM playlists WHERE playlist_id=?", (playlist_id,)).fetchone()
                rows = None
                if pl_row:
                    rows = db.execute(
                        "SELECT video_id, set_video_id, title, artists, album, thumbnail, duration FROM playlist_tracks WHERE playlist_id=? ORDER BY position ASC",
                        (playlist_id,)
                    ).fetchall()
            if pl_row:
                tracks = [{"videoId": r[0], "setVideoId": r[1], "title": r[2], "artists": r[3],
                           "album": r[4], "thumbnail": r[5], "duration": r[6]} for r in rows]
                return jsonify({"title": pl_row[0], "thumbnail": "", "tracks": tracks})
            # Not a local playlist → fall through to the online fetch below.

        # "LM" is the special Liked Songs playlist
        if playlist_id == "LM":
            songs = get_ytmusic().get_liked_songs(limit=None)
            tracks = []
            for t in songs.get("tracks", []):
                if not t.get("videoId"):
                    continue
                artist_list = t.get("artists", [])
                artists = ", ".join(a["name"] for a in artist_list)
                artist_browse_id = (artist_list[0].get("id") or "") if artist_list else ""
                thumbs = t.get("thumbnails", [])
                thumbnail = _pick_thumb(thumbs)
                album = t.get("album") or {}
                tracks.append({
                    "videoId": t.get("videoId", ""),
                    "setVideoId": t.get("setVideoId", ""),
                    "title": t.get("title", ""),
                    "artists": artists,
                    "artistBrowseId": artist_browse_id,
                    "artistLinks": _artist_links(artist_list),
                    "album": album.get("name", ""),
                    "albumBrowseId": (album.get("id") or ""),
                    "duration": t.get("duration", ""),
                    "thumbnail": thumbnail,
                    "isExplicit": bool(t.get("isExplicit", False)),
                })
            return jsonify({"title": "Liked Songs", "thumbnail": "", "tracks": tracks})

        playlist = get_ytmusic().get_playlist(playlist_id, limit=None)
        tracks = []
        for t in playlist.get("tracks", []):
            if not t.get("videoId"):
                continue
            artist_list = t.get("artists", [])
            artists = ", ".join(a["name"] for a in artist_list)
            artist_browse_id = (artist_list[0].get("id") or "") if artist_list else ""
            thumbs = t.get("thumbnails", [])
            thumbnail = _pick_thumb(thumbs)
            album = t.get("album") or {}
            tracks.append({
                "videoId": t.get("videoId", ""),
                "setVideoId": t.get("setVideoId", ""),
                "title": t.get("title", ""),
                "artists": artists,
                "artistBrowseId": artist_browse_id,
                "artistLinks": _artist_links(artist_list),
                "album": album.get("name", ""),
                "albumBrowseId": (album.get("id") or ""),
                "duration": t.get("duration", ""),
                "thumbnail": thumbnail,
                "isExplicit": bool(t.get("isExplicit", False)),
            })
        return jsonify({
            "title": playlist.get("title", ""),
            "thumbnail": (playlist.get("thumbnails") or [{}])[-1].get("url", ""),
            "tracks": tracks,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/album/<browse_id>")
def get_album(browse_id):
    try:
        force_refresh = request.args.get("refresh", "0") == "1"
        if not force_refresh and _cache_enabled["albums"]:
            cached = _load_album_disk(browse_id)
            if cached:
                return jsonify(cached)

        album = get_ytmusic().get_album(browse_id)
        tracks = []
        album_artists = album.get("artists", [])
        album_artist_name = ", ".join(a["name"] for a in album_artists)
        album_artist_browse_id = album_artists[0].get("id", "") if album_artists else ""
        for t in album.get("tracks", []):
            if not t.get("videoId"):
                continue
            track_artists = t.get("artists", [])
            artists = ", ".join(a["name"] for a in track_artists) or album_artist_name
            artist_browse_id = track_artists[0].get("id", "") if track_artists else album_artist_browse_id
            thumbs = album.get("thumbnails", [])
            thumbnail = _pick_thumb(thumbs)
            tracks.append({
                "videoId": t.get("videoId", ""),
                "title": t.get("title", ""),
                "artists": artists,
                "artistBrowseId": artist_browse_id,
                "artistLinks": _artist_links(track_artists or album_artists),
                "album": album.get("title", ""),
                "duration": t.get("duration", ""),
                "thumbnail": thumbnail,
                "isExplicit": bool(t.get("isExplicit", False)),
            })
        thumbs = album.get("thumbnails", [])
        result = {
            "title": album.get("title", ""),
            "artists": album_artist_name,
            "artistBrowseId": album_artist_browse_id,
            "year": album.get("year", ""),
            "thumbnail": _pick_thumb(thumbs),
            "tracks": tracks,
        }
        if _cache_enabled["albums"]:
            _save_album_disk(browse_id, result)
        return jsonify(result)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def _extract_artist_desc_url(browse_id):
    """ytmusicapi keeps only the first description run, dropping the trailing
    "From Wikipedia (URL)" link run. Re-fetch and pull the real source URL out."""
    try:
        from ytmusicapi.navigation import find_object_by_key, nav, SINGLE_COLUMN_TAB, SECTION_LIST
        resp = get_ytmusic()._send_request("browse", {"browseId": browse_id})
        results = nav(resp, SINGLE_COLUMN_TAB + SECTION_LIST)
        shelf = find_object_by_key(results, "musicDescriptionShelfRenderer", is_key=True)
        if not shelf:
            return None
        if isinstance(shelf, dict) and "musicDescriptionShelfRenderer" in shelf:
            shelf = shelf["musicDescriptionShelfRenderer"]
        for r in shelf.get("description", {}).get("runs", []):
            url = ((r.get("navigationEndpoint") or {}).get("urlEndpoint") or {}).get("url")
            if url and "creativecommons" not in url:
                return url
    except Exception:
        pass
    return None


@app.route("/artist/<browse_id>")
def get_artist(browse_id):
    try:
        artist = get_ytmusic().get_artist(browse_id)

        # Top songs
        tracks = []
        for t in (artist.get("songs", {}).get("results", []))[:20]:
            if not t.get("videoId"):
                continue
            thumbs = t.get("thumbnails", [])
            thumbnail = _pick_thumb(thumbs)
            # duration may be a pre-formatted string ("3:45") or absent;
            # fall back to duration_seconds if available
            duration = t.get("duration", "")
            if not duration:
                secs = t.get("duration_seconds") or t.get("durationSeconds") or 0
                if secs:
                    m, s = divmod(int(secs), 60)
                    duration = f"{m}:{s:02d}"
            tracks.append({
                "videoId": t.get("videoId", ""),
                "title": t.get("title", ""),
                "artists": artist.get("name", ""),
                "artistBrowseId": browse_id,
                "album": (t.get("album") or {}).get("name", ""),
                "albumBrowseId": ((t.get("album") or {}).get("id") or ""),
                "duration": duration,
                "thumbnail": thumbnail,
                "isExplicit": bool(t.get("isExplicit", False)),
            })

        # Albums
        albums = []
        for a in (artist.get("albums", {}).get("results", [])):
            thumbs = a.get("thumbnails", [])
            albums.append({
                "browseId": a.get("browseId", ""),
                "title": a.get("title", ""),
                "year": a.get("year", ""),
                "thumbnail": _pick_thumb(thumbs),
            })

        # Singles
        singles = []
        for s in (artist.get("singles", {}).get("results", [])):
            thumbs = s.get("thumbnails", [])
            singles.append({
                "browseId": s.get("browseId", ""),
                "title": s.get("title", ""),
                "year": s.get("year", ""),
                "thumbnail": _pick_thumb(thumbs),
            })

        # Videos
        videos = []
        for v in (artist.get("videos", {}).get("results", [])):
            if not v.get("videoId"):
                continue
            thumbs = v.get("thumbnails", [])
            v_artists = v.get("artists") or []
            videos.append({
                "videoId":   v.get("videoId", ""),
                "title":     v.get("title", ""),
                "artists":   ", ".join(a.get("name", "") for a in v_artists) or artist.get("name", ""),
                "views":     v.get("views", ""),
                "thumbnail": _pick_thumb(thumbs),
            })

        # Related artists ("Fans might also like")
        related = []
        for r in (artist.get("related", {}).get("results", [])):
            thumbs = r.get("thumbnails", [])
            related.append({
                "browseId":    r.get("browseId", ""),
                "title":       r.get("title", ""),
                "subscribers": r.get("subscribers", ""),
                "thumbnail":   _pick_thumb(thumbs),
            })

        thumbs = artist.get("thumbnails", [])
        _desc = artist.get("description", "") or ""
        return jsonify({
            "name":          artist.get("name", ""),
            "thumbnail":     _pick_thumb(thumbs),
            "description":   _desc,
            "descriptionUrl": (_extract_artist_desc_url(browse_id) if "wikipedia" in _desc.lower() else None),
            "subscribers":      artist.get("subscribers", "") or "",
            "monthlyListeners": artist.get("monthlyListeners", "") or "",
            "radioId":       artist.get("radioId", "") or "",
            "subscribed":    bool(artist.get("subscribed", False)),
            "channelId":     artist.get("channelId", "") or browse_id,
            "songsBrowseId": (lambda b: b[2:] if b.startswith("VL") else b)(artist.get("songs", {}).get("browseId", "") or ""),
            "albumsBrowseId": artist.get("albums", {}).get("browseId", "") or "",
            "albumsParams":   artist.get("albums", {}).get("params", "") or "",
            "singlesBrowseId": artist.get("singles", {}).get("browseId", "") or "",
            "singlesParams":   artist.get("singles", {}).get("params", "") or "",
            "tracks":  tracks,
            "albums":  albums,
            "singles": singles,
            "videos":  videos,
            "related": related,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/artist/<browse_id>/subscribe", methods=["POST"])
def artist_subscribe(browse_id):
    try:
        data = request.get_json(silent=True) or {}
        channel_id = data.get("channelId") or browse_id
        get_ytmusic().subscribe_artists([channel_id])
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/artist/<browse_id>/unsubscribe", methods=["POST"])
def artist_unsubscribe(browse_id):
    try:
        data = request.get_json(silent=True) or {}
        channel_id = data.get("channelId") or browse_id
        get_ytmusic().unsubscribe_artists([channel_id])
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/song/meta/<video_id>")
def song_meta(video_id):
    """Minimal track metadata for a videoId — used to turn a shared kodama://song/<id>
    deep link into a playable track object on the frontend."""
    try:
        info = get_ytmusic().get_song(video_id) or {}
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


@app.route("/song/credits/<video_id>")
def get_song_credits(video_id):
    # Serve from cache if available
    if video_id in _credits_cache:
        return jsonify(_credits_cache[video_id])
    import requests as req
    import re as _re
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
        r = req.post(url, json=payload, headers=headers, timeout=12)
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
            r = req.get(page_url, headers=headers, timeout=12)
            match = _re.search(r'ytInitialPlayerResponse\s*=\s*\{', r.text)
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
    _credits_cache[video_id] = result
    return jsonify(result)

@app.route("/artist_albums")
def get_artist_albums_route():
    channel_id = request.args.get("channelId", "")
    params = request.args.get("params", "")
    if not channel_id or not params:
        return jsonify({"error": "channelId and params are required"}), 400
    try:
        items = get_ytmusic().get_artist_albums(channel_id, params)
        result = []
        for a in (items or []):
            thumbs = a.get("thumbnails", [])
            result.append({
                "browseId":  a.get("browseId", ""),
                "title":     a.get("title", ""),
                "year":      a.get("year", ""),
                "thumbnail": _pick_thumb(thumbs),
                "type":      a.get("type", ""),
            })
        return jsonify({"albums": result})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/search")
def search():
    try:
        query = request.args.get("q", "")
        filter_type = request.args.get("filter", "songs")
        if not query:
            return jsonify({"results": []})

        results = get_ytmusic().search(query, filter=filter_type, limit=20)
        items = []

        for t in results:
            thumbs = t.get("thumbnails", [])
            thumbnail = _pick_thumb(thumbs)

            if filter_type == "songs":
                artist_list = t.get("artists", [])
                artists = ", ".join(a["name"] for a in artist_list)
                artist_browse_id = (artist_list[0].get("id") or "") if artist_list else ""
                album = t.get("album") or {}
                items.append({
                    "type": "song",
                    "videoId": t.get("videoId", ""),
                    "title": t.get("title", ""),
                    "artists": artists,
                    "artistBrowseId": artist_browse_id,
                    "artistLinks": _artist_links(artist_list),
                    "album": album.get("name", ""),
                    "albumBrowseId": (album.get("id") or ""),
                    "duration": t.get("duration", ""),
                    "thumbnail": thumbnail,
                    "isExplicit": bool(t.get("isExplicit", False)),
                })
            elif filter_type == "artists":
                items.append({
                    "type": "artist",
                    "browseId": t.get("browseId", ""),
                    "title": t.get("artist", "") or t.get("title", ""),
                    "subtitle": t.get("subscribers", ""),
                    "thumbnail": thumbnail,
                })
            elif filter_type == "albums":
                artist_list = t.get("artists", [])
                artists = ", ".join(a["name"] for a in artist_list)
                items.append({
                    "type": "album",
                    "browseId": t.get("browseId", ""),
                    "title": t.get("title", ""),
                    "artists": artists,
                    "year": t.get("year", ""),
                    "thumbnail": thumbnail,
                })

        return jsonify({"results": items})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def _is_podcast_section(title: str) -> bool:
    """Heuristic: section titles that typically contain podcasts or shows."""
    t = title.lower()
    return "podcast" in t or "episode" in t or "show" in t


@app.route("/home")
def get_home():
    try:
        home = get_ytmusic().get_home(limit=15)
        sections = []
        for section in home:
            title = section.get("title", "")
            contents = section.get("contents", [])
            section_is_podcast = _is_podcast_section(title)
            items = []
            for item in contents:
                # Song / video
                if item.get("videoId") and not section_is_podcast:
                    artist_list = item.get("artists", [])
                    artists = ", ".join(a["name"] for a in artist_list)
                    artist_browse_id = (artist_list[0].get("id") or "") if artist_list else ""
                    album = item.get("album") or {}
                    thumbs = item.get("thumbnails", [])
                    thumb = _pick_thumb(thumbs)
                    items.append({
                        "type": "song",
                        "videoId": item.get("videoId", ""),
                        "title": item.get("title", ""),
                        "artists": artists,
                        "artistBrowseId": artist_browse_id,
                        "artistLinks": _artist_links(artist_list),
                        "album": album.get("name", ""),
                        "albumBrowseId": (album.get("id") or ""),
                        "duration": item.get("duration", ""),
                        "thumbnail": thumb,
                        "isExplicit": bool(item.get("isExplicit", False)),
                    })
                # Podcast episode (has videoId but in a podcast section)
                elif item.get("videoId") and section_is_podcast:
                    thumbs = item.get("thumbnails", [])
                    thumb = _pick_thumb(thumbs)
                    items.append({
                        "type": "podcast_episode",
                        "videoId": item.get("videoId", ""),
                        "browseId": item.get("browseId", ""),
                        "title": item.get("title", ""),
                        "subtitle": item.get("description", "") or item.get("date", ""),
                        "thumbnail": thumb,
                    })
                # Playlist — or podcast series (playlistId present)
                elif item.get("playlistId"):
                    thumbs = item.get("thumbnails", [])
                    thumb = _pick_thumb(thumbs)
                    playlist_id = item.get("playlistId", "")
                    # Podcast series use playlist IDs that need the MPSP prefix when fetched
                    item_type = "podcast" if section_is_podcast else "playlist"
                    items.append({
                        "type": item_type,
                        "playlistId": playlist_id,
                        "title": item.get("title", ""),
                        "subtitle": item.get("description", "") or ", ".join(
                            a["name"] for a in item.get("artists", [])
                        ),
                        "thumbnail": thumb,
                    })
                # Podcast channel (has explicit podcastId field)
                elif item.get("podcastId"):
                    thumbs = item.get("thumbnails", [])
                    thumb = _pick_thumb(thumbs)
                    podcast_id = item.get("podcastId", "")
                    items.append({
                        "type": "podcast",
                        "playlistId": podcast_id,
                        "browseId": item.get("browseId", ""),
                        "title": item.get("title", ""),
                        "subtitle": item.get("author", {}).get("name", "") if isinstance(item.get("author"), dict) else "",
                        "thumbnail": thumb,
                    })
                # Album, Artist, or Podcast channel (YouTube channel IDs start with "UC")
                elif item.get("browseId"):
                    browse_id = item.get("browseId", "")
                    is_artist = browse_id.startswith("UC")
                    is_podcast_channel = browse_id.startswith("MPSP") or section_is_podcast
                    if is_podcast_channel and not is_artist:
                        item_type = "podcast"
                        playlist_id = browse_id[4:] if browse_id.startswith("MPSP") else browse_id
                    else:
                        item_type = "artist" if is_artist else "album"
                        playlist_id = ""
                    thumbs = item.get("thumbnails", [])
                    thumb = _pick_thumb(thumbs)
                    artists = ", ".join(a["name"] for a in item.get("artists", []))
                    entry = {
                        "type": item_type,
                        "browseId": browse_id,
                        "title": item.get("title", ""),
                        "subtitle": artists or item.get("year", ""),
                        "thumbnail": thumb,
                    }
                    if playlist_id:
                        entry["playlistId"] = playlist_id
                    items.append(entry)
            if items:
                sections.append({"title": title, "items": items})
        return jsonify({"sections": sections})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/podcast/<playlist_id>")
def get_podcast(playlist_id):
    """Fetch podcast metadata + episodes. Episodes have videoId and are playable."""
    try:
        data = get_ytmusic().get_podcast(playlist_id, limit=50)
        episodes = []
        for ep in (data.get("episodes") or []):
            if not ep.get("videoId"):
                continue
            thumbs = ep.get("thumbnails", [])
            thumb = _pick_thumb(thumbs)
            episodes.append({
                "videoId": ep.get("videoId", ""),
                "browseId": ep.get("browseId", ""),
                "title": ep.get("title", ""),
                "description": ep.get("description", ""),
                "duration": ep.get("duration", ""),
                "date": ep.get("date", ""),
                "thumbnail": thumb,
            })
        author = data.get("author") or {}
        thumbs = data.get("thumbnails", [])
        return jsonify({
            "title": data.get("title", ""),
            "description": data.get("description", ""),
            "author": {"name": author.get("name", ""), "id": author.get("id", "")},
            "thumbnail": _pick_thumb(thumbs) if thumbs else None,
            "episodes": episodes,
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/mood/categories")
def get_mood_categories():
    """Return all mood/genre categories grouped by section (For you / Moods & moments / Genres)."""
    try:
        cats = get_ytmusic().get_mood_categories()
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
        thumb = _pick_thumb(thumbs)
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


@app.route("/mood/playlists")
def get_mood_playlists():
    try:
        params = request.args.get("params", "")
        if not params:
            return jsonify({"error": "params required"}), 400
        # Direct browse + robust manual parse — ytmusicapi.get_mood_playlists raises
        # KeyError('musicTwoRowItemRenderer') on genre category pages.
        response = get_ytmusic()._send_request(
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


@app.route("/imgproxy")
def img_proxy():
    """Proxy YouTube thumbnail images with persistent disk cache."""
    import hashlib, urllib.request
    from flask import Response

    url = request.args.get("url", "")
    if not url:
        return "", 400

    # High-quality mode: try to upscale the YouTube/Google thumbnail URL.
    if request.args.get("hq", "0") == "1":
        url = _upscale_thumbnail_url(url)

    # Derive a stable filename from the URL
    url_hash = hashlib.sha1(url.encode()).hexdigest()
    # Detect extension from URL (default jpeg)
    ext = "jpg"
    for candidate in ("webp", "png", "gif"):
        if candidate in url.lower():
            ext = candidate
            break
    cache_path = os.path.join(IMG_CACHE_DIR, f"{url_hash}.{ext}")

    # Serve from disk if cached and fresh
    if _cache_enabled["images"] and os.path.exists(cache_path):
        age = time.time() - os.path.getmtime(cache_path)
        if age < IMG_CACHE_TTL:
            content_type = "image/webp" if ext == "webp" else f"image/{ext}"
            with open(cache_path, "rb") as f:
                data = f.read()
            resp = Response(data, content_type=content_type)
            resp.headers["Cache-Control"] = "public, max-age=604800"
            resp.headers["X-Cache"] = "HIT"
            return resp

    # Fetch from CDN (omit YouTube-specific Referer for non-ytimg domains).
    # Use requests (certifi CA bundle) rather than urllib: on macOS the bundled Python
    # has no system CA certs, so urllib HTTPS fails with CERTIFICATE_VERIFY_FAILED.
    try:
        headers = {"User-Agent": "Mozilla/5.0"}
        if "ytimg.com" in url or "yt3.ggpht.com" in url or "youtube.com" in url:
            headers["Referer"] = "https://music.youtube.com/"
        r = requests.get(url, headers=headers, timeout=10)
        r.raise_for_status()
        data = r.content
        content_type = r.headers.get("Content-Type", "image/jpeg")
        # Write to disk cache
        if _cache_enabled["images"]:
            with open(cache_path, "wb") as f:
                f.write(data)
        resp = Response(data, content_type=content_type)
        resp.headers["Cache-Control"] = "public, max-age=604800"
        resp.headers["X-Cache"] = "MISS"
        return resp
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/like/<video_id>", methods=["POST"])
def like_song(video_id):
    try:
        data = request.get_json() or {}
        rating = data.get("rating", "LIKE")
        if is_local_profile(_current_profile):
            with local_db(_current_profile) as db:
                if rating == "LIKE":
                    db.execute(
                        "INSERT OR REPLACE INTO liked_songs (video_id, title, artists, album, thumbnail, duration, liked_at) VALUES (?,?,?,?,?,?,?)",
                        (video_id, data.get("title",""), data.get("artists",""),
                         data.get("album",""), data.get("thumbnail",""),
                         data.get("duration",""), int(time.time()))
                    )
                else:
                    db.execute("DELETE FROM liked_songs WHERE video_id=?", (video_id,))
                db.commit()
            return jsonify({"ok": True, "rating": rating})
        get_ytmusic().rate_song(video_id, rating)
        return jsonify({"ok": True, "rating": rating})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/liked/ids")
def liked_ids():
    try:
        if is_local_profile(_current_profile):
            with local_db(_current_profile) as db:
                ids = [r[0] for r in db.execute("SELECT video_id FROM liked_songs").fetchall()]
            return jsonify({"ids": ids})
        songs = get_ytmusic().get_liked_songs(limit=None)
        ids = [t.get("videoId") for t in songs.get("tracks", []) if t.get("videoId")]
        return jsonify({"ids": ids})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route("/song/info/<video_id>")
def song_info(video_id):
    """Return albumBrowseId and artistBrowseId for a given video ID."""
    try:
        data = get_ytmusic().get_song(video_id)
        details = data.get("videoDetails", {})
        # Artist browse ID from microformat or videoDetails
        mf = data.get("microformat", {}).get("microformatDataRenderer", {})
        artist_id = ""
        # Try to get from related endpoints
        try:
            result = get_ytmusic().search(
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


@app.route("/song/stats/<video_id>")
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
                if n is None: return None
                n = int(n)
                if n >= 1_000_000: return f"{n/1_000_000:.1f}M"
                if n >= 1_000: return f"{n/1_000:.1f}K"
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

# ─── Song Cache / Offline Playback ──────────────────────────────────────────

def _song_audio_path(video_id):
    """Return the path to the cached audio file (.opus or .m4a)."""
    safe = video_id.replace("/", "_").replace("\\", "_")
    for ext in (".opus", ".m4a", ".webm", ".mp3"):
        p = os.path.join(SONG_CACHE_DIR, safe + ext)
        if os.path.exists(p):
            return p
    return None

def _player_audio_path(video_id):
    """Audio the player already downloaded via /stream-prepare (temp 'kiyoshi-audio' dir).
    Lets the Composer reuse the file the player just played instead of re-extracting it
    from YouTube — the slow part the user noticed."""
    import tempfile, glob as _glob
    cache_dir = os.path.join(tempfile.gettempdir(), "kiyoshi-audio")
    safe = video_id.replace("/", "_").replace("\\", "_")
    for p in _glob.glob(os.path.join(cache_dir, f"{safe}.*")):
        ext = os.path.splitext(p)[1].lower()
        if ext in (".m4a", ".mp4", ".mp3", ".ogg", ".flac", ".wav", ".webm", ".opus"):
            try:
                if os.path.getsize(p) > 0:
                    return p
            except OSError:
                pass
    return None

def _song_meta_path(video_id):
    safe = video_id.replace("/", "_").replace("\\", "_")
    return os.path.join(SONG_CACHE_DIR, safe + ".json")

def _download_song_bg(video_id, meta):
    """Background download via yt-dlp."""
    global _download_status, _download_queue
    try:
        import yt_dlp
        safe = video_id.replace("/", "_").replace("\\", "_")
        output_tpl = os.path.join(SONG_CACHE_DIR, safe + ".%(ext)s")

        def progress_hook(d):
            if d.get("status") == "downloading":
                total = d.get("total_bytes") or d.get("total_bytes_estimate") or 0
                downloaded = d.get("downloaded_bytes", 0)
                if total > 0 and video_id in _download_queue:
                    _download_queue[video_id]["progress"] = round(downloaded / total, 3)

        last_dl_err = None
        for fmt, extra, no_auth in _STREAM_ATTEMPTS:
            try:
                ydl_opts = {
                    "format": fmt,
                    "quiet": True,
                    "no_warnings": True,
                    "outtmpl": output_tpl,
                    "progress_hooks": [progress_hook],
                }
                if extra:
                    ydl_opts.update(extra)
                if not no_auth:
                    _apply_ydl_auth(ydl_opts)
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    ydl.download([f"https://music.youtube.com/watch?v={video_id}"])
                last_dl_err = None
                break
            except Exception as dl_e:
                last_dl_err = dl_e
                if _is_hard_error(str(dl_e)):
                    break
                _logging.warning(f"[download] {video_id} fmt={fmt} auth={not no_auth}: {dl_e}")
        if last_dl_err:
            raise last_dl_err
        # Save metadata
        meta_path = _song_meta_path(video_id)
        with open(meta_path, "w", encoding="utf-8") as f:
            json.dump(meta, f, ensure_ascii=False)
        _download_status[video_id] = "done"
        if video_id in _download_queue:
            _download_queue[video_id]["status"] = "done"
            _download_queue[video_id]["progress"] = 1.0
        _schedule_cleanup(_download_status, video_id)
        _schedule_cleanup(_download_queue, video_id)
    except Exception as e:
        _download_status[video_id] = "error"
        if video_id in _download_queue:
            _download_queue[video_id]["status"] = "error"
            if "Music Premium" in str(e):
                _download_queue[video_id]["error_type"] = "premium_only"
        _schedule_cleanup(_download_status, video_id)
        _schedule_cleanup(_download_queue, video_id)
        _logging.error(f"[download] {video_id}: {type(e).__name__}: {e}")


@app.route("/song/download/<video_id>", methods=["POST"])
def download_song(video_id):
    if _song_audio_path(video_id):
        _download_status[video_id] = "done"
        return jsonify({"ok": True, "status": "done"})
    if _download_status.get(video_id) == "downloading":
        return jsonify({"ok": True, "status": "downloading"})
    data = request.get_json() or {}
    meta = {
        "videoId": video_id,
        "title": data.get("title", ""),
        "artists": data.get("artists", ""),
        "album": data.get("album", ""),
        "duration": data.get("duration", ""),
        "thumbnail": data.get("thumbnail", ""),
    }
    _download_status[video_id] = "downloading"
    _download_queue[video_id] = {
        "videoId": video_id,
        "title": meta.get("title", ""),
        "artists": meta.get("artists", ""),
        "thumbnail": meta.get("thumbnail", ""),
        "status": "downloading",
        "progress": 0.0,
    }
    t = threading.Thread(target=_download_song_bg, args=(video_id, meta), daemon=True)
    t.start()
    return jsonify({"ok": True, "status": "downloading"})


@app.route("/song/download/status/<video_id>")
def download_status(video_id):
    if _song_audio_path(video_id):
        return jsonify({"status": "done"})
    status = _download_status.get(video_id, "not_found")
    return jsonify({"status": status})


@app.route("/downloads/queue")
def downloads_queue():
    # Return active + recently finished entries; clean up old "done"/"error" entries
    to_remove = [vid for vid, d in _download_queue.items() if d["status"] in ("done", "error")]
    # Keep them in response but prune after returning
    result = list(_download_queue.values())
    for vid in to_remove:
        _download_queue.pop(vid, None)
    return jsonify({"queue": result})


@app.route("/song/cached/<video_id>")
def serve_cached_song(video_id):
    from flask import send_file
    path = _song_audio_path(video_id)
    if not path:
        return jsonify({"error": "not cached"}), 404
    # Determine MIME type
    ext = os.path.splitext(path)[1].lower()
    mime = {".opus": "audio/opus", ".m4a": "audio/mp4", ".webm": "audio/webm", ".mp3": "audio/mpeg"}.get(ext, "application/octet-stream")
    return send_file(path, mimetype=mime)


@app.route("/song/cached/list")
def list_cached_songs():
    songs = []
    try:
        for f in os.listdir(SONG_CACHE_DIR):
            if f.endswith(".json"):
                try:
                    with open(os.path.join(SONG_CACHE_DIR, f), "r", encoding="utf-8") as fh:
                        meta = json.load(fh)
                        songs.append(meta)
                except Exception:
                    pass
    except Exception:
        pass
    return jsonify({"songs": songs})


@app.route("/song/cached/<video_id>", methods=["DELETE"])
def delete_cached_song(video_id):
    audio = _song_audio_path(video_id)
    if audio:
        try:
            os.remove(audio)
        except Exception:
            pass
    meta = _song_meta_path(video_id)
    if os.path.exists(meta):
        try:
            os.remove(meta)
        except Exception:
            pass
    _download_status.pop(video_id, None)
    return jsonify({"ok": True})


@app.route("/songs/cached/delete-batch", methods=["POST"])
def delete_cached_songs_batch():
    data = request.get_json() or {}
    video_ids = data.get("videoIds", [])
    for video_id in video_ids:
        audio = _song_audio_path(video_id)
        if audio:
            try:
                os.remove(audio)
            except Exception:
                pass
        meta = _song_meta_path(video_id)
        if os.path.exists(meta):
            try:
                os.remove(meta)
            except Exception:
                pass
        _download_status.pop(video_id, None)
    return jsonify({"ok": True, "removed": len(video_ids)})


# ─── Audio Export (Save to user-chosen location) ─────────────────────────────

_export_status = {}  # video_id -> "exporting" | "done" | "error"

def _find_ffmpeg():
    """Find ffmpeg binary — check bundled location first, then PATH."""
    bin_name = "ffmpeg.exe" if sys.platform == "win32" else "ffmpeg"
    candidates = []
    if getattr(sys, 'frozen', False):
        # Next to the server executable (primary install-dir location)
        candidates.append(os.path.join(os.path.dirname(sys.executable), bin_name))
        # PyInstaller _MEIPASS temp dir (in case user bundled ffmpeg inside)
        meipass = getattr(sys, '_MEIPASS', None)
        if meipass:
            candidates.append(os.path.join(meipass, bin_name))
            # One level up from _MEIPASS (install dir)
            candidates.append(os.path.join(os.path.dirname(meipass), bin_name))
    else:
        candidates.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), bin_name))

    # macOS: also probe the app bundle's Resources and the common Homebrew locations
    # (most Mac users get ffmpeg via `brew install ffmpeg`).
    if sys.platform == "darwin":
        if getattr(sys, 'frozen', False):
            candidates.append(os.path.join(os.path.dirname(sys.executable), "..", "Resources", bin_name))
        candidates.append("/opt/homebrew/bin/ffmpeg")   # Apple Silicon brew
        candidates.append("/usr/local/bin/ffmpeg")       # Intel brew

    for bundled in candidates:
        if os.path.exists(bundled):
            return os.path.dirname(bundled)

    # Check PATH
    import shutil as _sh
    if _sh.which("ffmpeg"):
        return None  # yt-dlp will find it in PATH
    return False  # not found


def _ffmpeg_exe_path():
    """Absolute path (or bare 'ffmpeg' for PATH) to the binary, or None if unavailable."""
    d = _find_ffmpeg()
    if d is False:
        return None
    bin_name = "ffmpeg.exe" if sys.platform == "win32" else "ffmpeg"
    return os.path.join(d, bin_name) if d else bin_name


def _ffmpeg_version():
    """Installed ffmpeg version as a dotted string (e.g. '8.1'), or None."""
    import re as _re, subprocess as _sp
    exe = _ffmpeg_exe_path()
    if not exe:
        return None
    try:
        _kw = {"creationflags": 0x08000000} if sys.platform == "win32" else {}  # CREATE_NO_WINDOW
        out = _sp.run([exe, "-version"], capture_output=True, text=True, timeout=10, **_kw).stdout or ""
        m = _re.search(r"version\s+(\d+(?:\.\d+)+)", out)
        return m.group(1) if m else None
    except Exception:
        return None


_FFMPEG_LATEST = {"ts": 0.0, "ver": None}
def _ffmpeg_latest_version():
    """Latest gyan.dev release version (cached 1h), or None on failure."""
    now = time.time()
    if _FFMPEG_LATEST["ver"] and now - _FFMPEG_LATEST["ts"] < 3600:
        return _FFMPEG_LATEST["ver"]
    try:
        r = requests.get("https://www.gyan.dev/ffmpeg/builds/release-version", timeout=10)
        r.raise_for_status()
        ver = (r.text or "").strip()
        if ver:
            _FFMPEG_LATEST.update(ts=now, ver=ver)
            return ver
    except Exception:
        pass
    return None


def _ver_tuple(v):
    import re as _re
    return tuple(int(x) for x in _re.findall(r"\d+", v or ""))

def _embed_metadata(file_path, meta, fmt="opus"):
    """Embed artist, title, album, year, and cover art into audio file."""
    try:
        import requests as _req
        from mutagen import File as MutagenFile
        title = meta.get("title", "")
        artists = meta.get("artists", "")
        album = meta.get("album", "")
        year = meta.get("year", "")
        thumbnail = meta.get("thumbnail", "")

        print(f"Metadata: embedding for {file_path} | title={title} | artists={artists} | album={album} | year={year} | thumbnail={thumbnail[:80] if thumbnail else 'EMPTY'}")

        # Download cover art and convert to JPEG for maximum compatibility
        cover_data = None
        cover_mime = "image/jpeg"
        if thumbnail:
            try:
                # Request high-res version (YouTube Music thumbnails support size params)
                thumb_url = thumbnail
                if "lh3.googleusercontent.com" in thumb_url:
                    # Replace size suffix to get 500x500 cover
                    import re
                    thumb_url = re.sub(r'=w\d+-h\d+.*$', '=w500-h500-l90-rj', thumb_url)
                    if '=' not in thumb_url:
                        thumb_url += '=w500-h500-l90-rj'
                r = _req.get(thumb_url, timeout=10)
                print(f"Metadata: thumbnail download status={r.status_code} content-type={r.headers.get('content-type','')} size={len(r.content)}")
                if r.ok and len(r.content) > 100:
                    ct = r.headers.get("content-type", "")
                    # Convert to JPEG for best compatibility (WebP is not widely supported in tags)
                    if "webp" in ct or "png" in ct or thumbnail.endswith(".webp") or thumbnail.endswith(".png"):
                        try:
                            from io import BytesIO
                            from PIL import Image
                            img = Image.open(BytesIO(r.content))
                            img = img.convert("RGB")
                            buf = BytesIO()
                            img.save(buf, format="JPEG", quality=90)
                            cover_data = buf.getvalue()
                            print(f"Metadata: converted image to JPEG, {len(cover_data)} bytes")
                        except ImportError:
                            # Pillow not available, use raw data with detected mime
                            cover_data = r.content
                            if "webp" in ct:
                                cover_mime = "image/webp"
                            elif "png" in ct:
                                cover_mime = "image/png"
                            print(f"Metadata: Pillow not available, using raw {cover_mime}")
                        except Exception as img_err:
                            print(f"Metadata: image conversion failed: {img_err}, using raw")
                            cover_data = r.content
                    else:
                        cover_data = r.content
                        print(f"Metadata: using JPEG cover, {len(cover_data)} bytes")
                else:
                    print(f"Metadata: thumbnail download failed or empty")
            except Exception as e:
                print(f"Metadata: thumbnail download error: {e}")
        else:
            print(f"Metadata: no thumbnail URL provided")

        # Auto-detect actual container format
        audio = MutagenFile(file_path)
        if audio is None:
            print(f"Metadata: mutagen could not identify {file_path}")
            return

        type_name = type(audio).__name__
        print(f"Metadata: detected {type_name} for {file_path}")

        if type_name in ("OggOpus", "OggVorbis"):
            if title:
                audio["title"] = [title]
            if artists:
                audio["artist"] = [artists]
            if album:
                audio["album"] = [album]
            if year:
                audio["date"] = [str(year)]
            if cover_data:
                from mutagen.flac import Picture
                import base64
                pic = Picture()
                pic.type = 3
                pic.mime = cover_mime
                pic.desc = "Cover"
                pic.data = cover_data
                audio["metadata_block_picture"] = [base64.b64encode(pic.write()).decode("ascii")]
                print(f"Metadata: embedded OGG cover ({len(cover_data)} bytes, {cover_mime})")
            audio.save()
            print(f"Metadata: OGG tags saved successfully")

        elif type_name == "MP3":
            from mutagen.id3 import TIT2, TPE1, TALB, TDRC, TYER, APIC
            if audio.tags is None:
                audio.add_tags()
            tags = audio.tags
            if title:
                tags.add(TIT2(encoding=3, text=[title]))
            if artists:
                tags.add(TPE1(encoding=3, text=[artists]))
            if album:
                tags.add(TALB(encoding=3, text=[album]))
            if year:
                tags.add(TDRC(encoding=3, text=[str(year)]))
                tags.add(TYER(encoding=3, text=[str(year)]))  # ID3v2.3 year tag for Windows compatibility
            if cover_data:
                tags.add(APIC(encoding=3, mime=cover_mime, type=3, desc="Cover", data=cover_data))
                print(f"Metadata: embedded MP3 cover ({len(cover_data)} bytes, {cover_mime})")
            # Save as ID3v2.3 for Windows Explorer compatibility
            audio.save(v2_version=3)
            print(f"Metadata: MP3 tags saved as ID3v2.3 successfully")

        elif type_name in ("MP4",):
            if title:
                audio["\xa9nam"] = [title]
            if artists:
                audio["\xa9ART"] = [artists]
            if album:
                audio["\xa9alb"] = [album]
            if year:
                audio["\xa9day"] = [str(year)]
            if cover_data:
                from mutagen.mp4 import MP4Cover
                audio["covr"] = [MP4Cover(cover_data, imageformat=MP4Cover.FORMAT_JPEG)]
            audio.save()

        else:
            print(f"Metadata: unsupported format {type_name} for {file_path}")

    except Exception as e:
        print(f"Metadata embed error: {e}")


def _export_audio_bg(video_id, output_path, fmt="opus", meta=None):
    """Download / convert song and save to user-chosen path."""
    global _export_status
    try:
        import yt_dlp, shutil, tempfile

        # For OPUS: download, convert WebM→OGG/Opus via ffmpeg, then tag with mutagen
        if fmt == "opus":
            tmp_dir = tempfile.mkdtemp()
            tmp_tpl = os.path.join(tmp_dir, "export.%(ext)s")
            ffmpeg_dir = _find_ffmpeg()
            last_exp_err = None
            for fmt, extra, no_auth in _STREAM_ATTEMPTS:
                try:
                    ydl_opts = {
                        "format": fmt,
                        "quiet": True,
                        "no_warnings": True,
                        "outtmpl": tmp_tpl,
                    }
                    if extra:
                        ydl_opts.update(extra)
                    if not no_auth:
                        _apply_ydl_auth(ydl_opts)
                    # Convert to proper OGG/Opus via ffmpeg so mutagen can tag it
                    if ffmpeg_dir is not False:
                        ydl_opts["postprocessors"] = [{
                            "key": "FFmpegExtractAudio",
                            "preferredcodec": "opus",
                            "preferredquality": "0",
                        }]
                        if ffmpeg_dir:
                            ydl_opts["ffmpeg_location"] = ffmpeg_dir
                    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                        ydl.download([f"https://music.youtube.com/watch?v={video_id}"])
                    last_exp_err = None
                    break
                except Exception as exp_e:
                    last_exp_err = exp_e
                    if _is_hard_error(str(exp_e)):
                        break
                    _logging.warning(f"[export-opus] {video_id} fmt={fmt} auth={not no_auth}: {exp_e}")
            if last_exp_err:
                raise last_exp_err
            # Find the resulting file
            for f in os.listdir(tmp_dir):
                if f.startswith("export.") and not f.endswith((".json", ".jpg", ".png", ".webp")):
                    src = os.path.join(tmp_dir, f)
                    shutil.move(src, output_path)
                    break
            # Now embed metadata via mutagen (works on proper OGG/Opus files)
            if meta and os.path.exists(output_path):
                _embed_metadata(output_path, meta, "opus")
            _export_status[video_id] = "done"
            _schedule_cleanup(_export_status, video_id)
            try:
                shutil.rmtree(tmp_dir)
            except Exception:
                pass
            return

        # For MP3: need ffmpeg
        ffmpeg_dir = _find_ffmpeg()
        if ffmpeg_dir is False:
            _export_status[video_id] = "error"
            _schedule_cleanup(_export_status, video_id)
            print(f"MP3 export error: ffmpeg not found")
            return

        tmp_dir = tempfile.mkdtemp()
        tmp_tpl = os.path.join(tmp_dir, "export.%(ext)s")
        last_mp3_err = None
        for fmt, extra, no_auth in _STREAM_ATTEMPTS:
            try:
                ydl_opts = {
                    "format": fmt,
                    "quiet": True,
                    "no_warnings": True,
                    "outtmpl": tmp_tpl,
                    "postprocessors": [{
                        "key": "FFmpegExtractAudio",
                        "preferredcodec": "mp3",
                        "preferredquality": "192",
                    }],
                }
                if extra:
                    ydl_opts.update(extra)
                if not no_auth:
                    _apply_ydl_auth(ydl_opts)
                if ffmpeg_dir:
                    ydl_opts["ffmpeg_location"] = ffmpeg_dir
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    ydl.download([f"https://music.youtube.com/watch?v={video_id}"])
                last_mp3_err = None
                break
            except Exception as mp3_e:
                last_mp3_err = mp3_e
                if _is_hard_error(str(mp3_e)):
                    break
                _logging.warning(f"[export-mp3] {video_id} fmt={fmt} auth={not no_auth}: {mp3_e}")
        if last_mp3_err:
            raise last_mp3_err

        mp3 = os.path.join(tmp_dir, "export.mp3")
        if os.path.exists(mp3):
            shutil.move(mp3, output_path)
        if meta and os.path.exists(output_path):
            _embed_metadata(output_path, meta, "mp3")
        _export_status[video_id] = "done"
        _schedule_cleanup(_export_status, video_id)
        try:
            shutil.rmtree(tmp_dir)
        except Exception:
            pass
    except Exception as e:
        _export_status[video_id] = "error"
        _schedule_cleanup(_export_status, video_id)
        print(f"Audio export error for {video_id}: {e}")


@app.route("/song/export/<video_id>", methods=["POST"])
def export_audio(video_id):
    data = request.get_json() or {}
    output_path = data.get("output_path", "")
    fmt = data.get("format", "opus")  # "mp3" or "opus"
    if not output_path:
        return jsonify({"error": "output_path required"}), 400
    if _export_status.get(video_id) == "exporting":
        return jsonify({"ok": True, "status": "exporting"})
    year = data.get("year", "")
    album_browse_id = data.get("albumBrowseId", "")
    print(f"Export request: video_id={video_id} fmt={fmt} year='{year}' albumBrowseId='{album_browse_id}' thumbnail='{data.get('thumbnail','')[:60]}'")
    # Try to fetch year from album data if not provided
    if not year and album_browse_id:
        try:
            album_data = get_ytmusic().get_album(album_browse_id)
            year = album_data.get("year", "")
            print(f"Export: fetched year={year} from album {album_browse_id}")
        except Exception as e:
            print(f"Export: failed to fetch album year: {e}")
    # Fallback: fetch song info to get year from the song's album
    if not year:
        try:
            song_info = get_ytmusic().get_song(video_id)
            vd = song_info.get("videoDetails", {})
            # Try microformat for year
            mf = song_info.get("microformat", {}).get("microformatDataRenderer", {})
            upload_date = mf.get("uploadDate", "")  # e.g. "2022-06-17"
            if upload_date and len(upload_date) >= 4:
                year = upload_date[:4]
                print(f"Export: got year={year} from song upload date")
        except Exception as e:
            print(f"Export: failed to fetch song info for year: {e}")
    meta = {
        "title": data.get("title", ""),
        "artists": data.get("artists", ""),
        "album": data.get("album", ""),
        "year": year,
        "thumbnail": data.get("thumbnail", ""),
    }
    _export_status[video_id] = "exporting"
    t = threading.Thread(target=_export_audio_bg, args=(video_id, output_path, fmt, meta), daemon=True)
    t.start()
    return jsonify({"ok": True, "status": "exporting"})


@app.route("/song/export/status/<video_id>")
def export_status(video_id):
    status = _export_status.get(video_id, "not_found")
    return jsonify({"status": status})


@app.route("/song/export/ffmpeg-available")
def ffmpeg_available():
    return jsonify({"available": _find_ffmpeg() is not False})


# ─── FFmpeg auto-download ─────────────────────────────────────────────────────

@app.route("/ffmpeg/status")
def ffmpeg_status():
    """Returns whether ffmpeg is available next to the server binary."""
    return jsonify({"available": _find_ffmpeg() is not False})


@app.route("/ffmpeg/check-update")
def ffmpeg_check_update():
    """Compares the installed ffmpeg against gyan.dev's latest release version."""
    installed = _ffmpeg_version()
    latest = _ffmpeg_latest_version()
    update = bool(installed and latest and _ver_tuple(latest) > _ver_tuple(installed))
    return jsonify({"installed": installed, "latest": latest, "updateAvailable": update})


# ─── yt-dlp updater ─────────────────────────────────────────────────────────
def _active_ytdlp_version():
    try:
        import yt_dlp
        return getattr(yt_dlp.version, "__version__", None) or getattr(yt_dlp, "__version__", None)
    except Exception:
        return None

def _cmp_ytdlp(a, b):
    """Compare yt-dlp date versions (e.g. 2025.06.24). Returns 1 / 0 / -1."""
    def parse(v):
        return [int(p) if p.isdigit() else 0 for p in str(v).replace("-", ".").split(".")]
    pa, pb = parse(a), parse(b)
    n = max(len(pa), len(pb)); pa += [0]*(n-len(pa)); pb += [0]*(n-len(pb))
    return (pa > pb) - (pa < pb)

@app.route("/ytdlp/check-update")
def ytdlp_check_update():
    installed = _active_ytdlp_version()
    latest = None
    try:
        latest = requests.get("https://pypi.org/pypi/yt-dlp/json", timeout=10).json()["info"]["version"]
    except Exception:
        pass
    update = bool(installed and latest and _cmp_ytdlp(latest, installed) > 0)
    return jsonify({"installed": installed, "latest": latest, "updateAvailable": update})

@app.route("/ytdlp/update", methods=["POST"])
def ytdlp_update():
    """Download the latest yt-dlp wheel from PyPI, activate it on sys.path and reload, so the
    new version takes effect without an app restart (yt_dlp is imported lazily)."""
    import glob as _glob
    try:
        data = requests.get("https://pypi.org/pypi/yt-dlp/json", timeout=15).json()
        wheel_url = wheel_name = None
        for u in data.get("urls", []):
            if u.get("packagetype") == "bdist_wheel" and u.get("filename", "").endswith(".whl"):
                wheel_url, wheel_name = u["url"], u["filename"]; break
        if not wheel_url:
            return jsonify({"ok": False, "error": "no wheel on PyPI"}), 502
        dest = os.path.join(YTDLP_UPDATE_DIR, wheel_name)
        tmp = dest + ".part"
        with requests.get(wheel_url, stream=True, timeout=120) as wr:
            wr.raise_for_status()
            with open(tmp, "wb") as f:
                for chunk in wr.iter_content(65536):
                    if chunk: f.write(chunk)
        os.replace(tmp, dest)
        # Keep only the freshest wheel.
        for old in _glob.glob(os.path.join(YTDLP_UPDATE_DIR, "yt_dlp-*.whl")):
            if old != dest:
                try: os.remove(old)
                except OSError: pass
        # Activate: prepend + drop cached module so the next lazy `import yt_dlp` picks it up.
        if dest not in sys.path:
            sys.path.insert(0, dest)
        for m in [m for m in sys.modules if m == "yt_dlp" or m.startswith("yt_dlp.")]:
            del sys.modules[m]
        return jsonify({"ok": True, "version": _active_ytdlp_version()})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 502


@app.route("/ffmpeg/download")
def ffmpeg_download():
    """
    SSE stream that downloads ffmpeg.exe from gyan.dev and places it next to
    the server executable (install dir).  With ?force=1 it re-downloads even if a
    copy already exists (used to update to a newer version).  Events:
      data: {"status": "progress", "percent": 0-100, "mb_done": x, "mb_total": y, "speed_kbps": z}
      data: {"status": "done"}
      data: {"status": "error", "message": "..."}
    """
    import zipfile, io, struct
    force = request.args.get("force") == "1"  # read here — request ctx isn't live inside the generator

    def _stream():
        # macOS: no stable auto-download source — point the user at Homebrew instead.
        if sys.platform == "darwin":
            yield "data: " + json.dumps({"status": "error",
                "message": "Auf macOS bitte FFmpeg via Homebrew installieren — im Terminal: brew install ffmpeg, dann Kodama neu starten."}) + "\n\n"
            return
        # Only runs when frozen (installed); in dev just report done.
        if not getattr(sys, 'frozen', False):
            yield "data: {\"status\": \"done\"}\n\n"
            return

        dest_dir = os.path.dirname(sys.executable)
        dest_exe = os.path.join(dest_dir, "ffmpeg.exe")

        if os.path.exists(dest_exe) and not force:
            yield "data: {\"status\": \"done\"}\n\n"
            return

        url = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
        try:
            import requests as _req
            with _req.get(url, stream=True, timeout=30) as r:
                r.raise_for_status()
                total = int(r.headers.get("content-length", 0))
                downloaded = 0
                chunks = []
                start_ts = time.time()
                last_emit = 0

                for chunk in r.iter_content(chunk_size=65536):
                    if not chunk:
                        continue
                    chunks.append(chunk)
                    downloaded += len(chunk)
                    now = time.time()
                    if now - last_emit >= 0.25:
                        elapsed = max(now - start_ts, 0.001)
                        speed_kbps = int(downloaded / elapsed / 1024)
                        percent = int(downloaded / total * 100) if total else 0
                        mb_done  = round(downloaded / 1048576, 1)
                        mb_total = round(total / 1048576, 1) if total else 0
                        payload = json.dumps({
                            "status": "progress",
                            "percent": percent,
                            "mb_done": mb_done,
                            "mb_total": mb_total,
                            "speed_kbps": speed_kbps,
                        })
                        yield f"data: {payload}\n\n"
                        last_emit = now

                # Extract ffmpeg.exe from ZIP
                zip_data = b"".join(chunks)
                with zipfile.ZipFile(io.BytesIO(zip_data)) as zf:
                    ffmpeg_entry = next(
                        (n for n in zf.namelist()
                         if n.endswith("/ffmpeg.exe") or n == "ffmpeg.exe"),
                        None
                    )
                    if not ffmpeg_entry:
                        yield "data: {\"status\": \"error\", \"message\": \"ffmpeg.exe not found in ZIP\"}\n\n"
                        return
                    # Write to a temp file then atomically replace, so an update overwrites
                    # the existing binary cleanly (and a failed write can't corrupt it).
                    tmp_exe = dest_exe + ".new"
                    with zf.open(ffmpeg_entry) as src, open(tmp_exe, "wb") as dst:
                        dst.write(src.read())
                    os.replace(tmp_exe, dest_exe)

                yield "data: {\"status\": \"done\"}\n\n"

        except Exception as e:
            payload = json.dumps({"status": "error", "message": str(e)})
            yield f"data: {payload}\n\n"

    return Response(
        _stream(),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@app.route("/debug/info")
def debug_info():
    """Returns system info + last log entries for the Debug tab in the frontend."""
    import platform as _platform, shutil as _shutil

    def _pkg_version(name):
        try:
            import importlib.metadata
            return importlib.metadata.version(name)
        except Exception:
            return "—"

    node_path = _shutil.which("node") or _shutil.which("node.exe") or _shutil.which("nodejs")

    uptime_s = int(time.time() - _server_start_time)
    h, rem = divmod(uptime_s, 3600)
    m, s   = divmod(rem, 60)
    uptime_str = (f"{h}h " if h else "") + f"{m}m {s}s"

    with _debug_log_lock:
        logs = list(_debug_log)

    return jsonify({
        "python":     sys.version.split()[0],
        "ytdlp":      _pkg_version("yt-dlp"),
        "ytmusicapi": _pkg_version("ytmusicapi"),
        "flask":      _pkg_version("flask"),
        "node":       node_path,
        "profile":    _current_profile or "—",
        "platform":   _platform.system() + " " + _platform.release(),
        "uptime":     uptime_str,
        "data_dir":   _base_dir,
        "logs":       logs[-300:],
    })


# ─── OBS Overlay Server ───────────────────────────────────────────────────────
import queue as _qmod
from werkzeug.serving import make_server as _make_wsgi_server

_ov_state = {
    "title": "", "artist": "", "album": "",
    "cover": "", "progress": 0.0, "duration": 0.0, "isPlaying": False,
}
# ── Overlay v2 document schema / migration (mirror of src/overlay/schema.js) ──

def _r(v):
    return int(v + 0.5)  # round-half-up for non-negative (mirrors JS Math.round)

def _make_id(prefix="l"):
    import time as _t, random as _rnd
    return "%s_%x%x" % (prefix, int(_t.time() * 1000) & 0xffffffff, _rnd.randint(0, 0xffff))

def _uniform_corners(radius=14, t="r"):
    return {"TL": radius, "TR": radius, "BR": radius, "BL": radius,
            "typeTL": t, "typeTR": t, "typeBR": t, "typeBL": t}

def _corners_from_v1(cfg, rk, tk, fb):
    return {
        "TL": cfg.get(rk[0], fb), "TR": cfg.get(rk[1], fb),
        "BR": cfg.get(rk[2], fb), "BL": cfg.get(rk[3], fb),
        "typeTL": cfg.get(tk[0]) or "r", "typeTR": cfg.get(tk[1]) or "r",
        "typeBR": cfg.get(tk[2]) or "r", "typeBL": cfg.get(tk[3]) or "r",
    }

def _base_layer(type_, over):
    layer = {"id": _make_id(type_[:3]), "type": type_, "name": over.get("name", type_),
             "x": 0, "y": 0, "w": 100, "h": 40, "rotation": 0, "opacity": 100,
             "z": 0, "visible": True, "locked": False, "bind": None, "style": {}, "effects": []}
    layer.update(over)
    return layer

def _default_canvas(over=None):
    c = {"width": 400, "height": 80, "autoSize": False,
         "bg": {"color": "#1a1a1a", "opacity": 90, "blurFromCover": False, "blur": 10},
         "corners": _uniform_corners(14, "r"),
         "border": {"on": False, "color": "#EEA8FF", "width": 1.5, "glow": 0},
         "shadow": {"on": False, "strength": 0.35},
         "autoHide": False,
         "theme": {"fontFamily": "system-ui, sans-serif", "textColor": "#ffffff", "accentColor": "#EEA8FF"}}
    if over:
        c.update(over)
    return c

def _migrate_v1_to_v2(cfg):
    """Accepts a flat v1 config OR a v2 doc (passthrough). Returns a v2 doc."""
    cfg = cfg or {}
    if cfg.get("version") == _OVERLAY_DOC_VERSION and isinstance(cfg.get("layers"), list) and cfg.get("canvas"):
        return cfg
    g = cfg.get
    padH = g("paddingH", 16); padV = g("paddingV", 12); gap = g("gap", 12)
    artSize = g("artSize", 56)
    showArt = g("showAlbumArt", True) is not False
    showProgress = g("showProgress", True) is not False
    progH = g("progressHeight", 3)
    titleFS = g("titleFontSize", 14); subFS = g("artistFontSize", 12)
    textColor = g("textColor") or "#ffffff"
    accentColor = g("accentColor") or "#EEA8FF"
    fontFamily = g("fontFamily") or "system-ui, sans-serif"
    W = g("widgetWidth", 400)
    titleLineH = _r(titleFS * 1.3); subLineH = _r(subFS * 1.3)
    textBlockH = titleLineH + 3 + subLineH
    rowH = max(artSize if showArt else 0, textBlockH)
    wh = g("widgetHeight", 0)
    H = wh if (wh and wh > 0) else _r(padV * 2 + rowH)
    contentX = padH + (artSize + gap if showArt else 0)
    contentW = max(10, W - contentX - padH)
    textY = _r((H - textBlockH) / 2)
    canvas = _default_canvas({
        "width": W, "height": H, "autoSize": bool(g("dynamicWidth", False)),
        "bg": {"color": g("bgColor") or "#1a1a1a", "opacity": g("bgOpacity", 90),
               "blurFromCover": bool(g("bgBlurEnabled", False)), "blur": g("bgBlur", 10)},
        "corners": _corners_from_v1(cfg, ["radiusTL", "radiusTR", "radiusBR", "radiusBL"],
                                    ["cornerTypeTL", "cornerTypeTR", "cornerTypeBR", "cornerTypeBL"],
                                    g("borderRadius", 14)),
        "border": {"on": bool(g("border", False)), "color": g("borderColor") or "#EEA8FF",
                   "width": g("borderWidth", 1.5), "glow": g("borderBlur", 0)},
        "shadow": {"on": bool(g("showShadow", False)), "strength": g("shadowStrength", 0.35)},
        "autoHide": bool(g("autoHide", False)),
        "theme": {"fontFamily": fontFamily, "textColor": textColor, "accentColor": accentColor},
    })
    layers = []; z = 0
    if showArt:
        layers.append(_base_layer("albumArt", {
            "name": "Album Art", "x": padH, "y": _r((H - artSize) / 2), "w": artSize, "h": artSize,
            "z": z, "bind": "cover",
            "style": {"corners": _corners_from_v1(cfg, ["artRadiusTL", "artRadiusTR", "artRadiusBR", "artRadiusBL"],
                      ["artCornerTypeTL", "artCornerTypeTR", "artCornerTypeBR", "artCornerTypeBL"], g("artRadius", 8)),
                      "fit": "cover", "border": {"on": False, "color": "#EEA8FF", "width": 1.5},
                      "shadow": {"on": False, "strength": 0.35}, "placeholderBg": "rgba(255,255,255,0.12)"}}))
        z += 1
    layers.append(_base_layer("text", {
        "name": "Title", "x": contentX, "y": textY, "w": contentW, "h": titleLineH, "z": z, "bind": "title",
        "style": {"content": "", "parts": [], "fontFamily": fontFamily, "fontSize": titleFS, "fontWeight": 700,
                  "color": textColor, "align": "left", "valign": "top", "letterSpacing": 0, "lineHeight": 1.3,
                  "maxLines": 1, "marquee": bool(g("scrollTitle", False)), "marqueeSpeed": g("scrollSpeed", 80)}}))
    z += 1
    parts = []
    if g("showArtist", True) is not False: parts.append("artist")
    if g("showAlbum", False): parts.append("album")
    layers.append(_base_layer("text", {
        "name": "Subtitle", "x": contentX, "y": textY + titleLineH + 3, "w": contentW, "h": subLineH,
        "z": z, "opacity": 65, "bind": "subtitle",
        "style": {"content": "", "parts": parts, "fontFamily": fontFamily, "fontSize": subFS, "fontWeight": 400,
                  "color": textColor, "align": "left", "valign": "top", "letterSpacing": 0, "lineHeight": 1.3,
                  "maxLines": 1, "marquee": False, "marqueeSpeed": 80}}))
    z += 1
    if showProgress:
        layers.append(_base_layer("progress", {
            "name": "Progress", "x": 0, "y": H - progH, "w": W, "h": progH, "z": z, "bind": "progress",
            "style": {"fillColor": accentColor, "trackColor": "rgba(255,255,255,0.12)",
                      "corners": _uniform_corners(0, "r"), "shape": "bar"}}))
        z += 1
    return {"version": _OVERLAY_DOC_VERSION, "canvas": canvas, "layers": layers}

# Active overlay document (v2). The frontend may POST v1 configs → migrated on arrival.
_ov_doc = _migrate_v1_to_v2(_OV_V1_DEFAULT)
_ov_clients: list = []
_ov_lock  = threading.Lock()
_ov_server_obj  = None
_ov_server_thread = None

_ov_app = Flask("kiyoshi_overlay")
CORS(_ov_app)

# ── Widget HTML ───────────────────────────────────────────────────────────────
with open("overlay.html", "r") as f:
    _OVERLAY_HTML = f.read()

def _ov_push(payload: dict):
    msg = "data: " + json.dumps(payload) + "\n\n"
    with _ov_lock:
        dead = []
        for q in _ov_clients:
            try:
                q.put_nowait(msg)
            except _qmod.Full:
                dead.append(q)
        for q in dead:
            try: _ov_clients.remove(q)
            except ValueError: pass

# ── Shared overlay handlers (registered on BOTH the OBS server and the main app
#    so the editor preview iframe works even when the OBS server is disabled) ───
def _ov_page_resp():
    resp = Response(_OVERLAY_HTML, content_type="text/html; charset=utf-8")
    resp.headers["X-Frame-Options"] = "ALLOWALL"
    resp.headers["Content-Security-Policy"] = "frame-ancestors *"
    resp.headers["Access-Control-Allow-Origin"] = "*"
    # No-cache so OBS/CEF (and the editor iframe) always load the latest engine
    # after an update instead of a stale cached page.
    resp.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
    resp.headers["Pragma"] = "no-cache"
    resp.headers["Expires"] = "0"
    return resp

def _ov_stream_resp():
    q = _qmod.Queue(maxsize=30)
    with _ov_lock:
        _ov_clients.append(q)
    initial = "data: " + json.dumps({**_ov_state, "_config": _ov_doc}) + "\n\n"
    def _gen():
        try:
            yield initial
            while True:
                try:
                    yield q.get(timeout=25)
                except _qmod.Empty:
                    yield ": ping\n\n"
        finally:
            with _ov_lock:
                try: _ov_clients.remove(q)
                except ValueError: pass
    return Response(_gen(), content_type="text/event-stream",
                    headers={"Cache-Control":"no-cache","X-Accel-Buffering":"no",
                             "Access-Control-Allow-Origin":"*"})

@_ov_app.route("/overlay")
def _ov_page():
    return _ov_page_resp()

@_ov_app.route("/overlay/config")
def _ov_config_get():
    return jsonify(_ov_doc)

@_ov_app.route("/overlay/stream")
def _ov_stream():
    return _ov_stream_resp()

# Mirror page + stream on the main backend (always running) for the editor preview.
@app.route("/overlay")
def _ov_page_main():
    return _ov_page_resp()

@app.route("/overlay/stream")
def _ov_stream_main():
    return _ov_stream_resp()

def _ov_start(port: int) -> bool:
    global _ov_server_obj, _ov_server_thread
    _ov_stop()
    try:
        # threaded=True is essential: OBS holds a long-lived SSE connection on
        # /overlay/stream. A single-threaded server would then be unable to serve
        # the page itself (reloads hang), leaving OBS stuck on a stale page.
        srv = _make_wsgi_server("0.0.0.0", port, _ov_app, threaded=True)
        _ov_server_obj = srv
        def _serve_safe():
            try:
                srv.serve_forever()
            except Exception as e:
                _logging.error(f"[Overlay] Server thread died unexpectedly: {e}")
        t = threading.Thread(target=_serve_safe, daemon=True, name="kiyoshi-overlay")
        t.start()
        _ov_server_thread = t
        return True
    except OSError as e:
        print(f"[Overlay] Port {port} unavailable: {e}")
        return False

def _ov_stop():
    global _ov_server_obj, _ov_server_thread
    if _ov_server_obj:
        try: _ov_server_obj.shutdown()
        except Exception: pass
        _ov_server_obj = None
    _ov_server_thread = None

# ── Main-server control endpoints ─────────────────────────────────────────────
@app.route("/overlay/push", methods=["POST"])
def overlay_push():
    global _ov_state
    data = request.json or {}
    _ov_state.update({k: v for k, v in data.items() if k in _ov_state})
    _ov_push(_ov_state)
    return jsonify({"ok": True})

@app.route("/overlay/config", methods=["GET", "POST"])
def overlay_config():
    global _ov_doc
    if request.method == "POST":
        # Accepts a flat v1 config (current frontend) OR a v2 doc → stored as v2.
        _ov_doc = _migrate_v1_to_v2(request.json or {})
        _ov_push({"_configUpdate": True, "config": _ov_doc})
        return jsonify({"ok": True})
    return jsonify(_ov_doc)

@app.route("/overlay/server/start", methods=["POST"])
def overlay_server_start():
    port = (request.json or {}).get("port", 9848)
    ok = _ov_start(int(port))
    return jsonify({"ok": ok, "port": port})

@app.route("/overlay/server/stop", methods=["POST"])
def overlay_server_stop():
    _ov_stop()
    return jsonify({"ok": True})

@app.route("/overlay/status")
def overlay_status():
    return jsonify({"running": _ov_server_obj is not None, "clients": len(_ov_clients)})


# ─── Remote Control (LAN) ──────────────────────────────────────────────────────
# A phone on the same network controls playback. The main server already listens on
# 0.0.0.0, so phone-facing routes live here — gated by a session token AND per-device
# desktop approval. Desktop-only control routes (_enable/_status/_device/_push/_poll)
# are restricted to localhost. State bridges in-process: the app frontend pushes the
# now-playing state and drains the command queue; the phone reads state + enqueues cmds.
import secrets as _secrets

_remote_enabled = False
_remote_token = None
_remote_state = {
    "title": "", "artists": "", "thumbnail": "",
    "isPlaying": False, "position": 0, "duration": 0, "hasTrack": False,
    "shuffle": False, "repeat": "none",
}
_remote_cmds = []                 # pending command strings, drained by the app frontend
_remote_devices = {}              # deviceId -> {name, status: pending|approved, last_seen}


with open("static/remote.html", "r") as f:
    _REMOTE_HTML = f.read()

def _remote_is_local():
    ra = request.remote_addr or ""
    return ra.startswith("127.") or ra in ("::1", "localhost")

_remote_ips_cache = {"ips": None, "ts": 0.0}

def _remote_local_ips():
    # Cached: the underlying getaddrinfo(hostname) can be slow/blocking on Windows and was
    # previously called on every _status poll (~2.5s). The LAN IP rarely changes.
    now = time.time()
    if _remote_ips_cache["ips"] is not None and now - _remote_ips_cache["ts"] < 30:
        return _remote_ips_cache["ips"]
    import socket
    ips = []
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))            # no packets sent; just picks the primary iface
        ips.append(s.getsockname()[0]); s.close()
    except Exception:
        pass
    try:
        for info in socket.getaddrinfo(socket.gethostname(), None, socket.AF_INET):
            ip = info[4][0]
            if ip not in ips and not ip.startswith("127."):
                ips.append(ip)
    except Exception:
        pass
    _remote_ips_cache["ips"] = ips
    _remote_ips_cache["ts"] = now
    return ips

def _remote_token_ok(token):
    return bool(_remote_enabled and _remote_token and token == _remote_token)

# ── Desktop-only control endpoints (localhost) ──
@app.route("/remote/_enable", methods=["POST"])
def remote_enable():
    global _remote_enabled, _remote_token, _remote_devices, _remote_cmds
    if not _remote_is_local():
        return jsonify({"error": "forbidden"}), 403
    data = request.json or {}
    enabled = bool(data.get("enabled"))
    _remote_enabled = enabled
    if enabled:
        # The desktop persists the token + trusted devices across restarts (backend state is
        # in-memory) and re-supplies them here, so old QR codes and remembered phones keep
        # working after a restart. A supplied token is reused; otherwise a fresh one is minted.
        supplied = (data.get("token") or "").strip()
        if supplied:
            _remote_token = supplied[:64]
        elif not _remote_token:
            _remote_token = _secrets.token_urlsafe(12)
        trusted = data.get("trusted")
        if isinstance(trusted, list):
            for tdev in trusted:
                did = (tdev or {}).get("id")
                if did and did not in _remote_devices:
                    _remote_devices[did] = {"name": (tdev.get("name") or "Device")[:48],
                                            "status": "approved", "last_seen": 0}
    else:
        _remote_token = None
        _remote_devices = {}
        _remote_cmds = []
    return jsonify({"enabled": _remote_enabled, "token": _remote_token,
                    "port": 9847, "ips": _remote_local_ips()})

@app.route("/remote/_status")
def remote_status():
    if not _remote_is_local():
        return jsonify({"error": "forbidden"}), 403
    now = time.time()
    devices = [{"id": did, "name": d["name"], "status": d["status"],
                "online": (now - d.get("last_seen", 0)) < 12}
               for did, d in _remote_devices.items()]
    return jsonify({"enabled": _remote_enabled, "token": _remote_token,
                    "port": 9847, "ips": _remote_local_ips(), "devices": devices})

@app.route("/remote/_device", methods=["POST"])
def remote_device():
    if not _remote_is_local():
        return jsonify({"error": "forbidden"}), 403
    data = request.json or {}
    did, action = data.get("id"), data.get("action")
    d = _remote_devices.get(did)
    if not d:
        return jsonify({"error": "unknown"}), 404
    if action == "approve":
        d["status"] = "approved"
    elif action in ("deny", "remove"):
        _remote_devices.pop(did, None)
    return jsonify({"ok": True})

@app.route("/remote/_push", methods=["POST"])
def remote_push():
    if not _remote_is_local():
        return jsonify({"error": "forbidden"}), 403
    data = request.json or {}
    _remote_state.update({k: v for k, v in data.items() if k in _remote_state})
    return jsonify({"ok": True})

@app.route("/remote/_poll")
def remote_poll():
    global _remote_cmds
    if not _remote_is_local():
        return jsonify({"error": "forbidden"}), 403
    cmds, _remote_cmds = _remote_cmds, []
    return jsonify({"commands": cmds})

@app.route("/remote/_sync", methods=["POST"])
def remote_sync():
    """Combined push + poll in one request — the app frontend sends the current now-playing
    state and receives any pending commands, halving the desktop's background request rate."""
    global _remote_cmds
    if not _remote_is_local():
        return jsonify({"error": "forbidden"}), 403
    st = (request.json or {}).get("state")
    if isinstance(st, dict):
        _remote_state.update({k: v for k, v in st.items() if k in _remote_state})
    cmds, _remote_cmds = _remote_cmds, []
    return jsonify({"commands": cmds})

# ── Phone-facing endpoints (token + device-approval gated) ──
@app.route("/remote/hello", methods=["POST"])
def remote_hello():
    data = request.json or {}
    if not _remote_token_ok(data.get("token")):
        return jsonify({"error": "invalid_token"}), 403
    did = (data.get("deviceId") or "").strip()[:64]
    name = (data.get("name") or "Device").strip()[:48] or "Device"
    if not did:
        return jsonify({"error": "no_device"}), 400
    d = _remote_devices.get(did)
    if not d:
        _remote_devices[did] = {"name": name, "status": "pending", "last_seen": time.time()}
    else:
        d["last_seen"], d["name"] = time.time(), name
    return jsonify({"status": _remote_devices[did]["status"]})

@app.route("/remote/state")
def remote_state():
    if not _remote_token_ok(request.args.get("token")):
        return jsonify({"error": "invalid_token"}), 403
    d = _remote_devices.get(request.args.get("deviceId") or "")
    if not d:
        return jsonify({"status": "unknown"})
    d["last_seen"] = time.time()
    if d["status"] != "approved":
        return jsonify({"status": d["status"]})
    return jsonify({"status": "approved", "state": _remote_state})

@app.route("/remote/cmd", methods=["POST"])
def remote_cmd():
    data = request.json or {}
    if not _remote_token_ok(data.get("token")):
        return jsonify({"error": "invalid_token"}), 403
    d = _remote_devices.get(data.get("deviceId") or "")
    if not d or d["status"] != "approved":
        return jsonify({"error": "not_allowed"}), 403
    d["last_seen"] = time.time()
    action = data.get("action")
    if action in ("playpause", "next", "prev", "shuffle", "repeat"):
        _remote_cmds.append(action)
        return jsonify({"ok": True})
    return jsonify({"error": "bad_action"}), 400

@app.route("/remote")
def remote_page():
    from flask import Response
    return Response(_REMOTE_HTML, mimetype="text/html")


# ── Local system fonts ─────────────────────────────────────────────────────────
@app.route("/api/local-fonts")
def api_local_fonts():
    """Return sorted list of font family names installed on the system (Windows Registry)."""
    families = set()
    _style_suffixes = (
        " Bold Italic", " Bold", " Italic", " Regular",
        " Light Italic", " Light", " Medium Italic", " Medium",
        " SemiBold Italic", " SemiBold", " Demi Bold", " Demi",
        " Black Italic", " Black", " Thin Italic", " Thin",
        " ExtraLight Italic", " ExtraLight", " ExtraBold Italic", " ExtraBold",
        " Condensed Bold Italic", " Condensed Bold", " Condensed Italic", " Condensed",
        " Narrow Bold", " Narrow",
    )
    try:
        import winreg
        reg_paths = [
            (winreg.HKEY_LOCAL_MACHINE,
             r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts"),
            (winreg.HKEY_CURRENT_USER,
             r"SOFTWARE\Microsoft\Windows NT\CurrentVersion\Fonts"),
        ]
        for hive, path in reg_paths:
            try:
                key = winreg.OpenKey(hive, path)
                i = 0
                while True:
                    try:
                        name, _, _ = winreg.EnumValue(key, i)
                        # Strip "(TrueType)", "(OpenType)", "(All res)" etc.
                        name = name.split("(")[0].strip()
                        # Strip style suffixes (longest match first)
                        for suf in _style_suffixes:
                            if name.lower().endswith(suf.lower()):
                                name = name[: len(name) - len(suf)].strip()
                                break
                        if name:
                            families.add(name)
                        i += 1
                    except OSError:
                        break
                winreg.CloseKey(key)
            except Exception:
                pass
    except Exception:
        pass
    return jsonify(sorted(families))


if __name__ == "__main__":
    import socket as _socket, traceback as _tb

    # ── Persistent log file for diagnosing startup problems ──────────────────
    _log_path = os.path.join(_base_dir, "server_startup.log")

    def _log(msg):
        """Append a timestamped line to the startup log. Never raises."""
        try:
            with open(_log_path, "a", encoding="utf-8") as _f:
                _f.write(f"[{time.time():.3f}] {msg}\n")
                _f.flush()
        except Exception:
            pass

    # Fresh log on each start
    try:
        open(_log_path, "w").close()
    except Exception:
        pass

    _log("process started")
    _log(f"python={sys.version}")
    _log(f"frozen={getattr(sys, 'frozen', False)}")
    _log(f"base_dir={_base_dir}")

    # ── Check / free port 9847 ────────────────────────────────────────────────
    def _port_free(port=9847):
        try:
            _s = _socket.socket(_socket.AF_INET, _socket.SOCK_STREAM)
            _s.settimeout(0.3)
            result = _s.connect_ex(("127.0.0.1", port))
            _s.close()
            return result != 0  # non-zero means nothing listening
        except Exception:
            return True

    # Single-instance: ask any existing server to shut down first
    def _kill_existing():
        try:
            import urllib.request
            urllib.request.urlopen("http://127.0.0.1:9847/shutdown", timeout=2)
            _log("sent /shutdown to existing server")
        except Exception:
            pass
        time.sleep(0.5)

    _log("checking port 9847 ...")
    if not _port_free():
        _log("port occupied — sending shutdown and waiting")
        _kill_existing()
        time.sleep(0.5)
    else:
        _log("port 9847 is free")

    # ── Start Flask ───────────────────────────────────────────────────────────
    # Suppress Werkzeug's own startup print() calls — they fail under
    # CREATE_NO_WINDOW because there is no attached console handle.
    # Werkzeug request logs (INFO) → captured by _RingBufferHandler into ring buffer.
    # Do NOT suppress them — _RingBufferHandler writes to memory, not stdout.

    # ── Self-test: after Flask is up, verify we can actually reach ourselves ──
    def _self_test():
        import urllib.request as _ur
        time.sleep(3)  # give Flask time to fully bind
        for _host in ("127.0.0.1", "localhost", "::1"):
            try:
                _url = f"http://{_host}:9847/status"
                resp = _ur.urlopen(_url, timeout=3)
                _log(f"self-test {_url} → HTTP {resp.status} OK")
            except Exception as _e:
                _log(f"self-test {_url} → FAILED: {type(_e).__name__}: {_e}")

    import threading as _thr
    _thr.Thread(target=_self_test, daemon=True).start()

    _log("calling app.run ...")
    try:
        # Listen on all IPv4+IPv6 interfaces so both localhost→127.0.0.1
        # and localhost→::1 (modern Windows) can reach us.
        app.run(host="0.0.0.0", port=9847, debug=False, threaded=True,
                use_reloader=False)
        _log("app.run returned cleanly")
    except BaseException as _e:
        _log(f"CRASH: {type(_e).__name__}: {_e}")
        try:
            with open(_log_path, "a", encoding="utf-8") as _f:
                _tb.print_exc(file=_f)
        except Exception:
            pass
        raise
