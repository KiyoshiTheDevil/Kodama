"""Audio stream resolution and progressive proxying for the player.

A single ``StreamService`` instance owns the cached browser-cookie extraction
state and the resolved-URL cache so every stream request shares one extraction
path. yt-dlp client options, the audio format, and the browser-cookie file live
in :class:`~src.config.ConfigYTDLP`.
"""

import glob
import logging
import os
import tempfile
import threading
import time

import requests

from src.config import BACKEND_PORT, config_ytdlp


class StreamService:
    """Resolve YouTube Music audio URLs and proxy progressive audio streams."""

    # Local stream resolver reused by the progressive proxy (see resolve_audio_url).
    STREAM_ENDPOINT = f"http://127.0.0.1:{BACKEND_PORT}/stream"
    # symphonia has no Opus decoder, so WebM is intentionally excluded.
    PLAYABLE_EXTS = {".m4a", ".mp4", ".mp3", ".ogg", ".flac", ".wav"}

    def __init__(self, ytdlp, logger=None):
        self._ytdlp = ytdlp
        self._logger = logger or logging.getLogger(__name__)
        self._browser_cookie_lock = threading.Lock()
        self._browser_cookie_last_extract = 0.0
        self._audio_url_cache = {}  # video_id -> (url, expiry_ts)

    # ── yt-dlp extraction helpers ────────────────────────────────────────────
    # Old server.py: _ydl_extract_url
    def _extract_url(self, video_id, fmt, skip_download=True, extra_opts=None, skip_auth=False, use_ytm=True):
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
            self._ytdlp.apply_active_session_auth(ydl_opts)
        base = "music.youtube.com" if use_ytm else "www.youtube.com"
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            return ydl.extract_info(f"https://{base}/watch?v={video_id}", download=False)

    # Old server.py: _ydl_pick_any_audio
    def _pick_any_audio(self, video_id, extra_opts=None, skip_auth=False, use_ytm=True):
        """Last-resort: fetch all formats without a selector and pick manually."""
        import yt_dlp
        ydl_opts = {"quiet": True, "no_warnings": True, "skip_download": True}
        if extra_opts:
            ydl_opts.update(extra_opts)
        if not skip_auth:
            self._ytdlp.apply_active_session_auth(ydl_opts)
        base = "music.youtube.com" if use_ytm else "www.youtube.com"
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(f"https://{base}/watch?v={video_id}", download=False)
        fmts = info.get("formats") or []
        self._logger.info(f"[stream] {video_id} available formats: {[f.get('format_id') for f in fmts]}")
        audio_only = [f for f in fmts if f.get("acodec") != "none" and f.get("vcodec") == "none" and f.get("url")]
        has_audio = [f for f in fmts if f.get("acodec") != "none" and f.get("url")]
        candidates = audio_only or has_audio or [f for f in fmts if f.get("url")]
        if candidates:
            return candidates[-1]["url"]
        return info.get("url")

    # Old server.py: _stream_url_from_info
    @staticmethod
    def _stream_url_from_info(info):
        url = info.get("url")
        if not url and info.get("formats"):
            audio_fmts = [f for f in info["formats"]
                          if f.get("acodec") != "none" and f.get("vcodec") == "none"]
            chosen = audio_fmts[-1] if audio_fmts else info["formats"][-1]
            url = chosen.get("url")
        return url

    # Old server.py: _is_hard_error
    @staticmethod
    def _is_hard_error(err_str):
        # Only Music Premium is a guaranteed dead end regardless of client.
        # "Video unavailable" can still succeed with web_music/android_music
        # for YouTube Music exclusive content.
        return "Music Premium" in err_str

    # Old server.py: _is_unavailable
    @staticmethod
    def _is_unavailable(err_str):
        return any(k in err_str for k in ("Video unavailable", "This video is not available"))

    # ── Cached browser-cookie file ───────────────────────────────────────────
    # yt-dlp's `cookiesfrombrowser` re-decrypts the browser's cookie DB on EVERY
    # call. On macOS that means a "Chrome Safe Storage" keychain prompt for every
    # single /stream request (the "Always Allow" grant does not persist for an
    # unsigned dev Python). To avoid that, we extract the browser cookies ONCE
    # into a Netscape cookie file and reuse it via `cookiefile`, so the keychain
    # is touched at most once per refresh interval instead of once per track.
    #
    # Trade-off vs. cookiesfrombrowser: a static cookie file cannot auto-extract
    # PO tokens from live browser storage. In practice this is fine here; log in
    # via the app for a first-class authenticated session if a track needs it.
    # Old server.py: _get_browser_cookiefile
    def _browser_cookiefile(self, force=False):
        """Return a path to a cached Netscape cookie file extracted from the
        user's browser, or None if none could be produced. Extraction (which may
        trigger a keychain prompt) runs at most once per TTL, and never more than
        once per BROWSER_COOKIE_MIN_GAP even when forced."""
        cookie_path = str(config_ytdlp.BROWSER_COOKIE_FILE)
        with self._browser_cookie_lock:
            now = time.time()
            have = os.path.exists(cookie_path)
            fresh = have and (now - os.path.getmtime(cookie_path) < config_ytdlp.BROWSER_COOKIE_TTL)
            if fresh and not force:
                return cookie_path
            if now - self._browser_cookie_last_extract < config_ytdlp.BROWSER_COOKIE_MIN_GAP:
                return cookie_path if have else None
            self._browser_cookie_last_extract = now
            try:
                from yt_dlp.cookies import extract_cookies_from_browser, YoutubeDLCookieJar
            except Exception as e:
                self._logger.debug(f"[cookies] yt-dlp cookie API unavailable: {e}")
                return cookie_path if have else None
            for browser in ("chrome", "edge", "brave", "firefox", "opera", "vivaldi", "chromium"):
                try:
                    jar = extract_cookies_from_browser(browser)
                except Exception as e:
                    self._logger.debug(f"[cookies] {browser} extract failed: {e}")
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
                        filtered.save(cookie_path, ignore_discard=True, ignore_expires=True)
                        self._logger.info(f"[cookies] cached {len(filtered)} cookies from {browser} -> browser_cookies.txt")
                        return cookie_path
                    except Exception as e:
                        self._logger.debug(f"[cookies] failed to save cookie file: {e}")
            self._logger.info("[cookies] no browser cookies found to cache")
            return cookie_path if have else None

    # ── /stream ──────────────────────────────────────────────────────────────
    # Old server.py: stream_url
    def resolve_stream(self, video_id):
        """Resolve a playable audio URL. Returns ``(payload, status_code)``."""
        last_err = None
        _t_total = time.time()

        # ── Tier 1: browser cookies via a CACHED cookie file ─────────────────
        # Uses a cookie file extracted from the browser once (see
        # _browser_cookiefile) rather than re-reading the browser on every call,
        # which would trigger a keychain prompt per track on macOS.
        _bcf = self._browser_cookiefile()
        if _bcf:
            _t = time.time()
            try:
                info = self._extract_url(video_id, config_ytdlp.AUDIO_FORMAT, extra_opts={"cookiefile": _bcf}, skip_auth=True)
                url = self._stream_url_from_info(info)
                if url:
                    self._logger.info(f"[stream] {video_id} OK via cached browser cookies in {time.time()-_t:.1f}s (total {time.time()-_t_total:.1f}s)")
                    return {"url": url}, 200
            except Exception as e:
                last_err = e
                self._logger.warning(f"[stream] {video_id} cached-browser-cookies FAILED in {time.time()-_t:.1f}s: {e}")
                # Cookies may have gone stale — force one refresh (rate-limited to
                # once per 10 min) and retry, then fall through to the other tiers.
                if not self._is_hard_error(str(e)):
                    _bcf2 = self._browser_cookiefile(force=True)
                    if _bcf2:
                        try:
                            info = self._extract_url(video_id, config_ytdlp.AUDIO_FORMAT, extra_opts={"cookiefile": _bcf2}, skip_auth=True)
                            url = self._stream_url_from_info(info)
                            if url:
                                self._logger.info(f"[stream] {video_id} OK via refreshed browser cookies in {time.time()-_t:.1f}s")
                                return {"url": url}, 200
                        except Exception as e2:
                            last_err = e2
                            self._logger.warning(f"[stream] {video_id} refreshed-browser-cookies FAILED: {e2}")

        # ── Tier 2: STREAM_ATTEMPTS (app cookies + anonymous mobile/web) ─────
        for fmt, extra, no_auth in config_ytdlp.STREAM_ATTEMPTS:
            _t = time.time()
            try:
                info = self._extract_url(video_id, fmt, extra_opts=extra, skip_auth=no_auth)
                url = self._stream_url_from_info(info)
                if url:
                    self._logger.info(f"[stream] {video_id} OK via attempt {extra} no_auth={no_auth} in {time.time()-_t:.1f}s (total {time.time()-_t_total:.1f}s)")
                    return {"url": url}, 200
            except Exception as e:
                last_err = e
                self._logger.warning(f"[stream] {video_id} attempt {extra} no_auth={no_auth} FAILED in {time.time()-_t:.1f}s: {e}")
                if self._is_hard_error(str(e)):
                    break

        # ── Tier 3: brute-force — no format selector, any audio format ───────
        # Also retries with youtube.com URL for anonymous attempts: youtube.com
        # has wider format availability and is less restrictive than
        # music.youtube.com for anonymous/unauthenticated access.
        _hard_stop = False
        for no_auth, use_ytm in ((False, True), (True, True), (True, False)):
            if _hard_stop:
                break
            for extra in (None, config_ytdlp.WEB_MUSIC_OPTIONS, config_ytdlp.MWEB_OPTIONS,
                          config_ytdlp.ANDROID_OPTIONS, config_ytdlp.IOS_OPTIONS, config_ytdlp.TV_OPTIONS):
                if extra in (config_ytdlp.ANDROID_OPTIONS, config_ytdlp.IOS_OPTIONS,
                             config_ytdlp.TV_OPTIONS, config_ytdlp.MWEB_OPTIONS) and not no_auth:
                    continue  # never combine mobile clients with cookies
                try:
                    url = self._pick_any_audio(video_id, extra_opts=extra, skip_auth=no_auth, use_ytm=use_ytm)
                    if url:
                        self._logger.info(f"[stream] {video_id} recovered via brute-force no_auth={no_auth} ytm={use_ytm}")
                        return {"url": url}, 200
                except Exception as e:
                    last_err = e
                    if self._is_hard_error(str(e)) or self._is_unavailable(str(e)):
                        _hard_stop = True
                        break
                    self._logger.warning(f"[stream] {video_id} brute-force no_auth={no_auth} ytm={use_ytm}: {e}")

        err_str = str(last_err) if last_err else "No URL found"
        premium = "Music Premium" in err_str
        unavailable = self._is_unavailable(err_str)
        self._logger.error(f"[stream] {video_id}: {type(last_err).__name__}: {err_str}")
        return {"error": err_str, "premium_only": premium, "unavailable": unavailable}, 500

    # ── /stream-prepare ──────────────────────────────────────────────────────
    # Old server.py: stream_prepare
    def prepare_download(self, video_id):
        """Download audio via yt-dlp to a temp file and return the local path.
        Rust reads from disk — no HTTP proxy overhead, no truncation. Returns
        ``(payload, status_code)``."""
        import yt_dlp
        cache_dir = os.path.join(tempfile.gettempdir(), "kiyoshi-audio")
        os.makedirs(cache_dir, exist_ok=True)

        # Check if already downloaded (skip WebM — symphonia has no Opus decoder)
        existing = glob.glob(os.path.join(cache_dir, f"{video_id}.*"))
        for ex in existing:
            ext = os.path.splitext(ex)[1].lower()
            if ext in self.PLAYABLE_EXTS and os.path.getsize(ex) > 0:
                print(f"[stream-prepare] Cache hit: {ex}", flush=True)
                return {"path": ex}, 200
            elif ext not in self.PLAYABLE_EXTS and os.path.exists(ex):
                print(f"[stream-prepare] Removing unplayable cache file: {ex}", flush=True)
                try:
                    os.remove(ex)
                except OSError:
                    pass

        outtmpl = os.path.join(cache_dir, "%(id)s.%(ext)s")
        last_err = None
        for fmt, extra, no_auth in config_ytdlp.STREAM_ATTEMPTS:
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
                    self._ytdlp.apply_active_session_auth(ydl_opts)
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(f"https://music.youtube.com/watch?v={video_id}", download=True)
                    path = ydl.prepare_filename(info)
                self._logger.info(f"[stream-prepare] downloaded {video_id}: {os.path.getsize(path)} bytes")
                return {"path": path}, 200
            except Exception as e:
                last_err = e
                err_str = str(e)
                if self._is_hard_error(err_str):
                    break
                self._logger.warning(f"[stream-prepare] {video_id} fmt={fmt} auth={not no_auth} failed: {e}")
        err_str = str(last_err) if last_err else "Download failed"
        premium = "Music Premium" in err_str
        unavailable = self._is_unavailable(err_str)
        self._logger.error(f"[stream-prepare] {video_id}: {type(last_err).__name__}: {err_str}")
        return {"error": err_str, "premium_only": premium, "unavailable": unavailable}, 500

    # ── Progressive streaming proxy ──────────────────────────────────────────
    # Range-forwarding proxy so the Rust audio core can stream a song (fast
    # start) instead of downloading it whole first, while keeping playback in the
    # app process (OBS-capturable). The resolved googlevideo URL is cached per
    # video (it's expensive to extract and the Rust source makes several range
    # requests per song).
    # Old server.py: _resolve_audio_url
    def resolve_audio_url(self, video_id):
        now = time.time()
        ent = self._audio_url_cache.get(video_id)
        if ent and ent[1] > now:
            return ent[0]
        try:
            d = requests.get(f"{self.STREAM_ENDPOINT}/{video_id}", timeout=60).json()
        except Exception:
            return None
        if d.get("premium_only"):
            return "premium_only"
        url = d.get("url")
        if url:
            self._audio_url_cache[video_id] = (url, now + 5 * 3600)
        return url

    # Old server.py: audio_stream (resolution portion)
    def open_audio_stream(self, video_id, range_header=None):
        """Resolve and open the upstream googlevideo response.

        Returns ``(upstream, error)`` where ``error`` is ``(payload, status)``
        when the stream could not be opened, otherwise ``None``.
        """
        up_headers = {"User-Agent": "Mozilla/5.0"}
        if range_header:
            up_headers["Range"] = range_header

        upstream = None
        for attempt in range(2):
            url = self.resolve_audio_url(video_id)
            if url == "premium_only":
                return None, ({"premium_only": True}, 403)
            if not url:
                return None, ({"error": "no_url"}, 502)
            try:
                upstream = requests.get(url, headers=up_headers, stream=True, timeout=60)
            except Exception as e:
                self._audio_url_cache.pop(video_id, None)
                if attempt == 0:
                    continue
                return None, ({"error": str(e)}, 502)
            # Expired/blocked signed URL → drop cache and re-resolve once.
            if upstream.status_code in (403, 410) and attempt == 0:
                self._audio_url_cache.pop(video_id, None)
                continue
            break
        return upstream, None

    @staticmethod
    def build_proxy_headers(upstream):
        resp_headers = {"Accept-Ranges": "bytes"}
        for h in ("Content-Type", "Content-Length", "Content-Range"):
            v = upstream.headers.get(h)
            if v:
                resp_headers[h] = v
        return resp_headers

    @staticmethod
    def iter_upstream(upstream):
        for chunk in upstream.iter_content(chunk_size=65536):
            if chunk:
                yield chunk

    # Old server.py: audio_stream_warm
    def warm(self, video_id):
        """Resolve + cache the stream URL ahead of time (no byte transfer) so the
        next play of this song skips the yt-dlp extraction wait. Used to prewarm
        upcoming queue tracks."""
        url = self.resolve_audio_url(video_id)
        return bool(url) and url != "premium_only"
