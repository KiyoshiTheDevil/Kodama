"""
Kodama - Python Backend
Lokaler API-Server der ytmusicapi nutzt.
Starte mit: python server.py
"""

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

# ── In-memory log ring so bug reports can attach the most recent backend output ──
_LOG_RING = collections.deque(maxlen=300)

class _LogTee:
    """Wraps a stream, mirroring everything written into _LOG_RING line by line."""
    def __init__(self, stream):
        self._stream = stream
        self._buf = ""
    def write(self, data):
        try:
            if self._stream is not None:
                self._stream.write(data)
        except Exception:
            pass
        self._buf += data
        while "\n" in self._buf:
            line, self._buf = self._buf.split("\n", 1)
            if line.strip():
                _LOG_RING.append(line)
        return len(data)
    def flush(self):
        try:
            if self._stream is not None:
                self._stream.flush()
        except Exception:
            pass

try:
    sys.stdout = _LogTee(sys.stdout)
    sys.stderr = _LogTee(sys.stderr)
except Exception:
    pass

# ── Feedback / bug reports → Discord webhook ─────────────────────────────────
# Discord webhook for bug reports. Kept OUT of source: set env KODAMA_FEEDBACK_WEBHOOK, or put
# {"webhook": "https://discord.com/api/webhooks/..."} in python-backend/feedback_config.json
# (gitignored). Closed-beta CI builds should inject it via a secret → env or generated config.
def _load_feedback_webhook():
    """Webhook from env, else feedback_config.json. Never in source. In a PyInstaller build the
    config is bundled (see the .spec) and extracted to sys._MEIPASS; in dev it sits next to this
    file. CI writes it from a GitHub secret before building."""
    v = os.environ.get("KODAMA_FEEDBACK_WEBHOOK", "").strip()
    if v:
        return v
    candidates = []
    if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
        candidates.append(os.path.join(sys._MEIPASS, "feedback_config.json"))
    candidates.append(os.path.join(os.path.dirname(os.path.abspath(__file__)), "feedback_config.json"))
    for p in candidates:
        try:
            if os.path.exists(p):
                with open(p, encoding="utf-8") as f:
                    return (json.load(f).get("webhook") or "").strip()
        except Exception:
            pass
    return ""
FEEDBACK_WEBHOOK_URL = _load_feedback_webhook()

@app.route("/news")
def get_news():
    """Fallback news feed for dev/offline: serves the repo's updates/news.json. Published builds
    fetch the remote feed directly; this is only used when that's unavailable."""
    try:
        p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "updates", "news.json")
        if os.path.exists(p):
            with open(p, encoding="utf-8") as f:
                return jsonify(json.load(f))
    except Exception:
        pass
    return jsonify([])

@app.route("/feedback", methods=["POST"])
def submit_feedback():
    if not FEEDBACK_WEBHOOK_URL:
        return jsonify({"error": "feedback_not_configured"}), 503
    data = request.json or {}
    title = (data.get("title") or "").strip()
    category = (data.get("category") or "Bug").strip()
    severity = (data.get("severity") or "").strip()
    description = (data.get("description") or "").strip()
    version = (data.get("version") or "?").strip()
    os_info = (data.get("os") or "?").strip()
    reporter = (data.get("reporter") or "").strip()
    include_logs = bool(data.get("includeLogs", True))
    if not title and not description:
        return jsonify({"error": "empty"}), 400

    color = {"Bug": 0xE24B4A, "Absturz": 0xA32D2D, "UI / Design": 0x378ADD,
             "Vorschlag": 0x1D9E75}.get(category, 0x888780)
    fields = [
        {"name": "Category", "value": category or "—", "inline": True},
        {"name": "Version", "value": version, "inline": True},
        {"name": "System", "value": os_info, "inline": True},
    ]
    if severity:
        fields.append({"name": "Severity", "value": severity, "inline": True})
    embed = {
        "title": (title or "(no title)")[:240],
        "description": (description or "—")[:3900],
        "color": color,
        "fields": fields,
    }
    if reporter:
        embed["footer"] = {"text": f"from {reporter[:80]}"}

    files = {}
    # Optional screenshot (base64, with or without a data: URL prefix) → inline embed image.
    shot = data.get("screenshot")
    if shot:
        try:
            import base64
            if "," in shot and shot.strip().startswith("data:"):
                shot = shot.split(",", 1)[1]
            png = base64.b64decode(shot)
            if 0 < len(png) <= 8 * 1024 * 1024:
                files["file_shot"] = ("screenshot.png", png, "image/png")
                embed["image"] = {"url": "attachment://screenshot.png"}
        except Exception:
            pass
    payload = {"username": "Kodama Feedback", "embeds": [embed]}
    if include_logs and _LOG_RING:
        log_text = "\n".join(list(_LOG_RING)[-80:])
        files["file_log"] = ("backend-log.txt", log_text, "text/plain")
    try:
        if files:
            resp = requests.post(FEEDBACK_WEBHOOK_URL,
                                 data={"payload_json": json.dumps(payload)},
                                 files=files, timeout=15)
        else:
            resp = requests.post(FEEDBACK_WEBHOOK_URL, json=payload, timeout=12)
        if resp.status_code >= 300:
            return jsonify({"error": f"webhook_{resp.status_code}"}), 502
        return jsonify({"ok": True})
    except Exception as e:
        return jsonify({"error": str(e)}), 502

# When frozen as a PyInstaller --onefile bundle store all user data in a
# platform-appropriate location so uninstallers can clean it up cleanly.
# In dev mode, keep data next to server.py for convenience.
if getattr(sys, 'frozen', False):
    if sys.platform == 'win32':
        # Windows: %LOCALAPPDATA%\dev.kodama.music
        _data_root = os.environ.get('LOCALAPPDATA', os.path.dirname(sys.executable))
    else:
        # Linux / macOS: follow XDG Base Directory spec
        _data_root = os.environ.get('XDG_DATA_HOME', os.path.expanduser('~/.local/share'))
    _base_dir = os.path.join(_data_root, 'dev.kodama.music')

    # One-time migration from the old identifier (Kiyoshi Music → Kodama). If the new
    # data folder doesn't exist yet but the old one does, move it over so existing
    # profiles, caches and settings carry over seamlessly.
    _old_dir = os.path.join(_data_root, 'dev.kiyoshi.music')
    try:
        if not os.path.exists(_base_dir) and os.path.isdir(_old_dir):
            import shutil
            shutil.move(_old_dir, _base_dir)
            print(f"[migrate] moved data dir {_old_dir} -> {_base_dir}", flush=True)
    except Exception as _e:
        print(f"[migrate] data dir migration failed: {_e}", flush=True)
        # Fall back to the old directory so the user never loses access to their data.
        if os.path.isdir(_old_dir) and not os.path.exists(_base_dir):
            _base_dir = _old_dir
else:
    _base_dir = os.path.dirname(os.path.abspath(__file__))

PROFILES_DIR = os.path.join(_base_dir, "profiles")
os.makedirs(PROFILES_DIR, exist_ok=True)

IMG_CACHE_DIR = os.path.join(_base_dir, "imgcache")
os.makedirs(IMG_CACHE_DIR, exist_ok=True)
IMG_CACHE_TTL = 30 * 24 * 3600  # 30 days

# ─── Last.fm integration ─────────────────────────────────────────────────────
# API key + shared secret: env vars first, then a local (git-ignored)
# lastfm_config.json in the data dir. Features are disabled if unset.
LASTFM_API_KEY = os.environ.get("LASTFM_API_KEY", "")
LASTFM_API_SECRET = os.environ.get("LASTFM_API_SECRET", "")
if not (LASTFM_API_KEY and LASTFM_API_SECRET):
    try:
        with open(os.path.join(_base_dir, "lastfm_config.json"), encoding="utf-8") as _lf:
            _lfc = json.load(_lf)
            LASTFM_API_KEY = LASTFM_API_KEY or _lfc.get("api_key", "")
            LASTFM_API_SECRET = LASTFM_API_SECRET or _lfc.get("api_secret", "")
    except Exception:
        pass

LASTFM_API_ROOT = "https://ws.audioscrobbler.com/2.0/"

def _lastfm_enabled():
    return bool(LASTFM_API_KEY and LASTFM_API_SECRET)

def _lastfm_sign(params):
    """api_sig = md5 of sorted 'key+value' pairs (excl. format/callback) + secret."""
    import hashlib
    raw = "".join(f"{k}{params[k]}" for k in sorted(params) if k not in ("format", "callback"))
    return hashlib.md5((raw + LASTFM_API_SECRET).encode("utf-8")).hexdigest()

def _lastfm_call(method, params=None, http="GET", signed=False):
    """Call a Last.fm API method. Returns (ok: bool, data_or_error: dict)."""
    if not _lastfm_enabled():
        return False, {"error": "lastfm_not_configured"}
    p = dict(params or {})
    p["method"] = method
    p["api_key"] = LASTFM_API_KEY
    if signed:
        p["api_sig"] = _lastfm_sign(p)
    p["format"] = "json"
    try:
        if http == "POST":
            r = requests.post(LASTFM_API_ROOT, data=p, timeout=15)
        else:
            r = requests.get(LASTFM_API_ROOT, params=p, timeout=15)
        data = r.json() if r.content else {}
        if isinstance(data, dict) and data.get("error"):
            return False, data
        return True, data
    except Exception as e:
        return False, {"error": str(e)}

def _active_meta_path():
    return os.path.join(PROFILES_DIR, f"{_current_profile or 'default'}.meta.json")

def _read_active_meta():
    try:
        with open(_active_meta_path(), encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}

def _write_active_meta(meta):
    with open(_active_meta_path(), "w", encoding="utf-8") as f:
        json.dump(meta, f)

PLAYLIST_CACHE_DIR = os.path.join(_base_dir, "playlist_cache")
os.makedirs(PLAYLIST_CACHE_DIR, exist_ok=True)
PLAYLIST_CACHE_TTL = 24 * 3600  # 24 hours

ALBUM_CACHE_DIR = os.path.join(_base_dir, "album_cache")
os.makedirs(ALBUM_CACHE_DIR, exist_ok=True)
ALBUM_CACHE_TTL = 7 * 24 * 3600  # 7 days

SONG_CACHE_DIR = os.path.join(_base_dir, "song_cache")
os.makedirs(SONG_CACHE_DIR, exist_ok=True)

LYRICS_CACHE_DIR = os.path.join(_base_dir, "lyrics_cache")
os.makedirs(LYRICS_CACHE_DIR, exist_ok=True)

CUSTOM_LYRICS_DIR = os.path.join(_base_dir, "custom_lyrics")
os.makedirs(CUSTOM_LYRICS_DIR, exist_ok=True)

# Active YTMusic instance and current profile
_ytm = None
_current_profile = None
_PLAYLIST_CACHE_MAX = 20
_playlist_cache  = collections.OrderedDict()  # in-memory LRU, max 20 entries
_credits_cache   = {}  # video_id -> list of {role, persons}  (permanent, small)

def _playlist_cache_put(playlist_id, data):
    """Insert/update entry and evict the oldest if over the size limit."""
    _playlist_cache[playlist_id] = data
    _playlist_cache.move_to_end(playlist_id)
    while len(_playlist_cache) > _PLAYLIST_CACHE_MAX:
        _playlist_cache.popitem(last=False)
_adding_account = False

def _is_oauth_profile(raw):
    """Detect a leftover OAuth profile (vs. browser cookies) so we can refuse to load
    it — OAuth is incompatible with YouTube Music's internal API (ytmusicapi #813)."""
    return isinstance(raw, dict) and ("refresh_token" in raw or raw.get("token_type") == "Bearer")

_download_status = {}  # video_id -> "downloading" | "done" | "error"
_download_queue  = {}  # video_id -> {title, artists, thumbnail, status, progress (0-1)}

def _schedule_cleanup(d, key, delay=300):
    """Remove *key* from dict *d* after *delay* seconds (default 5 min)."""
    def _do():
        time.sleep(delay)
        d.pop(key, None)
    threading.Thread(target=_do, daemon=True).start()

def _artist_links(artist_list):
    """Return [{name, browseId}, ...] for all artists that have a name."""
    return [
        {"name": a.get("name", ""), "browseId": a.get("id") or a.get("browseId") or ""}
        for a in (artist_list or [])
        if a.get("name")
    ]

def _pick_thumb(thumbs, min_size=226):
    """Pick the smallest thumbnail that is at least min_size px wide.
    Falls back to the first thumbnail if none meet the threshold."""
    if not thumbs:
        return ""
    candidates = [t for t in thumbs if isinstance(t, dict) and t.get("width", 0) >= min_size]
    chosen = min(candidates, key=lambda t: t["width"]) if candidates else thumbs[0]
    return chosen.get("url", "") if isinstance(chosen, dict) else ""

def _upscale_thumbnail_url(url: str) -> str:
    """Return a higher-resolution variant of a YouTube/Google image URL.
    - lh3.googleusercontent.com / yt3.ggpht.com: replace =wNNN-hNNN… with =w0-h0
      (Google Image Serving returns the original / max size when w=0 h=0).
    - i.ytimg.com: upgrade /default.jpg and /mqdefault.jpg → /hqdefault.jpg.
    """
    import re
    url = re.sub(r'=w\d+-h\d+[^&?#\s]*', '=w0-h0', url)
    url = re.sub(r'/(mq|sd)?default\.jpg', '/hqdefault.jpg', url)
    return url

# Cache feature flags (can be toggled at runtime via /cache/settings)
_cache_enabled = {"playlists": True, "albums": True, "images": True, "songs": True, "lyrics": True}

# Whether the Composer bridge caches audio it extracts for not-yet-downloaded songs, so
# reopening the same song in the composer is instant. Persisted across restarts.
_COMPOSER_SETTINGS_FILE = os.path.join(_base_dir, "composer_settings.json")
def _load_composer_autocache():
    try:
        with open(_COMPOSER_SETTINGS_FILE) as f:
            return bool(json.load(f).get("autocache", True))
    except Exception:
        return True
_composer_autocache = _load_composer_autocache()

# ─── Node.js PATH — set once at startup ──────────────────────────────────────
# yt-dlp needs Node.js for nsig (n-parameter) decryption on ALL requests,
# not only authenticated ones.  Calling this here guarantees it runs before
# the first request regardless of auth status.
def _ensure_node_in_path():
    """Add bundled node.exe directory to PATH so yt-dlp can find it via shutil.which."""
    import shutil
    if shutil.which("node"):
        return  # already in PATH
    # Search in multiple locations: the exe's directory and its parent.
    # In PyInstaller onefile mode sys.executable is the original .exe; in dev it's the Python interpreter.
    exe_dir = os.path.dirname(os.path.abspath(sys.executable))
    candidates = [exe_dir]
    parent = os.path.dirname(exe_dir)
    if parent and parent != exe_dir:
        candidates.append(parent)
    node_name = "node.exe" if sys.platform == "win32" else "node"
    # On macOS the app bundles node under Contents/Resources; also probe there.
    if sys.platform == "darwin":
        candidates.append(os.path.join(parent, "Resources"))
        candidates.append(os.path.join(exe_dir, "..", "Resources"))
    for candidate in candidates:
        bundled = os.path.join(candidate, node_name)
        if os.path.isfile(bundled):
            os.environ["PATH"] = candidate + os.pathsep + os.environ.get("PATH", "")
            print(f"[ydl] added bundled {node_name} to PATH: {bundled}", flush=True)
            return
    print(f"[ydl] {node_name} not found — nsig decryption may fail for some tracks", flush=True)

_ensure_node_in_path()

# ─── Debug log ring buffer ───────────────────────────────────────────────────
import logging as _logging

_server_start_time = time.time()
_debug_log = collections.deque(maxlen=500)
_debug_log_lock = threading.Lock()

class _RingBufferHandler(_logging.Handler):
    """Logging handler that appends records to the ring buffer.
    Uses Python's standard logging module — safe in all PyInstaller modes."""
    def emit(self, record):
        try:
            msg = self.format(record)
            lvl = record.levelname
            if lvl == "WARNING":
                lvl = "WARN"
            elif lvl not in ("INFO", "ERROR", "WARN", "DEBUG"):
                lvl = "INFO"
            with _debug_log_lock:
                _debug_log.append({
                    "ts": time.time(),
                    "level": lvl,
                    "msg": msg,
                    "source": "backend",
                })
        except Exception:
            pass

_ring_handler = _RingBufferHandler()
_ring_handler.setFormatter(_logging.Formatter("%(name)s: %(message)s"))
_ring_handler.setLevel(_logging.DEBUG)
# Capture root logger + Werkzeug (Flask's HTTP request logger)
_logging.getLogger().addHandler(_ring_handler)
_logging.getLogger("werkzeug").addHandler(_ring_handler)
_logging.getLogger("werkzeug").setLevel(_logging.INFO)

# ─── Musixmatch (inoffizielle API) ───────────────────────────────────────────
_mx_token = None
_mx_token_expires = 0
MX_APP_ID  = "web-desktop-app-v1.0"
MX_BASE    = "https://apic-desktop.musixmatch.com/ws/1.1"
MX_HEADERS = {
    "authority":   "apic-desktop.musixmatch.com",
    "user-agent":  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "cookie":      "x-mxm-token-guid=",
}

def _get_mx_token():
    """Holt oder erneuert den Musixmatch User-Token (10-Minuten-Cache)."""
    global _mx_token, _mx_token_expires
    if _mx_token and time.time() < _mx_token_expires:
        return _mx_token
    try:
        import requests as req
        r = req.get(f"{MX_BASE}/token.get",
                    params={"app_id": MX_APP_ID, "guid": "default"},
                    headers=MX_HEADERS, timeout=8)
        tok = r.json()["message"]["body"]["user_token"]
        _mx_token = tok
        _mx_token_expires = time.time() + 600
        return tok
    except Exception as e:
        print(f"[lyrics] Musixmatch token error: {e}", flush=True)
        return None

def _try_musixmatch(title, artist, duration=None):
    """Sucht einen Track auf Musixmatch und gibt RichSync (Word) oder Subtitle (LRC) zurück."""
    import json as _json, requests as req
    token = _get_mx_token()
    if not token:
        return None
    base = {"app_id": MX_APP_ID, "usertoken": token}

    # Track suchen
    try:
        sr = req.get(f"{MX_BASE}/track.search",
                     params={**base, "q_track": title, "q_artist": artist,
                             "s_track_rating": "desc", "page_size": 5},
                     headers=MX_HEADERS, timeout=8)
        track_list = sr.json()["message"]["body"]["track_list"]
    except Exception as e:
        print(f"[lyrics] Musixmatch search error: {e}", flush=True)
        return None
    if not track_list:
        return None
    track_id = track_list[0]["track"]["track_id"]
    bp = {**base, "track_id": track_id}

    # RichSync (Word-Sync)
    try:
        rr = req.get(f"{MX_BASE}/track.richsync.get",
                     params=bp, headers=MX_HEADERS, timeout=8)
        rb = rr.json()["message"]["body"]
        if rb and isinstance(rb, dict) and rb.get("richsync", {}).get("richsync_body"):
            richsync = _json.loads(rb["richsync"]["richsync_body"])
            if richsync:
                return {"source": "Musixmatch", "richsync": richsync, "synced": None, "plain": None}
    except Exception as e:
        print(f"[lyrics] Musixmatch richsync error: {e}", flush=True)

    # Fallback: Line-Sync (LRC)
    try:
        lr = req.get(f"{MX_BASE}/track.subtitle.get",
                     params={**bp, "subtitle_format": "lrc"},
                     headers=MX_HEADERS, timeout=8)
        lb = lr.json()["message"]["body"]
        if lb and isinstance(lb, dict) and lb.get("subtitle", {}).get("subtitle_body"):
            return {"source": "Musixmatch", "richsync": None,
                    "synced": lb["subtitle"]["subtitle_body"], "plain": None}
    except Exception as e:
        print(f"[lyrics] Musixmatch subtitle error: {e}", flush=True)

    return None

def _dir_size_and_count(path):
    """Return (total_bytes, file_count) for all files in a directory."""
    total, count = 0, 0
    try:
        for f in os.listdir(path):
            fp = os.path.join(path, f)
            if os.path.isfile(fp):
                total += os.path.getsize(fp)
                count += 1
    except Exception:
        pass
    return total, count


def _playlist_disk_path(playlist_id):
    profile = _current_profile or "default"
    safe = playlist_id.replace("/", "_").replace("\\", "_")
    return os.path.join(PLAYLIST_CACHE_DIR, f"{profile}_{safe}.json")

def _load_playlist_disk(playlist_id, ttl=PLAYLIST_CACHE_TTL):
    path = _playlist_disk_path(playlist_id)
    if not os.path.exists(path):
        return None
    if time.time() - os.path.getmtime(path) > ttl:
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        # Invalidate old caches that don't have isExplicit yet
        tracks = data.get("tracks", [])
        if tracks and "isExplicit" not in tracks[0]:
            return None
        return data
    except Exception:
        return None

def _save_playlist_disk(playlist_id, data):
    path = _playlist_disk_path(playlist_id)
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
    except Exception:
        pass

def _purge_playlist_cache(playlist_id):
    _playlist_cache.pop(playlist_id, None)
    p = _playlist_disk_path(playlist_id)
    if os.path.exists(p):
        os.remove(p)


def _album_disk_path(browse_id):
    safe = browse_id.replace("/", "_").replace("\\", "_")
    return os.path.join(ALBUM_CACHE_DIR, f"{safe}.json")

def _load_album_disk(browse_id):
    path = _album_disk_path(browse_id)
    if not os.path.exists(path):
        return None
    if time.time() - os.path.getmtime(path) > ALBUM_CACHE_TTL:
        return None
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        # Invalidate old caches that don't have isExplicit yet
        tracks = data.get("tracks", [])
        if tracks and "isExplicit" not in tracks[0]:
            return None
        return data
    except Exception:
        return None

def _save_album_disk(browse_id, data):
    path = _album_disk_path(browse_id)
    try:
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
    except Exception:
        pass

def profile_path(name):
    return os.path.join(PROFILES_DIR, f"{name}.json")

def meta_path(name):
    return os.path.join(PROFILES_DIR, f"{name}.meta.json")

def local_db_path(name):
    return os.path.join(PROFILES_DIR, f"{name}.db")

def is_local_profile(name):
    if not name:
        return False
    mp = meta_path(name)
    if not os.path.exists(mp):
        return False
    try:
        with open(mp) as f:
            return json.load(f).get("type") == "local"
    except Exception:
        return False

def get_local_db(name):
    """Öffnet/erstellt die SQLite-Datenbank für ein lokales Profil."""
    db = sqlite3.connect(local_db_path(name), check_same_thread=False)
    db.execute("PRAGMA journal_mode=WAL")
    db.executescript("""
        CREATE TABLE IF NOT EXISTS liked_songs (
            video_id TEXT PRIMARY KEY,
            title TEXT, artists TEXT, album TEXT,
            thumbnail TEXT, duration TEXT,
            liked_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS playlists (
            playlist_id TEXT PRIMARY KEY,
            title TEXT, description TEXT,
            privacy TEXT DEFAULT 'PRIVATE',
            created_at INTEGER, updated_at INTEGER
        );
        CREATE TABLE IF NOT EXISTS playlist_tracks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            playlist_id TEXT, video_id TEXT,
            title TEXT, artists TEXT, album TEXT,
            thumbnail TEXT, duration TEXT,
            set_video_id TEXT,
            position INTEGER, added_at INTEGER
        );
    """)
    db.commit()
    return db

from contextlib import contextmanager

@contextmanager
def local_db(name):
    """Context-Manager um get_local_db — schließt die Verbindung garantiert."""
    db = get_local_db(name)
    try:
        yield db
    finally:
        db.close()

# Short-lived cookies that expire in minutes and break the session.
# YouTube rotates these via Set-Cookie but ytmusicapi doesn't update them.
_SHORT_LIVED_COOKIES = {
    '__Secure-1PSIDTS', '__Secure-3PSIDTS',
    'SIDCC', '__Secure-1PSIDCC', '__Secure-3PSIDCC',
    'CONSISTENCY', 'YSC', '__Secure-YEC',
    'VISITOR_PRIVACY_METADATA', '__Secure-ROLLOUT_TOKEN',
}

def clean_headers_for_storage(headers):
    """Minimal cleanup: only remove headers that don't belong in API requests."""
    h = dict(headers)
    # content-encoding doesn't belong in outgoing request headers
    h.pop("content-encoding", None)
    # Ensure authorization header exists (ytmusicapi needs it to detect browser auth type)
    if "authorization" not in h:
        import hashlib
        cookie_str = h.get("cookie", "")
        sapisid = next((p.strip()[8:] for p in cookie_str.split(";")
                        if p.strip().startswith("SAPISID=")), "")
        if sapisid:
            ts = str(int(time.time()))
            sha = hashlib.sha1(f"{ts} {sapisid} https://music.youtube.com".encode()).hexdigest()
            h["authorization"] = f"SAPISIDHASH {ts}_{sha}"
    return h

def make_ytmusic(name):
    """Build a YTMusic instance for a stored browser-auth profile.

    NOTE: OAuth profiles are intentionally NOT loadable. OAuth tokens are
    fundamentally incompatible with YouTube Music's internal API — data calls return
    HTTP 400 "invalid argument" (ytmusicapi issue #813). Browser/cookie auth is the
    only working method; we keep its session alive via _refresh_ytm_psidts().
    """
    path = profile_path(name)
    with open(path, "r") as f:
        raw = json.load(f)
    if _is_oauth_profile(raw):
        raise Exception("OAuth-Profile werden nicht mehr unterstützt (YT-Music-Inkompatibilität).")
    # Browser auth: ensure the authorization header exists (older bug stripped it)
    if "authorization" not in raw:
        cleaned = clean_headers_for_storage(raw)
        with open(path, "w") as f:
            json.dump(cleaned, f, indent=2)
    return YTMusic(path)

def load_profile(name):
    global _ytm, _current_profile, _playlist_cache
    # Local profile: use unauthenticated YTMusic instance
    if is_local_profile(name):
        _ytm = YTMusic()
        _current_profile = name
        _playlist_cache.clear()
        return True
    path = profile_path(name)
    if not os.path.exists(path):
        return False
    try:
        _ytm = make_ytmusic(name)
    except Exception as e:
        print(f"[auth] load_profile failed for {name}: {e}", flush=True)
        return False
    _current_profile = name
    _playlist_cache = {}
    # Immediately top up the rotating anti-bot cookie so the very first hours stay valid.
    threading.Thread(target=_refresh_ytm_psidts, kwargs={"force": True}, daemon=True).start()
    return True

# ─── Keep browser sessions alive (rotating __Secure-1PSIDTS / 3PSIDTS) ─────────
# Since ~Aug 2025 YouTube rejects stale anti-bot tokens after a few hours, which logged
# users out. We periodically fetch fresh tokens with the profile's own cookies and inject
# them into the live ytmusicapi cookie header (in memory; the SAPISIDHASH auth header is
# recomputed per request from the long-lived SAPISID).
_psidts_last_refresh = 0.0

def _refresh_ytm_psidts(force=False):
    global _psidts_last_refresh
    try:
        if _ytm is None or not _current_profile or is_local_profile(_current_profile):
            return
        now = time.time()
        if not force and (now - _psidts_last_refresh) < 240:
            return
        base = getattr(_ytm, "base_headers", None)
        if base is None:
            return
        cookie_header = base.get("cookie", "")
        if not cookie_header or "SAPISID" not in cookie_header:
            return
        ua = base.get("user-agent",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36")
        sess = requests.Session()
        # Ping a few Google/YouTube endpoints — each can rotate a different subset of the
        # short-lived auth cookies via Set-Cookie. accounts.google.com in particular rotates
        # the *DCC tokens that a plain youtube.com homepage hit often leaves stale.
        authed = None
        statuses = []
        for url in ("https://music.youtube.com/", "https://www.youtube.com/", "https://accounts.google.com/"):
            try:
                r = sess.get(url, headers={
                    "Cookie": cookie_header, "User-Agent": ua,
                    "Accept-Language": "en-US,en;q=0.9",
                }, timeout=8, allow_redirects=True)
                statuses.append(f"{url.split('//', 1)[1].split('/', 1)[0]}={r.status_code}")
                # Diagnose login state from YouTube's own page flag.
                if authed is None and "youtube.com" in url:
                    txt = r.text or ""
                    if '"LOGGED_IN":true' in txt:
                        authed = True
                    elif '"LOGGED_IN":false' in txt:
                        authed = False
            except Exception:
                pass
        # NOTE: the *SIDTS timestamp tokens (which expire after ~1-2h) do NOT rotate on plain
        # HTTP requests — only a real browser engine reissues them. That's handled separately by
        # the hidden session-keeper WebView (see window.rs / /auth/refresh-cookies). Here we just
        # capture the *DCC/visitor cookies that DO rotate on these GETs.
        # Capture ALL rotating short-lived cookies the server set, not just PSIDTS — the
        # *PSIDCC / SIDCC tokens also rotate and a stale one alone will kill the session.
        fresh = {c.name: c.value for c in sess.cookies
                 if c.name in _SHORT_LIVED_COOKIES}
        if authed is False:
            print(f"[cookies] refresh ping is LOGGED OUT (statuses: {', '.join(statuses)}) — "
                  f"the stored cookies are no longer valid; re-login required.", flush=True)
        if not fresh:
            print(f"[cookies] refresh: no rotating cookies returned "
                  f"(authed={authed}, statuses: {', '.join(statuses)})", flush=True)
            return
        # Merge fresh tokens into the cookie header (replace existing, else append)
        parts, seen = [], set()
        for kv in cookie_header.split(";"):
            kv = kv.strip()
            if not kv or "=" not in kv:
                continue
            cname = kv.split("=", 1)[0].strip()
            if cname in fresh:
                parts.append(f"{cname}={fresh[cname]}"); seen.add(cname)
            else:
                parts.append(kv)
        for cname, val in fresh.items():
            if cname not in seen:
                parts.append(f"{cname}={val}")
        base["cookie"] = "; ".join(parts)
        # Persist the freshest cookies back to the profile so a backend restart keeps the
        # live session instead of falling back to the (possibly stale) login-time cookies.
        try:
            p = profile_path(_current_profile)
            with open(p) as f:
                raw = json.load(f)
            raw["cookie"] = base["cookie"]
            with open(p, "w") as f:
                json.dump(raw, f, indent=2)
        except Exception:
            pass
        _psidts_last_refresh = now
        print(f"[cookies] session refreshed (authed={authed}): {', '.join(sorted(fresh.keys()))} | {', '.join(statuses)}", flush=True)
    except Exception as e:
        print(f"[cookies] PSIDTS refresh failed (non-fatal): {e}", flush=True)

def _psidts_refresher_loop():
    while True:
        time.sleep(300)  # every 5 minutes — *DCC tokens rotate faster than PSIDTS
        _refresh_ytm_psidts(force=True)

@app.route("/auth/refresh-cookies", methods=["POST"])
def refresh_cookies():
    """Receive a freshly rotated cookie set captured from the hidden session-keeper WebView.
    A real browser engine rotates the *SIDTS timestamp tokens that plain HTTP cannot, so this
    is what actually keeps the login alive long-term. Replaces the live cookie header + persists.
    """
    global _psidts_last_refresh
    if _ytm is None or not _current_profile or is_local_profile(_current_profile):
        return jsonify({"error": "no_profile"}), 400
    data = request.json or {}
    cookie_str = (data.get("cookie") or "").strip()
    if "SAPISID" not in cookie_str:
        return jsonify({"error": "invalid"}), 400
    base = getattr(_ytm, "base_headers", None)
    if base is None:
        return jsonify({"error": "no_headers"}), 500
    base["cookie"] = cookie_str
    try:
        p = profile_path(_current_profile)
        with open(p) as f:
            raw = json.load(f)
        raw["cookie"] = cookie_str
        with open(p, "w") as f:
            json.dump(raw, f, indent=2)
    except Exception:
        pass
    _psidts_last_refresh = time.time()
    has_ts = "__Secure-1PSIDTS" in cookie_str or "__Secure-3PSIDTS" in cookie_str
    print(f"[cookies] WebView refresh applied (PSIDTS present: {has_ts})", flush=True)
    return jsonify({"ok": True, "psidts": has_ts})

def get_ytmusic():
    if _ytm is None:
        raise Exception("Kein Profil aktiv. Bitte zuerst anmelden.")
    return _ytm

_ydl_cookie_last_refresh = 0.0   # epoch seconds of last successful cookie refresh

def _get_ydl_cookiefile():
    """Write a fresh Netscape cookie file for yt-dlp and return its path.

    Cookie sources (later wins on key conflicts):
    1. Long-lived cookies from headers.json (SAPISID, SID, HSID … valid for years)
    2. Live ytmusicapi session cookies (may include short-lived tokens for
       music.youtube.com set during recent API calls)
    3. A lightweight HEAD request to www.youtube.com using the same session,
       which causes YouTube to issue / rotate __Secure-1PSIDTS and
       __Secure-3PSIDTS on the youtube.com domain — these are the exact tokens
       yt-dlp needs to pass bot-detection when extracting stream URLs.

    The cookie file is only regenerated once per minute; callers that need a
    guaranteed-fresh file can delete it or call with force=True.

    Returns the file path, or None if no authenticated profile is active.
    """
    global _ydl_cookie_last_refresh
    if not _current_profile or is_local_profile(_current_profile):
        return None
    try:
        cookie_file = os.path.join(PROFILES_DIR, f"{_current_profile}_ydl_cookies.txt")

        # ── 1. Stored long-lived cookies from headers.json ──────────────────────
        with open(profile_path(_current_profile)) as f:
            headers = json.load(f)
        cookie_str = headers.get("cookie", "")
        cookie_dict = {}
        for part in cookie_str.split(";"):
            part = part.strip()
            if "=" not in part:
                continue
            name, _, value = part.partition("=")
            name, value = name.strip(), value.strip()
            if name:
                cookie_dict[name] = value

        # ── 2. Live ytmusicapi session cookies (music.youtube.com) ─────────────
        session = None
        try:
            if _ytm is not None and hasattr(_ytm, "_session"):
                session = _ytm._session
                for c in session.cookies:
                    domain = c.domain or ""
                    if "youtube" in domain or not domain:
                        cookie_dict[c.name] = c.value
        except Exception:
            pass

        # ── 3. Ping youtube.com to refresh __Secure-1PSIDTS (anti-bot token) ───
        # ytmusicapi talks to music.youtube.com; yt-dlp stream extraction needs
        # cookies scoped to youtube.com.  A cheap GET on youtube.com triggers
        # YouTube to rotate and set the short-lived bot-detection cookies on the
        # correct domain.  We throttle this to once per 55 seconds.
        now = time.time()
        if session is not None and (now - _ydl_cookie_last_refresh) > 55:
            try:
                resp = session.get(
                    "https://www.youtube.com/",
                    timeout=6,
                    headers={
                        "User-Agent": (
                            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                            "AppleWebKit/537.36 (KHTML, like Gecko) "
                            "Chrome/124.0.0.0 Safari/537.36"
                        ),
                        "Accept-Language": "en-US,en;q=0.9",
                    },
                    allow_redirects=True,
                )
                # Harvest cookies set by this response (youtube.com scope)
                for c in session.cookies:
                    domain = c.domain or ""
                    if "youtube" in domain or not domain:
                        cookie_dict[c.name] = c.value
                _ydl_cookie_last_refresh = now
                _logging.debug("[cookies] youtube.com ping refreshed session cookies")
            except Exception as exc:
                _logging.debug(f"[cookies] youtube.com ping failed (non-fatal): {exc}")

        if not cookie_dict:
            return None

        # ── Write Netscape cookie file ───────────────────────────────────────────
        lines = ["# Netscape HTTP Cookie File\n"]
        for name, value in cookie_dict.items():
            secure = "TRUE" if name.startswith("__Secure-") or name.startswith("__Host-") else "FALSE"
            # Columns: domain  include_subdomains  path  secure  expires  name  value
            lines.append(f".youtube.com\tTRUE\t/\t{secure}\t2147483647\t{name}\t{value}\n")
        # Unix line endings — required for yt-dlp to parse the Netscape header on Windows
        with open(cookie_file, "w", encoding="utf-8", newline="\n") as f:
            f.writelines(lines)
        return cookie_file
    except Exception:
        return None

def _apply_ydl_auth(ydl_opts):
    """Inject cookiefile into yt-dlp opts."""
    # Node PATH is set once at startup — no need to call here again.
    cookie_file = _get_ydl_cookiefile()
    if cookie_file:
        ydl_opts["cookiefile"] = cookie_file
    return ydl_opts

def get_profiles():
    profiles = []
    seen = set()
    # Google profiles — have a .json headers file
    for p in glob.glob(os.path.join(PROFILES_DIR, "*.json")):
        name = os.path.splitext(os.path.basename(p))[0]
        if name.endswith(".meta") or name in seen:
            continue
        mp = os.path.join(PROFILES_DIR, f"{name}.meta.json")
        meta = {}
        if os.path.exists(mp):
            with open(mp) as f:
                meta = json.load(f)
        if meta.get("type") == "local":
            continue  # handled in second pass
        seen.add(name)
        profiles.append({
            "name": name,
            "displayName": meta.get("displayName", name),
            "handle": meta.get("handle", ""),
            "avatar": meta.get("avatar", ""),
            "type": "google",
            "active": name == _current_profile,
        })
    # Local profiles — only have a .meta.json with type==local
    for mp in glob.glob(os.path.join(PROFILES_DIR, "*.meta.json")):
        name = os.path.splitext(os.path.splitext(os.path.basename(mp))[0])[0]
        if name in seen:
            continue
        try:
            with open(mp) as f:
                meta = json.load(f)
        except Exception:
            continue
        if meta.get("type") == "local":
            seen.add(name)
            profiles.append({
                "name": name,
                "displayName": meta.get("displayName", name),
                "handle": "",
                "avatar": "",
                "type": "local",
                "active": name == _current_profile,
            })
        elif meta.get("logged_out"):
            # Logged-out Google profile: no .json headers file, but kept listed
            # so the user can re-authenticate it under the same name.
            seen.add(name)
            profiles.append({
                "name": name,
                "displayName": meta.get("displayName", name),
                "handle": meta.get("handle", ""),
                "avatar": meta.get("avatar", ""),
                "type": "google",
                "active": False,
                "loggedOut": True,
            })
    return profiles

# Migrate legacy browser.json to profiles/
def migrate_legacy():
    legacy = os.path.join(os.path.dirname(__file__), "browser.json")
    if os.path.exists(legacy) and not get_profiles():
        import shutil
        dest = profile_path("default")
        shutil.copy(legacy, dest)
        meta = {"displayName": "Standard"}
        with open(os.path.join(PROFILES_DIR, "default.meta.json"), "w") as f:
            json.dump(meta, f)
        print("[i] browser.json zu profiles/default.json migriert")

# Auto-load first profile on startup
def fetch_account_info(profile_name):
    """Versucht den echten Kontonamen von YouTube Music zu holen."""
    if is_local_profile(profile_name):
        return  # Lokale Profile haben keinen YouTube-Account
    try:
        ytm_temp = make_ytmusic(profile_name)
        # get_account_info gibt Name + Handle zurück
        info = ytm_temp.get_account_info()
        if info:
            meta_path = os.path.join(PROFILES_DIR, f"{profile_name}.meta.json")
            meta = {}
            if os.path.exists(meta_path):
                with open(meta_path) as f:
                    meta = json.load(f)
            meta["displayName"] = info.get("accountName", profile_name)
            meta["handle"] = info.get("channelHandle", "")
            meta["avatar"] = info.get("accountPhotoUrl", "")
            with open(meta_path, "w") as f:
                json.dump(meta, f)
    except Exception as e:
        print(f"[i] Account-Info nicht abrufbar: {e}")

def autoload():
    migrate_legacy()
    # Skip logged-out profiles — they have no auth and can't be loaded. Try each in
    # order until one loads (a leftover, now-unsupported OAuth profile is skipped).
    profiles = [p for p in get_profiles() if not p.get("loggedOut")]
    for p in profiles:
        if load_profile(p["name"]):
            threading.Thread(target=fetch_account_info, args=(p["name"],), daemon=True).start()
            break

autoload()

# Keep the active browser session's anti-bot cookies fresh in the background.
threading.Thread(target=_psidts_refresher_loop, daemon=True).start()

# ─── Profile endpoints ───────────────────────────────────────────────────────

@app.route("/profiles")
def list_profiles():
    return jsonify({"profiles": get_profiles(), "current": _current_profile})

@app.route("/profiles/switch", methods=["POST"])
def switch_profile():
    name = request.json.get("name")
    if not name:
        return jsonify({"error": "Name fehlt"}), 400
    if load_profile(name):
        # Refresh avatar/displayName in background so the UI gets the latest data
        import threading
        threading.Thread(target=fetch_account_info, args=(name,), daemon=True).start()
        return jsonify({"ok": True, "current": name})
    return jsonify({"error": f"Profil '{name}' nicht gefunden"}), 404

@app.route("/profiles/delete", methods=["POST"])
def delete_profile():
    name = request.json.get("name")
    if not name:
        return jsonify({"error": "Name fehlt"}), 400
    path = profile_path(name)
    mp = meta_path(name)
    db = local_db_path(name)
    if os.path.exists(path):
        os.remove(path)
    if os.path.exists(mp):
        os.remove(mp)
    if os.path.exists(db):
        os.remove(db)
    global _current_profile, _ytm
    if _current_profile == name:
        _current_profile = None
        _ytm = None
        autoload()
    return jsonify({"ok": True})

@app.route("/profiles/rename", methods=["POST"])
def rename_profile():
    data = request.json or {}
    name = data.get("name")
    display_name = data.get("displayName")
    if not name or not display_name:
        return jsonify({"error": "Fehlende Parameter"}), 400
    meta_path = os.path.join(PROFILES_DIR, f"{name}.meta.json")
    meta = {}
    if os.path.exists(meta_path):
        with open(meta_path) as f:
            meta = json.load(f)
    meta["displayName"] = display_name
    with open(meta_path, "w") as f:
        json.dump(meta, f)
    return jsonify({"ok": True})

@app.route("/profiles/avatar", methods=["POST"])
def set_profile_avatar():
    data = request.json or {}
    name = data.get("name")
    avatar = data.get("avatar", "")  # data URI, or "" to clear
    if not name:
        return jsonify({"error": "Fehlende Parameter"}), 400
    meta_path = os.path.join(PROFILES_DIR, f"{name}.meta.json")
    meta = {}
    if os.path.exists(meta_path):
        with open(meta_path) as f:
            meta = json.load(f)
    meta["avatar"] = avatar
    with open(meta_path, "w") as f:
        json.dump(meta, f)
    return jsonify({"ok": True})

# ─── Last.fm endpoints ───────────────────────────────────────────────────────
@app.route("/lastfm/status")
def lastfm_status():
    meta = _read_active_meta()
    return jsonify({
        "enabled": _lastfm_enabled(),
        "connected": bool(meta.get("lastfm_session")),
        "username": meta.get("lastfm_user", ""),
    })

@app.route("/lastfm/connect")
def lastfm_connect():
    # Desktop auth step 1: get a request token + the URL the user opens to authorize.
    if not _lastfm_enabled():
        return jsonify({"error": "lastfm_not_configured"}), 400
    ok, data = _lastfm_call("auth.getToken", signed=True)
    if not ok:
        return jsonify({"error": data.get("message", "token_failed")}), 500
    token = data.get("token", "")
    return jsonify({
        "token": token,
        "authUrl": f"https://www.last.fm/api/auth/?api_key={LASTFM_API_KEY}&token={token}",
    })

@app.route("/lastfm/session", methods=["POST"])
def lastfm_session():
    # Desktop auth step 2: exchange the authorized token for a permanent session key.
    token = (request.json or {}).get("token", "")
    if not token:
        return jsonify({"error": "missing_token"}), 400
    ok, data = _lastfm_call("auth.getSession", {"token": token}, signed=True)
    if not ok:
        return jsonify({"error": data.get("message", "session_failed")}), 400
    sess = data.get("session", {})
    meta = _read_active_meta()
    meta["lastfm_session"] = sess.get("key", "")
    meta["lastfm_user"] = sess.get("name", "")
    _write_active_meta(meta)
    return jsonify({"connected": True, "username": sess.get("name", "")})

@app.route("/lastfm/disconnect", methods=["POST"])
def lastfm_disconnect():
    meta = _read_active_meta()
    meta.pop("lastfm_session", None)
    meta.pop("lastfm_user", None)
    _write_active_meta(meta)
    return jsonify({"connected": False})

def _lastfm_track_action(method, http="POST", extra=None):
    """Shared handler for now-playing / scrobble / love / unlove."""
    meta = _read_active_meta()
    sk = meta.get("lastfm_session")
    if not sk:
        return jsonify({"error": "not_connected"}), 400
    d = request.json or {}
    artist, track = d.get("artist", ""), d.get("track", "")
    if not artist or not track:
        return jsonify({"error": "missing_meta"}), 400
    params = {"sk": sk, "artist": artist, "track": track}
    if d.get("album"):
        params["album"] = d["album"]
    if d.get("duration"):
        try: params["duration"] = str(int(float(d["duration"])))
        except Exception: pass
    if extra:
        params.update(extra(d))
    ok, data = _lastfm_call(method, params, http=http, signed=True)
    return (jsonify({"ok": True}), 200) if ok else (jsonify({"ok": False, "error": data}), 502)

@app.route("/lastfm/now-playing", methods=["POST"])
def lastfm_now_playing():
    return _lastfm_track_action("track.updateNowPlaying")

@app.route("/lastfm/scrobble", methods=["POST"])
def lastfm_scrobble():
    return _lastfm_track_action(
        "track.scrobble",
        extra=lambda d: {"timestamp": str(int(d.get("timestamp") or time.time()))},
    )

@app.route("/lastfm/love", methods=["POST"])
def lastfm_love():
    return _lastfm_track_action("track.love")

@app.route("/lastfm/unlove", methods=["POST"])
def lastfm_unlove():
    return _lastfm_track_action("track.unlove")

def parse_curl_to_dict(curl_str):
    """Extrahiert Headers aus einem cURL-Befehl (bash und Windows cmd Format)."""
    import re
    headers = {}

    # Normalize Windows cmd escaping
    curl_str = re.sub(r'\^\s*\n\s*', ' ', curl_str)   # ^ line continuation
    curl_str = curl_str.replace('^\\"', '\x00DQ\x00')  # ^\^" -> placeholder
    curl_str = curl_str.replace('^"', '"')              # ^" -> "
    curl_str = curl_str.replace('\x00DQ\x00', '"')      # restore inner quotes
    curl_str = curl_str.replace('^%^', '%')             # ^%^ -> %
    curl_str = curl_str.replace('^&', '&')              # ^& -> &

    # Extract -b "cookie_string" (Vivaldi puts cookies here)
    m = re.search(r'\s-b\s+"([^"]*)"', curl_str)
    if m:
        headers['cookie'] = m.group(1)

    # Extract all -H "key: value" entries
    for match in re.finditer(r'-H\s+"([^"]+?)"(?:\s|$)', curl_str):
        header = match.group(1)
        if ': ' in header:
            key, _, value = header.partition(': ')
            headers[key.lower().strip()] = value.strip()

    # bash format: -H 'key: value'
    for match in re.finditer(r"-H\s+'([^']+)'", curl_str):
        header = match.group(1)
        if ': ' in header:
            key, _, value = header.partition(': ')
            headers[key.lower().strip()] = value.strip()

    print(f"[i] Parsed {len(headers)} headers: {list(headers.keys())}", flush=True)
    return headers

def parse_raw_headers_to_dict(raw):
    """Parst rohe Headers (key: value Zeilen) in ein Dict."""
    headers = {}
    for line in raw.splitlines():
        if ': ' in line:
            key, _, value = line.partition(': ')
            headers[key.lower().strip()] = value.strip()
    return headers

@app.route("/auth/setup", methods=["POST"])
def setup_auth():
    """Empfängt cURL oder rohe Headers und erstellt ein neues Profil."""
    data = request.json or {}
    headers_raw = data.get("headers_raw", "").strip()
    profile_name = data.get("profile_name", "")
    display_name = data.get("display_name", profile_name)

    if not headers_raw or not profile_name:
        return jsonify({"error": "headers_raw und profile_name erforderlich"}), 400

    # Parse cURL or raw headers
    if headers_raw.startswith("curl "):
        headers = parse_curl_to_dict(headers_raw)
    else:
        headers = parse_raw_headers_to_dict(headers_raw)

    if "cookie" not in headers:
        return jsonify({"error": "The following entries are missing in your headers: cookie, x-goog-authuser. Please try a different request (such as /browse) and make sure you are logged in."}), 400

    if "x-goog-authuser" not in headers:
        headers["x-goog-authuser"] = "0"
    if "origin" not in headers:
        headers["origin"] = "https://music.youtube.com"
    if "x-origin" not in headers:
        headers["x-origin"] = "https://music.youtube.com"

    # Clean headers: strip short-lived cookies and static auth
    headers = clean_headers_for_storage(headers)

    path = profile_path(profile_name)
    with open(path, "w") as f:
        json.dump(headers, f, indent=2)

    meta_path = os.path.join(PROFILES_DIR, f"{profile_name}.meta.json")
    with open(meta_path, "w") as f:
        json.dump({"displayName": display_name}, f)

    try:
        ytm_temp = YTMusic(path)
        ytm_temp.get_liked_songs(limit=1)
        global _ytm, _current_profile, _playlist_cache
        _ytm = ytm_temp
        _current_profile = profile_name
        _playlist_cache.clear()
        threading.Thread(target=fetch_account_info, args=(profile_name,), daemon=True).start()
        return jsonify({"ok": True, "profile": profile_name})
    except Exception as e:
        if os.path.exists(path): os.remove(path)
        return jsonify({"error": str(e)}), 500


@app.route("/auth/cookie-login", methods=["POST"])
def cookie_login():
    """Empfängt Cookies direkt aus dem eingebetteten Browser-Fenster."""
    data = request.json or {}
    cookie_str = data.get("cookie", "")
    user_agent = data.get("user_agent", "Mozilla/5.0")
    profile_name = data.get("profile_name", "default")

    if not cookie_str:
        return jsonify({"error": "Keine Cookies"}), 400

    # Check for required auth cookies
    required = ["SAPISID", "SSID", "HSID"]
    has_auth = any(c in cookie_str for c in required)
    if not has_auth:
        return jsonify({"error": "Keine Auth-Cookies gefunden. Bitte erst einloggen."}), 400

    # Extract SAPISID for authorization header
    import hashlib, time
    sapisid = ""
    for part in cookie_str.split(";"):
        part = part.strip()
        if part.startswith("SAPISID="):
            sapisid = part[8:]
            break

    # Build browser.json format
    headers = {
        "accept": "*/*",
        "accept-language": "en-US,en;q=0.5",
        "content-type": "application/json",
        "cookie": cookie_str,
        "origin": "https://music.youtube.com",
        "user-agent": user_agent,
        "x-origin": "https://music.youtube.com",
    }

    # Clean headers: strip short-lived cookies and static auth
    headers = clean_headers_for_storage(headers)

    path = profile_path(profile_name)
    with open(path, "w") as f:
        json.dump(headers, f, indent=2)

    # Try to initialize YTMusic
    try:
        ytm_temp = YTMusic(path)
        # Quick test
        ytm_temp.get_liked_songs(limit=1)
        global _ytm, _current_profile, _playlist_cache
        _ytm = ytm_temp
        _current_profile = profile_name
        _playlist_cache.clear()

        # Save meta — merge with any existing meta so a re-login into a logged-out
        # profile keeps its data and drops the logged_out flag.
        meta_path = os.path.join(PROFILES_DIR, f"{profile_name}.meta.json")
        meta = {}
        if os.path.exists(meta_path):
            try:
                with open(meta_path) as f:
                    meta = json.load(f)
            except Exception:
                meta = {}
        meta.pop("logged_out", None)
        meta.setdefault("displayName", profile_name.capitalize())
        with open(meta_path, "w") as f:
            json.dump(meta, f)

        # Fetch real account name in background
        threading.Thread(target=fetch_account_info, args=(profile_name,), daemon=True).start()
        # Clear the "adding account" flag so validate returns valid
        global _adding_account
        _adding_account = False
        return jsonify({"ok": True, "profile": profile_name})
    except Exception as e:
        if os.path.exists(path):
            os.remove(path)
        return jsonify({"error": f"Login fehlgeschlagen: {str(e)}"}), 500

@app.route("/auth/logout", methods=["POST"])
def logout():
    """Logs out the active Google profile: removes its auth cookies (the .json
    headers file) while keeping the profile's .meta.json and local DB, so the
    profile stays listed and can be re-authenticated later under the same name.
    Non-destructive — pins/recents (frontend localStorage) and account data stay.
    Local profiles have no session and cannot be logged out."""
    global _current_profile, _ytm, _playlist_cache
    name = _current_profile
    if not name:
        return jsonify({"error": "Kein aktives Profil"}), 400
    if is_local_profile(name):
        return jsonify({"error": "Lokales Profil kann nicht abgemeldet werden"}), 400

    # Remove the auth headers/cookies (keeps .meta.json + local DB)
    p = profile_path(name)
    if os.path.exists(p):
        os.remove(p)

    # Mark the profile as logged out so get_profiles() keeps listing it
    mp = meta_path(name)
    meta = {}
    if os.path.exists(mp):
        try:
            with open(mp) as f:
                meta = json.load(f)
        except Exception:
            meta = {}
    meta["logged_out"] = True
    with open(mp, "w") as f:
        json.dump(meta, f)

    _current_profile = None
    _ytm = None
    _playlist_cache = {}
    return jsonify({"ok": True})

@app.route("/auth/validate")
def validate_auth():
    """Prüft ob das aktuelle Profil noch gültig ist."""
    if _adding_account:
        return jsonify({"valid": False, "reason": "adding_account"})
    if _ytm is None:
        return jsonify({"valid": False, "reason": "no_profile"})
    if _current_profile:
        # Local profile: check meta file exists
        if is_local_profile(_current_profile):
            if os.path.exists(meta_path(_current_profile)):
                return jsonify({"valid": True, "profile": _current_profile, "type": "local"})
            return jsonify({"valid": False, "reason": "no_profile"})
        # Google profile: check headers file exists
        if os.path.exists(profile_path(_current_profile)):
            return jsonify({"valid": True, "profile": _current_profile, "type": "google"})
    return jsonify({"valid": False, "reason": "no_profile"})

@app.route("/auth/local-create", methods=["POST"])
def local_create():
    """Erstellt ein neues lokales Profil ohne Google-Account."""
    data = request.json or {}
    display_name = (data.get("displayName") or "").strip()
    if not display_name:
        return jsonify({"error": "Name fehlt"}), 400
    # Sanitize to a filesystem-safe profile name
    import re
    base = re.sub(r'[^\w\-]', '_', display_name.lower())[:40] or "local"
    name = base
    counter = 1
    while os.path.exists(meta_path(name)):
        name = f"{base}_{counter}"
        counter += 1
    # Write meta
    os.makedirs(PROFILES_DIR, exist_ok=True)
    with open(meta_path(name), "w") as f:
        json.dump({"displayName": display_name, "type": "local"}, f)
    # Init SQLite schema
    with local_db(name):
        pass
    # Activate profile
    load_profile(name)
    return jsonify({"ok": True, "profile": name, "displayName": display_name})

@app.route("/auth/begin-add", methods=["POST"])
def begin_add():
    global _adding_account
    _adding_account = True
    return jsonify({"ok": True})

@app.route("/auth/end-add", methods=["POST"])
def end_add():
    global _adding_account
    _adding_account = False
    return jsonify({"ok": True})

def _lyrics_cache_key(title, artist, source):
    import hashlib
    raw = f"{title.lower().strip()}|{artist.lower().strip()}|{source}"
    return hashlib.md5(raw.encode()).hexdigest()

@app.route("/lyrics")
def get_lyrics():
    """Proxy für Lyrics-APIs um CSP-Probleme im Production Build zu umgehen."""
    title = request.args.get("title", "")
    artist = request.args.get("artist", "")
    album = request.args.get("album", "")
    duration = request.args.get("duration", "")
    source = request.args.get("source", "auto")
    video_id = request.args.get("videoId", "")

    # Check lyrics cache first
    if _cache_enabled.get("lyrics", True):
        cache_key = _lyrics_cache_key(title, artist, source)
        cache_path = os.path.join(LYRICS_CACHE_DIR, f"{cache_key}.json")
        if os.path.exists(cache_path):
            try:
                with open(cache_path, "r", encoding="utf-8") as f:
                    return jsonify(json.load(f))
            except Exception:
                pass

    import requests as req
    result = None

    # 1. LRCLIB
    if source in ("auto", "lrclib"):
        try:
            r = req.get(f"https://lrclib.net/api/get",
                params={"artist_name": artist, "track_name": title},
                timeout=8)
            if r.ok:
                d = r.json()
                if d.get("syncedLyrics"):
                    result = {"source": "LRCLIB", "synced": d["syncedLyrics"], "plain": None}
                elif d.get("plainLyrics"):
                    result = {"source": "LRCLIB", "synced": None, "plain": d["plainLyrics"]}
        except Exception as e:
            print(f"[lyrics] LRCLIB error: {e}", flush=True)

    # 2. Better Lyrics
    if not result and source in ("auto", "better"):
        try:
            params = {"s": title, "a": artist}
            if album: params["al"] = album
            if duration: params["d"] = duration
            r = req.get("https://lyrics-api.boidu.dev/getLyrics", params=params, timeout=8)
            if r.ok:
                d = r.json()
                if d.get("ttml"):
                    result = {"source": "Better Lyrics", "ttml": d["ttml"]}
        except Exception as e:
            print(f"[lyrics] Better Lyrics error: {e}", flush=True)

    # 3. Kugou
    if not result and source in ("auto", "kugou"):
        try:
            import base64
            keyword = f"{title} {artist}".strip()
            duration_ms = int(float(duration) * 1000) if duration else 0

            # Step 1: search for song to get hash
            search_r = req.get(
                "https://mobilecdn.kugou.com/api/v3/search/song",
                params={"keyword": keyword, "page": 1, "pagesize": 5, "format": "json"},
                timeout=8
            )
            if search_r.ok:
                songs = search_r.json().get("data", {}).get("info", [])
                if songs:
                    hash_val = songs[0].get("hash", "")

                    # Step 2: get lyrics candidates
                    cand_r = req.get(
                        "https://lyrics.kugou.com/search",
                        params={
                            "ver": 1, "man": "yes", "client": "pc",
                            "keyword": f"{title} - {artist}",
                            "duration": duration_ms,
                            "hash": hash_val,
                        },
                        timeout=8
                    )
                    if cand_r.ok:
                        candidates = cand_r.json().get("candidates", [])
                        if candidates:
                            cand = candidates[0]

                            # Step 3: download LRC
                            dl_r = req.get(
                                "https://lyrics.kugou.com/download",
                                params={
                                    "ver": 1, "client": "pc",
                                    "id": cand["id"],
                                    "accesskey": cand["accesskey"],
                                    "fmt": "lrc", "charset": "utf8",
                                },
                                timeout=8
                            )
                            if dl_r.ok:
                                content_b64 = dl_r.json().get("content", "")
                                if content_b64:
                                    lrc = base64.b64decode(content_b64).decode("utf-8", errors="ignore")
                                    if lrc.strip():
                                        result = {"source": "Kugou", "synced": lrc, "plain": None}
        except Exception as e:
            print(f"[lyrics] Kugou error: {e}", flush=True)

    # 4. Musixmatch (Word-Sync via RichSync, fallback: Line-Sync)
    if not result and source in ("auto", "musixmatch"):
        try:
            result = _try_musixmatch(title, artist, duration)
        except Exception as e:
            print(f"[lyrics] Musixmatch error: {e}", flush=True)

    # 5. Unison by Better Lyrics (community lyrics)
    # Response shape: { success: bool, data: { lyrics, format, ... } } for direct lookup
    #                 { success: bool, data: [ { lyrics, format, ... } ] } for search
    if not result and source in ("auto", "unison"):
        try:
            item = None
            # Step 1: try direct lookup by videoId (most reliable)
            if video_id:
                r = req.get("https://unison.boidu.dev/lyrics", params={"v": video_id}, timeout=8)
                if r.ok:
                    d = r.json()
                    if d.get("success") and isinstance(d.get("data"), dict):
                        item = d["data"]
            # Step 2: fallback to fuzzy search by title + artist
            if not item:
                search_params = {"song": title, "artist": artist}
                if album: search_params["album"] = album
                if duration: search_params["duration"] = duration
                r = req.get("https://unison.boidu.dev/lyrics/search", params=search_params, timeout=8)
                if r.ok:
                    d = r.json()
                    if d.get("success") and isinstance(d.get("data"), list) and d["data"]:
                        item = d["data"][0]
            if item:
                fmt = item.get("format")
                lyrics_content = item.get("lyrics")
                # Resolve submitter displayName via leaderboard endpoint
                submitter_name = None
                submitter = item.get("submitter") or {}
                key_id = submitter.get("keyId")
                if key_id:
                    try:
                        ur = req.get(f"https://unison.boidu.dev/leaderboard/users/{key_id}", timeout=5)
                        if ur.ok:
                            ud = ur.json()
                            submitter_name = ud.get("data", {}).get("displayName")
                    except Exception:
                        pass
                if lyrics_content:
                    if fmt == "ttml":
                        result = {"source": "Unison", "ttml": lyrics_content, "submitterName": submitter_name}
                    elif fmt == "lrc":
                        result = {"source": "Unison", "synced": lyrics_content, "plain": None, "submitterName": submitter_name}
                    elif fmt == "plain":
                        result = {"source": "Unison", "synced": None, "plain": lyrics_content, "submitterName": submitter_name}
        except Exception as e:
            print(f"[lyrics] Unison error: {e}", flush=True)

    # 6. SimpMusic (videoId-only — search endpoint is currently unavailable)
    if not result and source in ("auto", "simp") and video_id:
        try:
            r = req.get(f"https://api-lyrics.simpmusic.org/v1/{video_id}", timeout=8)
            if r.ok:
                d = r.json()
                items = d.get("data", [])
                item = items[0] if isinstance(items, list) and items else None
                if item:
                    synced = item.get("syncedLyrics")
                    plain = item.get("plainLyric")
                    if synced:
                        result = {"source": "SimpMusic", "synced": synced, "plain": None}
                    elif plain:
                        result = {"source": "SimpMusic", "synced": None, "plain": plain}
        except Exception as e:
            print(f"[lyrics] SimpMusic error: {e}", flush=True)

    if not result:
        return jsonify({"source": None, "synced": None, "plain": None})

    # Save to cache
    if _cache_enabled.get("lyrics", True):
        try:
            cache_key = _lyrics_cache_key(title, artist, source)
            cache_path = os.path.join(LYRICS_CACHE_DIR, f"{cache_key}.json")
            with open(cache_path, "w", encoding="utf-8") as f:
                json.dump(result, f, ensure_ascii=False)
        except Exception:
            pass

    return jsonify(result)

@app.route("/lyrics/unison/versions")
def unison_versions():
    """Return ALL Unison submissions for a track (not just the best one) so the lyrics
    browser can offer multiple community versions to choose from.

    Note: Unison search results carry only metadata (id, videoId, format, voteCount) —
    the actual lyrics must be fetched per id via GET /lyrics/:id. The exact videoId
    lookup, however, returns lyrics inline.
    """
    import requests as req
    BASE = "https://unison.boidu.dev"
    video_id = request.args.get("videoId", "")
    title    = request.args.get("title", "") or request.args.get("song", "")
    artist   = request.args.get("artist", "")
    album    = request.args.get("album", "")
    duration = request.args.get("duration", "")

    candidates, seen = [], set()
    def add(it):
        if not isinstance(it, dict):
            return
        cid = it.get("id")
        key = cid if cid is not None else hash(it.get("lyrics") or repr(it))
        if key in seen:
            return
        seen.add(key)
        candidates.append(it)

    def search(params):
        try:
            r = req.get(f"{BASE}/lyrics/search", params=params, timeout=8)
            if r.ok:
                d = r.json()
                if d.get("success") and isinstance(d.get("data"), list):
                    return d["data"]
        except Exception:
            pass
        return []

    try:
        # 1. Exact video match — returns full lyrics inline.
        if video_id:
            r = req.get(f"{BASE}/lyrics", params={"v": video_id}, timeout=8)
            if r.ok:
                d = r.json()
                if d.get("success"):
                    data = d.get("data")
                    if isinstance(data, dict):
                        add(data)
                    elif isinstance(data, list):
                        for it in data:
                            add(it)
        # 2. Strict metadata search.
        sp = {"song": title, "artist": artist}
        if album:    sp["album"] = album
        if duration: sp["duration"] = duration
        for it in search(sp):
            add(it)
        # 3. Full-text search, but only keep hits whose song+artist actually match,
        #    so we surface alternate submissions without pulling in unrelated songs.
        al, tl = (artist or "").lower(), (title or "").lower()
        for it in search({"q": f"{title} {artist}".strip()}):
            ia = (it.get("artist") or "").lower()
            isong = (it.get("song") or it.get("title") or "").lower()
            if al and ia and (al in ia or ia in al) and tl and isong and (tl in isong or isong in tl):
                add(it)
    except Exception as e:
        print(f"[lyrics] Unison versions error: {e}", flush=True)

    # Resolve full lyrics (search items lack them) + submitter names; cap the list.
    # Candidates are already deduped by Unison submission id (see add()), which keeps
    # genuinely distinct submissions even when their text is identical.
    versions, name_cache = [], {}
    for it in candidates[:8]:
        lyr = it.get("lyrics")
        fmt = it.get("format")
        sync_type = it.get("syncType")
        cid = it.get("id")
        submitter = it.get("submitter") or {}
        if not lyr and cid is not None:
            try:
                r = req.get(f"{BASE}/lyrics/{cid}", timeout=6)
                if r.ok:
                    fd = (r.json() or {}).get("data") or {}
                    lyr = fd.get("lyrics")
                    fmt = fd.get("format") or fmt
                    sync_type = fd.get("syncType") or sync_type
                    submitter = fd.get("submitter") or submitter
            except Exception:
                pass
        if not lyr:
            continue
        key_id = submitter.get("keyId")
        sname = None
        if key_id:
            if key_id in name_cache:
                sname = name_cache[key_id]
            else:
                try:
                    ur = req.get(f"{BASE}/leaderboard/users/{key_id}", timeout=4)
                    if ur.ok:
                        sname = ur.json().get("data", {}).get("displayName")
                except Exception:
                    pass
                name_cache[key_id] = sname
        versions.append({
            "id": cid,
            "format": fmt,
            "syncType": sync_type,
            "lyrics": lyr,
            "submitterName": sname,
            "voteCount": it.get("voteCount"),
        })
    return jsonify({"versions": versions})

# ─── Unison write proxy (signed requests) ─────────────────────────────────────
# The frontend signs the request body with the user's ECDSA key (WebCrypto) and the
# backend forwards the signed envelope verbatim to Unison. The private key never leaves
# the frontend; this keeps the CSP tight (no direct browser→unison connection needed).
def _unison_forward(method, path):
    import requests as req
    body = request.get_json(silent=True)
    try:
        url = f"https://unison.boidu.dev{path}"
        r = req.request(method, url, json=body, timeout=12)
        ct = r.headers.get("Content-Type", "application/json")
        return (r.content, r.status_code, {"Content-Type": ct})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)}), 502

@app.route("/unison/lyrics/<lyrics_id>/vote", methods=["POST", "DELETE"])
def unison_vote(lyrics_id):
    return _unison_forward(request.method, f"/lyrics/{lyrics_id}/vote")

@app.route("/unison/lyrics/<lyrics_id>/report", methods=["POST"])
def unison_report(lyrics_id):
    return _unison_forward("POST", f"/lyrics/{lyrics_id}/report")

@app.route("/unison/auth/nickname", methods=["PUT", "DELETE"])
def unison_nickname():
    return _unison_forward(request.method, "/auth/nickname")

@app.route("/unison/auth/nickname/check", methods=["POST"])
def unison_nickname_check():
    return _unison_forward("POST", "/auth/nickname/check")

@app.route("/unison/displayname/<key_id>")
def unison_displayname(key_id):
    """Resolve a user's current display name (custom nickname, or derived pet name)."""
    import requests as req
    try:
        r = req.get(f"https://unison.boidu.dev/leaderboard/users/{key_id}", timeout=6)
        if r.ok:
            return jsonify({"displayName": (r.json().get("data") or {}).get("displayName")})
    except Exception:
        pass
    return jsonify({"displayName": None})

# ─── Composer Bridge ──────────────────────────────────────────────────────────
# Kodama acts as the local "Composer Bridge" for Boidu's Composer (composer.boidu.dev),
# feeding it YouTube audio it extracts itself (yt-dlp). The composer fetches
# {bridgeUrl}/health and {bridgeUrl}/audio/<videoId>; we serve those under
# /composer-bridge. CORS must allow the composer origin so its JS can read the bytes
# and the x-track-* metadata headers.
_COMPOSER_ORIGIN = "https://composer.boidu.dev"

def _bridge_headers(resp):
    resp.headers["Access-Control-Allow-Origin"] = _COMPOSER_ORIGIN
    resp.headers["Access-Control-Expose-Headers"] = "Content-Type, x-track-title, x-track-artist, x-track-album"
    return resp

@app.route("/composer-bridge/health")
def composer_bridge_health():
    return _bridge_headers(jsonify({"bridge": "kodama", "ytdlp": "ok", "status": "ok"}))

@app.route("/composer-bridge/audio/<video_id>")
def composer_bridge_audio(video_id):
    import requests as req
    from urllib.parse import quote

    # Optional track metadata for the composer's submission fields.
    title = artist = None
    try:
        info = get_ytmusic().get_song(video_id) or {}
        vd = info.get("videoDetails", {}) or {}
        title = vd.get("title"); artist = vd.get("author")
    except Exception:
        pass

    def _with_meta(resp):
        _bridge_headers(resp)
        if title:  resp.headers["x-track-title"]  = quote(title)
        if artist: resp.headers["x-track-artist"] = quote(artist)
        return resp

    # 1. Serve instantly from a local copy if we already have one — no re-extraction:
    #    (a) Kodama's download cache, or (b) the file the player just downloaded to play it
    #    (stream-prepare temp cache). Reusing (b) is what makes opening the Composer for the
    #    currently/recently played song instant instead of re-pulling from YouTube.
    cached = _song_audio_path(video_id) or _player_audio_path(video_id)
    if cached:
        from flask import send_file
        ext = os.path.splitext(cached)[1].lower()
        mime = {
            ".opus": "audio/opus", ".m4a": "audio/mp4", ".mp4": "audio/mp4",
            ".webm": "audio/webm", ".mp3": "audio/mpeg", ".ogg": "audio/ogg",
            ".flac": "audio/flac", ".wav": "audio/wav",
        }.get(ext, "audio/mp4")
        return _with_meta(send_file(cached, mimetype=mime))

    # 2. Otherwise resolve the stream URL via our robust multi-tier extractor (/stream).
    url = None
    try:
        sr = req.get(f"http://127.0.0.1:9847/stream/{video_id}", timeout=60)
        data = sr.json()
        url = data.get("url")
    except Exception as e:
        return _bridge_headers(jsonify({"error": str(e)})), 502
    if not url:
        return _bridge_headers(jsonify({"error": (data or {}).get("error", "no_url")})), 502

    try:
        upstream = req.get(url, stream=True, timeout=120)
    except Exception as e:
        return _bridge_headers(jsonify({"error": str(e)})), 502

    content_type = upstream.headers.get("Content-Type", "audio/mp4")
    # Tee the bytes into the song cache (if enabled) so reopening this song is instant.
    # Written without a .json sidecar, so it doesn't show up as a "downloaded" song but is
    # still found by _song_audio_path() for the composer (and Kodama playback).
    do_cache = _composer_autocache and _cache_enabled.get("songs", True)
    safe = video_id.replace("/", "_").replace("\\", "_")
    ext = ".webm" if "webm" in content_type else (".mp3" if ("mpeg" in content_type or "mp3" in content_type) else ".m4a")
    cache_target = os.path.join(SONG_CACHE_DIR, safe + ext)
    tmp_path = cache_target + ".part"
    def generate():
        f = None
        try:
            if do_cache:
                try: f = open(tmp_path, "wb")
                except Exception: f = None
            for chunk in upstream.iter_content(chunk_size=65536):
                if chunk:
                    if f:
                        try: f.write(chunk)
                        except Exception:
                            try: f.close()
                            except Exception: pass
                            f = None
                    yield chunk
            if f:
                f.close(); f = None
                try: os.replace(tmp_path, cache_target)
                except Exception: pass
        finally:
            if f:
                try: f.close()
                except Exception: pass
                try: os.remove(tmp_path)
                except Exception: pass
    return _with_meta(Response(generate(), content_type=content_type))

@app.route("/composer-bridge/thumb/<video_id>")
def composer_bridge_thumb(video_id):
    import requests as req
    # YouTube thumbnail, best available resolution first. The composer reads it as a blob.
    for name in ("maxresdefault", "hqdefault", "mqdefault"):
        try:
            r = req.get(f"https://i.ytimg.com/vi/{video_id}/{name}.jpg", timeout=10)
            if r.ok and len(r.content) > 1024:
                resp = Response(r.content, content_type=r.headers.get("Content-Type", "image/jpeg"))
                resp.headers["Access-Control-Allow-Origin"] = _COMPOSER_ORIGIN
                return resp
        except Exception:
            continue
    return _bridge_headers(jsonify({"error": "no_thumb"})), 404

@app.route("/composer-bridge/autocache", methods=["GET", "POST"])
def composer_bridge_autocache():
    """Get/set whether the bridge caches extracted audio for reuse (persisted)."""
    global _composer_autocache
    if request.method == "POST":
        body = request.json or {}
        if "enabled" in body:
            _composer_autocache = bool(body["enabled"])
            try:
                with open(_COMPOSER_SETTINGS_FILE, "w") as f:
                    json.dump({"autocache": _composer_autocache}, f)
            except Exception:
                pass
    return jsonify({"enabled": _composer_autocache})

# --- Vendored Boidu Composer (served locally, same origin as the bridge) ------------
# Kodama ships a locally-built copy of the composer (repo ./composer, built to ./composer/dist
# with base "/composer-app/"). Serving it here means the composer window loads from the same
# origin as /composer-bridge, so there is no cross-origin/CORS involved at all.
def _composer_dist_dir():
    # 1. explicit override — Tauri can point this at the bundled resource dir in production.
    env = os.environ.get("KODAMA_COMPOSER_DIST")
    if env and os.path.isdir(env):
        return env
    # 2. frozen (PyInstaller): the dist is bundled as data and extracted to sys._MEIPASS.
    if getattr(sys, "frozen", False):
        meipass = getattr(sys, "_MEIPASS", None)
        if meipass:
            frozen = os.path.join(meipass, "composer_dist")
            if os.path.isdir(frozen):
                return frozen
    here = os.path.dirname(os.path.abspath(__file__))
    # 3. dev layout: repo/composer/dist (server.py lives in repo/python-backend).
    dev = os.path.abspath(os.path.join(here, "..", "composer", "dist"))
    if os.path.isdir(dev):
        return dev
    # 4. bundled next to the backend executable/script.
    return os.path.join(here, "composer_dist")

@app.route("/composer-app/", defaults={"subpath": ""})
@app.route("/composer-app/<path:subpath>")
def composer_app(subpath):
    """Serve the locally-built composer SPA (asset files, else index.html fallback)."""
    from flask import send_from_directory
    from werkzeug.exceptions import NotFound
    root = _composer_dist_dir()
    if not os.path.isdir(root):
        return jsonify({"error": "composer_not_built"}), 404
    if subpath:
        try:
            return send_from_directory(root, subpath)
        except NotFound:
            pass  # SPA route → fall through to index.html
    return send_from_directory(root, "index.html")

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

# In-memory LRU cache für Lyrics-Übersetzungen (max 500 Einträge)
_LYRICS_CACHE_MAX = 500
_translation_cache = collections.OrderedDict()
_romaji_cache      = collections.OrderedDict()

def _lru_put(cache, key, value):
    cache[key] = value
    cache.move_to_end(key)
    if len(cache) > _LYRICS_CACHE_MAX:
        cache.popitem(last=False)

# Romaji-Konverter (lazy init)
_kakasi = None
_JP_RE = __import__('re').compile(r'[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff\uff66-\uff9f]')

def _get_kakasi():
    global _kakasi
    if _kakasi is None:
        import pykakasi
        _kakasi = pykakasi.kakasi()
    return _kakasi

@app.route("/romanize-lyrics", methods=["POST"])
def romanize_lyrics():
    """Konvertiert japanische Lyrics-Zeilen zu Romaji via pykakasi."""
    data = request.get_json()
    lines = data.get("lines", [])

    if not lines:
        return jsonify({"romanizations": []})

    try:
        kks = _get_kakasi()
    except ImportError:
        return jsonify({"error": "pykakasi nicht installiert.", "romanizations": [""] * len(lines)}), 503

    result = []
    for line in lines:
        if not line.strip() or not _JP_RE.search(line):
            result.append("")
            continue
        cache_key = f"romaji:{line}"
        if cache_key in _romaji_cache:
            result.append(_romaji_cache[cache_key])
            continue
        converted = kks.convert(line)
        romaji = " ".join(
            item.get('hepburn') or item.get('orig', '')
            for item in converted
            if (item.get('hepburn') or item.get('orig', '')).strip()
        )
        _lru_put(_romaji_cache, cache_key, romaji)
        result.append(romaji)

    return jsonify({"romanizations": result})

# Google Translate language code mapping (DeepL uppercase → Google lowercase)
_GOOGLE_LANG = {
    "DE": "de", "EN": "en", "FR": "fr", "ES": "es", "IT": "it",
    "PT": "pt", "NL": "nl", "PL": "pl", "RU": "ru",
    "JA": "ja", "KO": "ko", "ZH": "zh-CN",
}

def _google_translate_batch(lines, target_lang):
    """Übersetzt eine Liste von Strings via inoffizielle Google Translate API.
    Nutzt \n als Trennzeichen um mit einem Request auszukommen."""
    gl = _GOOGLE_LANG.get(target_lang, target_lang.lower())
    # Zeilen mit seltener Zeichenfolge verbinden damit Google sie nicht zusammenzieht
    separator = "\n"
    text = separator.join(lines)
    params = {
        "client": "gtx",
        "sl": "auto",
        "tl": gl,
        "dt": "t",
        "q": text,
    }
    resp = requests.get(
        "https://translate.googleapis.com/translate_a/single",
        params=params,
        timeout=30,
        headers={"User-Agent": "Mozilla/5.0"},
    )
    resp.raise_for_status()
    data = resp.json()
    # data[0] enthält [[übersetzt, original, ...], ...] Chunks
    translated = "".join(chunk[0] for chunk in data[0] if chunk and chunk[0])
    translated_lines = translated.split("\n")
    # Auf gleiche Länge bringen
    while len(translated_lines) < len(lines):
        translated_lines.append("")
    return translated_lines[:len(lines)]

@app.route("/translate-lyrics", methods=["POST"])
def translate_lyrics():
    """Übersetzt Lyrics-Zeilen via Google Translate (kein API-Key nötig)."""
    data = request.get_json()
    lines = data.get("lines", [])
    target_lang = data.get("target_lang", "DE").upper()

    if not lines:
        return jsonify({"translations": []})

    # Leere Zeilen (Pausen/Leerzeilen) direkt durchlassen
    non_empty_indices = [i for i, l in enumerate(lines) if l.strip()]
    non_empty_lines = [lines[i] for i in non_empty_indices]

    if not non_empty_lines:
        return jsonify({"translations": list(lines)})

    cache_key = f"{target_lang}:{hash(tuple(non_empty_lines))}"
    if cache_key in _translation_cache:
        cached = _translation_cache[cache_key]
        result = list(lines)
        for idx, translated in zip(non_empty_indices, cached):
            result[idx] = translated
        return jsonify({"translations": result})

    try:
        translated_lines = _google_translate_batch(non_empty_lines, target_lang)
        _lru_put(_translation_cache, cache_key, translated_lines)
        result = list(lines)
        for idx, translated in zip(non_empty_indices, translated_lines):
            result[idx] = translated
        return jsonify({"translations": result})
    except Exception as e:
        print(f"[Translation] Error: {e}")
        return jsonify({"error": str(e), "translations": list(lines)}), 500

@app.route("/cache/stats")
def cache_stats():
    pl_size, pl_count = _dir_size_and_count(PLAYLIST_CACHE_DIR)
    al_size, al_count = _dir_size_and_count(ALBUM_CACHE_DIR)
    img_size, img_count = _dir_size_and_count(IMG_CACHE_DIR)
    song_size, song_count = _dir_size_and_count(SONG_CACHE_DIR)
    # Count only .json metadata files for accurate song count
    try:
        song_count = len([f for f in os.listdir(SONG_CACHE_DIR) if f.endswith(".json")])
    except Exception:
        song_count = 0
    lyr_size, lyr_count = _dir_size_and_count(LYRICS_CACHE_DIR)
    return jsonify({
        "playlists": {"size": pl_size, "count": pl_count, "enabled": _cache_enabled["playlists"]},
        "albums":    {"size": al_size, "count": al_count, "enabled": _cache_enabled["albums"]},
        "images":    {"size": img_size, "count": img_count, "enabled": _cache_enabled["images"]},
        "songs":     {"size": song_size, "count": song_count, "enabled": _cache_enabled["songs"]},
        "lyrics":    {"size": lyr_size, "count": lyr_count, "enabled": _cache_enabled["lyrics"]},
    })

@app.route("/cache/clear", methods=["POST"])
def cache_clear():
    global _playlist_cache, _download_status
    data = request.get_json() or {}
    category = data.get("category", "all")
    dirs = {"playlists": PLAYLIST_CACHE_DIR, "albums": ALBUM_CACHE_DIR, "images": IMG_CACHE_DIR, "songs": SONG_CACHE_DIR, "lyrics": LYRICS_CACHE_DIR}
    to_clear = [category] if category in dirs else list(dirs.keys())
    for cat in to_clear:
        d = dirs[cat]
        for f in os.listdir(d):
            try:
                os.remove(os.path.join(d, f))
            except Exception:
                pass
        if cat == "playlists":
            _playlist_cache.clear()
        if cat == "songs":
            _download_status = {}
    return jsonify({"ok": True})

@app.route("/cache/settings", methods=["GET", "POST"])
def cache_settings():
    global _cache_enabled
    if request.method == "POST":
        body = request.get_json() or {}
        for k in ("playlists", "albums", "images", "songs", "lyrics"):
            if k in body:
                _cache_enabled[k] = bool(body[k])
        return jsonify({"ok": True})
    return jsonify(_cache_enabled)

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

# Each entry: (format_string, extra_ydl_opts, skip_auth)
#
# Strategy (2026): YouTube requires PO tokens for the default `web` client
# when cookies are present, but mobile clients (android_music, ios) bypass
# that requirement entirely.  Authenticated mobile clients are therefore
# tried FIRST — they have valid cookies, skip PO-token checks, and are
# less likely to trigger the "Sign in to confirm you're not a bot" error.
# Anonymous clients follow as fallback (no cookies = no PO-token demand).
# The plain web client (default / web_music) comes last; it only works
# anonymously when YouTube hasn't flagged the IP.
_WEB_MUSIC_OPTS  = {"extractor_args": {"youtube": {"player_client": ["web_music"]}}}
_ANDROID_OPTS    = {"extractor_args": {"youtube": {"player_client": ["android_music"], "player_skip": ["js"]}}}
_IOS_OPTS        = {"extractor_args": {"youtube": {"player_client": ["ios"],           "player_skip": ["js"]}}}
_IOS_MUSIC_OPTS  = {"extractor_args": {"youtube": {"player_client": ["ios_music"],     "player_skip": ["js"]}}}
_TV_OPTS         = {"extractor_args": {"youtube": {"player_client": ["tv_embedded"],   "player_skip": ["js"]}}}
_M4A_FMT = "bestaudio[ext=m4a]/bestaudio[acodec=aac]"

_MWEB_OPTS = {"extractor_args": {"youtube": {"player_client": ["mweb"]}}}

# Strategy (2026): Web cookies ONLY work correctly with web clients.
# Mixing mobile client headers (android_music, ios) with web cookies causes
# YouTube to detect an inconsistency and return "Sign in to confirm you're not a bot".
# → Authenticated requests use web_music / default web client only.
# → Mobile clients are ALWAYS anonymous (no cookies = no client mismatch).
# → Anonymous fallbacks try youtube.com (use_ytm=False) for wider format availability.
_STREAM_ATTEMPTS = [
    # ── 1. Authenticated web clients (web cookies + web client = consistent) ─────
    (_M4A_FMT, _WEB_MUSIC_OPTS, False),   # web_music + cookies
    (_M4A_FMT, None,            False),    # default web + cookies
    # ── 2. Anonymous mobile/TV (no cookies → no mismatch, no PO-token demand) ───
    (_M4A_FMT, _TV_OPTS,        True),
    (_M4A_FMT, _ANDROID_OPTS,   True),
    (_M4A_FMT, _IOS_OPTS,       True),
    (_M4A_FMT, _IOS_MUSIC_OPTS, True),
    (_M4A_FMT, _MWEB_OPTS,      True),    # mobile-web often bypasses bot checks
    # ── 3. Anonymous web ─────────────────────────────────────────────────────────
    (_M4A_FMT, _WEB_MUSIC_OPTS, True),
    (_M4A_FMT, None,            True),
]

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

    # ── Tier 1: browser cookies — always fresh, user is logged in there ───────
    # Tried first because app session cookies may be stale; browser cookies are
    # updated every time the user visits YouTube and are never expired.
    for browser_opts in _browser_cookie_opts():
        browser = browser_opts["cookiesfrombrowser"][0]
        try:
            info = _ydl_extract_url(video_id, _M4A_FMT, extra_opts=browser_opts, skip_auth=True)
            url = _stream_url_from_info(info)
            if url:
                _logging.info(f"[stream] {video_id} OK via {browser} browser cookies")
                return jsonify({"url": url})
        except Exception as e:
            last_err = e
            if _is_hard_error(str(e)):
                break
            _logging.warning(f"[stream] {video_id} browser={browser}: {e}")

    # ── Tier 2: _STREAM_ATTEMPTS (app cookies + anonymous mobile/web) ────────
    for fmt, extra, no_auth in _STREAM_ATTEMPTS:
        try:
            info = _ydl_extract_url(video_id, fmt, extra_opts=extra, skip_auth=no_auth)
            url = _stream_url_from_info(info)
            if url:
                return jsonify({"url": url})
        except Exception as e:
            last_err = e
            if _is_hard_error(str(e)):
                break
            _logging.warning(f"[stream] {video_id} fmt={fmt} no_auth={no_auth}: {e}")

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

            # Local profile: serve from SQLite
            if is_local_profile(_current_profile):
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
                        pl_title = pl_row[0] if pl_row else playlist_id
                        rows = db.execute(
                            "SELECT video_id, set_video_id, title, artists, album, thumbnail, duration FROM playlist_tracks WHERE playlist_id=? ORDER BY position ASC",
                            (playlist_id,)
                        ).fetchall()
                        tracks = [{"videoId": r[0], "setVideoId": r[1], "title": r[2], "artists": r[3],
                                   "album": r[4], "thumbnail": r[5], "duration": r[6]} for r in rows]
                yield f"data: {json.dumps({'type':'header','title':pl_title,'thumbnail':'','total':len(tracks),'cached':True})}\n\n"
                for i in range(0, len(tracks), CHUNK):
                    yield f"data: {json.dumps({'type':'tracks','tracks':tracks[i:i+CHUNK]})}\n\n"
                yield f"data: {json.dumps({'type':'done'})}\n\n"
                return

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
                pl_title = pl_row[0] if pl_row else playlist_id
                rows = db.execute(
                    "SELECT video_id, set_video_id, title, artists, album, thumbnail, duration FROM playlist_tracks WHERE playlist_id=? ORDER BY position ASC",
                    (playlist_id,)
                ).fetchall()
            tracks = [{"videoId": r[0], "setVideoId": r[1], "title": r[2], "artists": r[3],
                       "album": r[4], "thumbnail": r[5], "duration": r[6]} for r in rows]
            return jsonify({"title": pl_title, "thumbnail": "", "tracks": tracks})

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


@app.route("/lyrics/custom/<video_id>", methods=["GET"])
def get_custom_lyrics(video_id):
    """Gibt manuell importierte Lyrics für eine videoId zurück."""
    for ext in ("lrc", "ttml"):
        path = os.path.join(CUSTOM_LYRICS_DIR, f"{video_id}.{ext}")
        if os.path.isfile(path):
            with open(path, "r", encoding="utf-8") as f:
                content = f.read()
            return jsonify({"content": content, "format": ext})
    return jsonify({"error": "not found"}), 404


@app.route("/lyrics/custom", methods=["POST"])
def save_custom_lyrics():
    """Speichert manuell importierte Lyrics für eine videoId."""
    data = request.get_json()
    video_id = data.get("videoId", "").strip()
    content = data.get("content", "")
    fmt = data.get("format", "lrc").lower()
    if not video_id or not content or fmt not in ("lrc", "ttml"):
        return jsonify({"error": "invalid request"}), 400
    # Eventuelle andere Datei desselben Songs entfernen
    for ext in ("lrc", "ttml"):
        old = os.path.join(CUSTOM_LYRICS_DIR, f"{video_id}.{ext}")
        if os.path.isfile(old):
            os.remove(old)
    path = os.path.join(CUSTOM_LYRICS_DIR, f"{video_id}.{fmt}")
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    return jsonify({"ok": True})


@app.route("/lyrics/custom/<video_id>", methods=["DELETE"])
def delete_custom_lyrics(video_id):
    """Löscht manuell importierte Lyrics für eine videoId."""
    deleted = False
    for ext in ("lrc", "ttml"):
        path = os.path.join(CUSTOM_LYRICS_DIR, f"{video_id}.{ext}")
        if os.path.isfile(path):
            os.remove(path)
            deleted = True
    if deleted:
        return jsonify({"ok": True})
    return jsonify({"error": "not found"}), 404


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
# Canonical v1 default config (kept for migration to the v2 layer document).
_OV_V1_DEFAULT = {
    "preset": "basic",
    "bgColor": "#1a1a1a", "bgOpacity": 90,
    "accentColor": "#EEA8FF", "textColor": "#ffffff",
    "borderRadius": 14,
    "showProgress": True, "showAlbumArt": True,
    "showArtist": True, "showAlbum": False,
    "border": False, "borderColor": "#EEA8FF", "borderWidth": 1.5,
    "fontFamily": "system-ui, sans-serif",
    "titleFontSize": 14, "artistFontSize": 12,
    "dynamicWidth": False, "widgetWidth": 400, "widgetHeight": 0, "artSize": 56, "artRadius": 8,
    "artRadiusTL": 8, "artRadiusTR": 8, "artRadiusBR": 8, "artRadiusBL": 8,
    "artCornerTypeTL": "r", "artCornerTypeTR": "r", "artCornerTypeBR": "r", "artCornerTypeBL": "r",
    "paddingV": 12, "paddingH": 16, "gap": 12,
    "progressHeight": 3,
    "showShadow": False, "shadowStrength": 0.35,
    "bgBlur": 10, "bgBlurEnabled": False,
    "autoHide": False,
    "scrollTitle": False, "scrollSpeed": 80,
    "radiusTL": 14, "radiusTR": 14, "radiusBR": 14, "radiusBL": 14,
    "cornerTypeTL": "r", "cornerTypeTR": "r", "cornerTypeBR": "r", "cornerTypeBL": "r",
    "borderBlur": 0,
}

# ── Overlay v2 document schema / migration (mirror of src/overlay/schema.js) ──
_OVERLAY_DOC_VERSION = 2

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
_OVERLAY_HTML = r"""<!DOCTYPE html>
<html><head><meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;700&family=Inter:wght@400;700&family=Roboto:wght@400;700&family=Nunito:wght@400;700&family=Exo+2:wght@400;700&family=Poppins:wght@400;700&family=Raleway:wght@400;700&family=Montserrat:wght@400;700&family=DM+Sans:opsz,wght@9..40,400;9..40,700&family=Ubuntu:wght@400;700&family=Lexend:wght@400;700&family=Space+Grotesk:wght@400;700&family=Sora:wght@400;700&family=Barlow:wght@400;700&family=Figtree:wght@400;700&family=Plus+Jakarta+Sans:wght@400;700&family=Kanit:wght@400;700&family=Oxanium:wght@400;700&family=Chakra+Petch:wght@400;700&display=swap" rel="stylesheet">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{background:transparent;overflow:hidden}
body{display:flex;align-items:center;justify-content:center;min-height:100vh;min-width:100vw}
#stage{position:relative;flex-shrink:0;transition:filter .3s,opacity .4s}
#border,#bg,#blur,#layers,#layers-free{position:absolute;inset:0}
#border,#bg,#blur{pointer-events:none}
#bg{transition:background .3s}
#blur{background-size:cover;background-position:center;opacity:0;transition:opacity .3s}
.layer{position:absolute}
.layer-anim{position:absolute;inset:0}
@keyframes ovl-fade{from{opacity:0}to{opacity:1}}
@keyframes ovl-slideUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}
@keyframes ovl-slideDown{from{opacity:0;transform:translateY(-16px)}to{opacity:1;transform:translateY(0)}}
@keyframes ovl-slideLeft{from{opacity:0;transform:translateX(16px)}to{opacity:1;transform:translateX(0)}}
@keyframes ovl-slideRight{from{opacity:0;transform:translateX(-16px)}to{opacity:1;transform:translateX(0)}}
@keyframes ovl-zoom{from{opacity:0;transform:scale(.85)}to{opacity:1;transform:scale(1)}}
@keyframes ovl-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}
@keyframes ovl-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
@keyframes ovl-spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}
.layer-img{width:100%;height:100%;display:block}
.layer-ph{width:100%;height:100%;display:flex;align-items:center;justify-content:center}
.txt{display:flex;width:100%;height:100%;overflow:hidden}
.txt-inner{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.txt-inner.scroll{text-overflow:clip}
.txt-inner.scroll span{display:inline-block}
.prog-track,.prog-fill{position:absolute;top:0;height:100%}
.prog-track{left:0;right:0}
.prog-fill{left:0;width:0;transition:width .8s linear}
</style></head>
<body>
<div id="stage"><div id="border"></div><div id="bg"></div><div id="blur"></div><div id="layers"></div><div id="layers-free"></div></div>
<script>
const API=location.origin;
const EDITOR=new URLSearchParams(location.search).get('editor')==='1'; // suppress entrance anims in the editor preview
let doc=null;
const state={title:"",artist:"",album:"",cover:"",progress:0,duration:0,isPlaying:false};
const layerEls={}; // id -> record

// Preview background via ?bg= (light | checkered | dark)
(()=>{const p=new URLSearchParams(location.search).get('bg');if(p)document.body.style.background=p==='light'?'#efefef':p==='checkered'?'repeating-conic-gradient(#aaa 0% 25%,#ddd 0% 50%) 0 0/20px 20px':'#111';})();

function rgba(c,a){
  if(typeof c!=='string')return c;
  if(c[0]!=='#')return c;            // already rgba()/named — pass through
  const r=parseInt(c.slice(1,3),16),g=parseInt(c.slice(3,5),16),b=parseInt(c.slice(5,7),16);
  return a==null?`rgb(${r},${g},${b})`:`rgba(${r},${g},${b},${a})`;
}

// SVG path data for a rounded/beveled rectangle (per-corner). ox/oy offset.
function cornerPath(W,H,c,ox,oy){ox=ox||0;oy=oy||0;c=c||{};
  const tl={t:c.typeTL||'r',s:c.TL||0},tr={t:c.typeTR||'r',s:c.TR||0},
        br={t:c.typeBR||'r',s:c.BR||0},bl={t:c.typeBL||'r',s:c.BL||0};
  let d=`M ${ox+tl.s} ${oy} `;
  if(tr.t==='r')d+=`L ${ox+W-tr.s} ${oy} Q ${ox+W} ${oy} ${ox+W} ${oy+tr.s} `;else d+=`L ${ox+W-tr.s} ${oy} L ${ox+W} ${oy+tr.s} `;
  if(br.t==='r')d+=`L ${ox+W} ${oy+H-br.s} Q ${ox+W} ${oy+H} ${ox+W-br.s} ${oy+H} `;else d+=`L ${ox+W} ${oy+H-br.s} L ${ox+W-br.s} ${oy+H} `;
  if(bl.t==='r')d+=`L ${ox+bl.s} ${oy+H} Q ${ox} ${oy+H} ${ox} ${oy+H-bl.s} `;else d+=`L ${ox+bl.s} ${oy+H} L ${ox} ${oy+H-bl.s} `;
  if(tl.t==='r')d+=`L ${ox} ${oy+tl.s} Q ${ox} ${oy} ${ox+tl.s} ${oy} Z`;else d+=`L ${ox} ${oy+tl.s} L ${ox+tl.s} ${oy} Z`;
  return d.trim();
}

function applyCanvas(cv){
  cv=cv||{};
  const W=cv.width||400,H=cv.height||80;
  const stage=document.getElementById('stage'),border=document.getElementById('border'),
        bg=document.getElementById('bg'),blur=document.getElementById('blur'),layers=document.getElementById('layers');
  stage.style.width=W+'px';stage.style.height=H+'px';
  // Shadow + border glow render on #stage (no clip-path here so they spill outside the shape)
  const sh=cv.shadow&&cv.shadow.on?`drop-shadow(0 8px 32px rgba(0,0,0,${cv.shadow.strength==null?0.35:cv.shadow.strength}))`:'';
  const bd=cv.border||{};
  const glow=bd.on&&(bd.glow||0)>0?`drop-shadow(0 0 ${(bd.glow||0)*1.5}px ${bd.color||'#EEA8FF'})`:'';
  stage.style.filter=[sh,glow].filter(Boolean).join(' ')||'none';
  const bw=bd.on?(bd.width||1.5):0;
  const corners=cv.corners||{TL:14,TR:14,BR:14,BL:14,typeTL:'r',typeTR:'r',typeBR:'r',typeBL:'r'};
  const outer=cornerPath(W,H,corners,0,0);
  if(bw>0){
    const bi=2-Math.sqrt(2);
    const shrink=(t,r)=>Math.max(0,r-bw*(t==='b'?bi:1));
    const inner={TL:shrink(corners.typeTL,corners.TL),TR:shrink(corners.typeTR,corners.TR),
                 BR:shrink(corners.typeBR,corners.BR),BL:shrink(corners.typeBL,corners.BL),
                 typeTL:corners.typeTL,typeTR:corners.typeTR,typeBR:corners.typeBR,typeBL:corners.typeBL};
    const IW=Math.max(1,W-2*bw),IH=Math.max(1,H-2*bw);
    const innerAt=cornerPath(IW,IH,inner,bw,bw);
    border.style.display='';border.style.background=bd.color||'#EEA8FF';
    border.style.clipPath=`path(evenodd,'${outer} ${innerAt}')`;
    const clip=`path('${innerAt}')`;bg.style.clipPath=clip;blur.style.clipPath=clip;layers.style.clipPath=clip;
  }else{
    border.style.display='none';
    const clip=`path('${outer}')`;bg.style.clipPath=clip;blur.style.clipPath=clip;layers.style.clipPath=clip;
  }
  const b=cv.bg||{};
  bg.style.background=rgba(b.color||'#1a1a1a',(b.opacity==null?90:b.opacity)/100);
  if(b.blurFromCover&&(b.blur||0)>0){
    blur.style.filter=`blur(${b.blur}px)`;blur.style.opacity=state.cover?'1':'0';
    if(state.cover)blur.style.backgroundImage=`url(${state.cover})`;
  }else{blur.style.opacity='0';blur.style.filter='none';}
}

function buildAlbumArt(el,L,rec){
  const s=L.style||{};
  const ph=document.createElement('div');ph.className='layer-ph';ph.style.background=s.placeholderBg||'rgba(255,255,255,.12)';
  ph.innerHTML='<svg width="38%" height="38%" viewBox="0 0 24 24" fill="rgba(255,255,255,.4)"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>';
  const img=document.createElement('img');img.className='layer-img';img.style.display='none';img.style.objectFit=s.fit||'cover';
  const cp=`path('${cornerPath(L.w||0,L.h||0,s.corners,0,0)}')`;ph.style.clipPath=cp;img.style.clipPath=cp;
  el.appendChild(ph);el.appendChild(img);rec.img=img;rec.ph=ph;
}

function buildText(el,L,rec){
  const s=L.style||{};
  const box=document.createElement('div');box.className='txt';
  box.style.alignItems=s.valign==='middle'?'center':s.valign==='bottom'?'flex-end':'flex-start';
  box.style.justifyContent=s.align==='center'?'center':s.align==='right'?'flex-end':'flex-start';
  const inner=document.createElement('div');inner.className='txt-inner';
  inner.style.fontFamily=s.fontFamily||'system-ui,sans-serif';
  inner.style.fontSize=(s.fontSize||14)+'px';
  inner.style.fontWeight=s.fontWeight||400;
  inner.style.color=topFillColor(s,s.color||'#fff');
  inner.style.textAlign=s.align||'left';
  inner.style.letterSpacing=(s.letterSpacing||0)+'px';
  inner.style.lineHeight=s.lineHeight||1.3;
  if((s.maxLines||1)>1){inner.style.whiteSpace='normal';inner.style.display='-webkit-box';inner.style.webkitBoxOrient='vertical';inner.style.webkitLineClamp=s.maxLines;}
  const span=document.createElement('span');inner.appendChild(span);box.appendChild(inner);el.appendChild(box);
  rec.span=span;rec.inner=inner;
}

function buildProgress(el,L,rec){
  const s=L.style||{};
  el.style.clipPath=`path('${cornerPath(L.w||0,L.h||0,s.corners,0,0)}')`;
  const track=document.createElement('div');track.className='prog-track';track.style.background=s.trackColor||'rgba(255,255,255,.12)';
  const fill=document.createElement('div');fill.className='prog-fill';fill.style.background=rgba(s.fillColor||'#EEA8FF',(s.fillOpacity==null?100:s.fillOpacity)/100);
  el.appendChild(track);el.appendChild(fill);rec.fill=fill;
}

function buildImage(el,L,rec){
  const s=L.style||{};
  el.style.clipPath=`path('${cornerPath(L.w||0,L.h||0,s.corners,0,0)}')`;
  if(s.src){const img=document.createElement('img');img.className='layer-img';img.src=s.src;img.style.objectFit=s.fit||'contain';el.appendChild(img);}
}

function shapePoints(shp,W,H,s){
  const cx=W/2,cy=H/2,rx=W/2,ry=H/2;
  if(shp==='triangle'){return `${cx},0 ${W},${H} 0,${H}`;}
  if(shp==='polygon'){
    const n=Math.max(3,Math.min(12,s.sides||6)),p=[];
    for(let i=0;i<n;i++){const a=-Math.PI/2+i*2*Math.PI/n;p.push(`${(cx+rx*Math.cos(a)).toFixed(2)},${(cy+ry*Math.sin(a)).toFixed(2)}`);}
    return p.join(' ');
  }
  if(shp==='star'){
    const n=Math.max(3,Math.min(12,s.points||5)),ir=(s.innerRatio==null?0.5:s.innerRatio),p=[];
    for(let i=0;i<n*2;i++){const r=i%2===0?1:ir,a=-Math.PI/2+i*Math.PI/n;p.push(`${(cx+rx*r*Math.cos(a)).toFixed(2)},${(cy+ry*r*Math.sin(a)).toFixed(2)}`);}
    return p.join(' ');
  }
  return `0,0 ${W},0 ${W},${H} 0,${H}`;
}
// Visible fills (new `style.fills` array, or migrated from legacy single fill).
function visFills(s){
  var fl=(s&&s.fills&&s.fills.length)?s.fills:(s&&s.fill!=null?[{color:s.fill,opacity:(s.fillOpacity==null?100:s.fillOpacity)}]:[]);
  return fl.filter(function(f){return f&&f.visible!==false;});
}
// Stacked solid fills as a background-image list (index 0 = front).
function fillStack(s){
  var v=visFills(s);if(!v.length)return '';
  return v.map(function(f){var c=rgba(f.color||'#000',(f.opacity==null?100:f.opacity)/100);return 'linear-gradient('+c+','+c+')';}).join(',');
}
// Top visible fill as a single rgba color (for text + SVG shapes).
function topFillColor(s,fallback){
  var v=visFills(s);if(!v.length)return fallback;
  var f=v[0];return rgba(f.color||fallback||'#fff',(f.opacity==null?100:f.opacity)/100);
}
// Visible stroke paints (new `style.strokes`, or migrated from legacy `border`).
function visStrokes(s){
  var st=(s&&s.strokes&&s.strokes.length)?s.strokes:(s&&s.border&&s.border.on?[{color:s.border.color,opacity:s.border.opacity}]:[]);
  return st.filter(function(x){return x&&x.visible!==false;});
}
// Stacked strokes as a box-shadow list, using the shared weight + position.
function strokeBox(s){
  var v=visStrokes(s);if(!v.length)return '';
  var w=(s.strokeWeight!=null?s.strokeWeight:(s.border&&s.border.width!=null?s.border.width:1.5));
  var p=s.strokePosition||(s.border&&s.border.position)||'inside';
  return v.map(function(pt){return strokeShadow({color:pt.color,opacity:pt.opacity,width:w,position:p});}).join(',');
}
// Bevel/mixed-corner rects use clip-path, which swallows box-shadow — so render their
// strokes as donut overlays (outer path minus inner shrunk path) that follow the bevel.
function donutStrokes(el,s,W,H){
  var v=visStrokes(s);if(!v.length)return;
  var w=(s.strokeWeight!=null?s.strokeWeight:1.5);
  var corners=s.corners||{};
  var outer=cornerPath(W,H,corners,0,0);
  var bi=2-Math.sqrt(2);
  var shrink=function(t,r){return Math.max(0,(r||0)-w*(t==='b'?bi:1));};
  var inner={TL:shrink(corners.typeTL,corners.TL),TR:shrink(corners.typeTR,corners.TR),
             BR:shrink(corners.typeBR,corners.BR),BL:shrink(corners.typeBL,corners.BL),
             typeTL:corners.typeTL,typeTR:corners.typeTR,typeBR:corners.typeBR,typeBL:corners.typeBL};
  var IW=Math.max(1,W-2*w),IH=Math.max(1,H-2*w);
  var innerAt=cornerPath(IW,IH,inner,w,w);
  v.forEach(function(pt){
    var d=document.createElement('div');
    d.style.position='absolute';d.style.left='0';d.style.top='0';d.style.width=W+'px';d.style.height=H+'px';
    d.style.pointerEvents='none';
    d.style.background=rgba(pt.color||'#fff',(pt.opacity==null?100:pt.opacity)/100);
    d.style.clipPath="path(evenodd,'"+outer+" "+innerAt+"')";
    el.appendChild(d);
  });
}
function strokeShadow(bd){
  var w=bd.width||1.5,c=rgba(bd.color||'#fff',(bd.opacity==null?100:bd.opacity)/100),p=bd.position||'inside';
  if(p==='outside')return '0 0 0 '+w+'px '+c;
  if(p==='center')return 'inset 0 0 0 '+(w/2)+'px '+c+', 0 0 0 '+(w/2)+'px '+c;
  return 'inset 0 0 0 '+w+'px '+c;
}
function buildShape(el,L,rec){
  const s=L.style||{},bd=s.border||{},shp=s.shape||'rect',W=L.w||0,H=L.h||0;
  const fa=(s.fillOpacity==null?100:s.fillOpacity)/100;
  if(shp==='rect'){
    // Use border-radius for all-round corners so box-shadow strokes render (clip-path
    // swallows box-shadow). Fall back to clip-path only for bevel/mixed corners.
    var c=s.corners||{};
    var allRound=(c.typeTL||'r')==='r'&&(c.typeTR||'r')==='r'&&(c.typeBR||'r')==='r'&&(c.typeBL||'r')==='r';
    var st=fillStack(s);
    if(allRound){
      el.style.clipPath='';
      el.style.borderRadius=(c.TL||0)+'px '+(c.TR||0)+'px '+(c.BR||0)+'px '+(c.BL||0)+'px';
      if(st){el.style.backgroundImage=st;el.style.backgroundColor='';}else{el.style.background='transparent';}
      el.style.boxShadow=strokeBox(s);
    }else{
      el.style.borderRadius='';el.style.boxShadow='';
      el.style.clipPath=`path('${cornerPath(W,H,s.corners,0,0)}')`;
      if(st){el.style.backgroundImage=st;el.style.backgroundColor='';}else{el.style.background='transparent';}
      donutStrokes(el,s,W,H);
    }
    return;
  }
  if(shp==='ellipse'||shp==='circle'||shp==='oval'){
    el.style.borderRadius='50%';
    var st2=fillStack(s);if(st2){el.style.backgroundImage=st2;el.style.backgroundColor='';}else{el.style.background='transparent';}
    el.style.boxShadow=strokeBox(s);
    return;
  }
  // SVG shapes: triangle / polygon / star / line
  const NS='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(NS,'svg');
  svg.setAttribute('viewBox',`0 0 ${W} ${H}`);svg.setAttribute('preserveAspectRatio','none');
  svg.setAttribute('width','100%');svg.setAttribute('height','100%');
  svg.style.display='block';svg.style.overflow='visible';
  if(shp==='line'){
    const ln=document.createElementNS(NS,'line');
    ln.setAttribute('x1',0);ln.setAttribute('y1',H/2);ln.setAttribute('x2',W);ln.setAttribute('y2',H/2);
    ln.setAttribute('stroke',topFillColor(s,rgba(s.fill||'#EEA8FF',fa)));
    ln.setAttribute('stroke-width',s.strokeWidth||Math.max(2,H));
    ln.setAttribute('stroke-linecap',s.lineCap||'round');
    svg.appendChild(ln);
  }else{
    const pg=document.createElementNS(NS,'polygon');
    pg.setAttribute('points',shapePoints(shp,W,H,s));
    pg.setAttribute('fill',topFillColor(s,rgba(s.fill||'#EEA8FF',fa)));
    var ts=visStrokes(s)[0];
    if(ts){pg.setAttribute('stroke',ts.color||'#fff');pg.setAttribute('stroke-width',(s.strokeWeight!=null?s.strokeWeight:(bd.width||1.5)));pg.setAttribute('stroke-opacity',(ts.opacity==null?100:ts.opacity)/100);pg.setAttribute('stroke-linejoin','round');}
    svg.appendChild(pg);
  }
  el.appendChild(svg);
}

const BUILDERS={albumArt:buildAlbumArt,text:buildText,progress:buildProgress,image:buildImage,shape:buildShape};

function applyFx(el,entr,loopw,L){
  const st=(L.style||{});
  const fx=st.fx||{};
  const f=[];
  const eff=Array.isArray(st.effects)?st.effects:null;
  if(eff){
    eff.forEach(function(e){
      if(!e||e.visible===false)return;
      if(e.type==='shadow')f.push('drop-shadow('+(e.x||0)+'px '+(e.y==null?2:e.y)+'px '+(e.blur==null?8:e.blur)+'px '+rgba(e.color||'#000000',(e.opacity==null?50:e.opacity)/100)+')');
      else if(e.type==='glow')f.push('drop-shadow(0 0 '+(e.blur==null?10:e.blur)+'px '+(e.color||'#ffffff')+')');
      else if(e.type==='blur')f.push('blur('+(e.amount==null?4:e.amount)+'px)');
    });
  }else{
    if(fx.shadow&&fx.shadow.on)f.push(`drop-shadow(${fx.shadow.x||0}px ${fx.shadow.y==null?2:fx.shadow.y}px ${fx.shadow.blur==null?8:fx.shadow.blur}px ${rgba(fx.shadow.color||'#000000',fx.shadow.opacity==null?0.5:fx.shadow.opacity)})`);
    if(fx.glow&&fx.glow.on)f.push(`drop-shadow(0 0 ${fx.glow.blur==null?10:fx.glow.blur}px ${fx.glow.color||'#ffffff'})`);
    if(fx.blur&&fx.blur.on)f.push(`blur(${fx.blur.amount==null?4:fx.blur.amount}px)`);
  }
  el.style.filter=f.join(' ')||'';
  const en=fx.entrance;
  if(en&&en.type&&en.type!=='none'&&!EDITOR)entr.style.animation=`ovl-${en.type} ${en.duration||0.5}s cubic-bezier(.22,1,.36,1) both`;
  else entr.style.animation='';
  const lp=fx.loop;
  if(lp&&lp.type&&lp.type!=='none'){const dur=lp.speed||(lp.type==='spin'?4:2);loopw.style.animation=`ovl-${lp.type} ${dur}s ${lp.type==='spin'?'linear':'ease-in-out'} infinite`;}
  else loopw.style.animation='';
}
function buildLayers(dc){
  const layers=document.getElementById('layers');layers.innerHTML='';
  const free=document.getElementById('layers-free');free.innerHTML='';
  for(const k in layerEls)delete layerEls[k];
  const sorted=(dc.layers||[]).slice().sort((a,b)=>(a.z||0)-(b.z||0));
  for(const L of sorted){
    const el=document.createElement('div');el.className='layer';
    el.style.left=(L.x||0)+'px';el.style.top=(L.y||0)+'px';
    el.style.width=(L.w||0)+'px';el.style.height=(L.h||0)+'px';
    el.style.zIndex=L.z||0;
    el.style.opacity=(L.opacity==null?100:L.opacity)/100;
    var tf='';
    if(L.rotation)tf+='rotate('+L.rotation+'deg) ';
    if(L.flipH||L.flipV)tf+='scale('+(L.flipH?-1:1)+','+(L.flipV?-1:1)+')';
    el.style.transform=tf.trim();
    el.style.mixBlendMode=(L.blend&&L.blend!=='normal')?L.blend:'';
    el.style.display=L.visible===false?'none':'';
    const entr=document.createElement('div');entr.className='layer-anim';
    const loopw=document.createElement('div');loopw.className='layer-anim';
    entr.appendChild(loopw);el.appendChild(entr);
    const rec={root:el,type:L.type,bind:L.bind,layer:L};
    (BUILDERS[L.type]||(()=>{}))(loopw,L,rec);
    applyFx(el,entr,loopw,L);
    (L.clip===false?free:layers).appendChild(el);layerEls[L.id]=rec;
  }
}

function textForBind(bind,style){
  style=style||{};
  if(bind==='title')return state.title||'No Music';
  if(bind==='artist')return state.artist||'';
  if(bind==='album')return state.album||'';
  if(bind==='position')return fmtTime(state.progress);
  if(bind==='duration')return fmtTime(state.duration);
  if(bind==='static')return style.content||'';
  if(bind==='subtitle'){
    const ps=style.parts||['artist'],parts=[];
    if(ps.indexOf('artist')>=0&&state.artist)parts.push(state.artist);
    if(ps.indexOf('album')>=0&&state.album)parts.push(state.album);
    return parts.join(' · ')||'Waiting...';
  }
  return style.content||'';
}
function fmtTime(s){if(!s||s<0||!isFinite(s))return'0:00';const m=Math.floor(s/60),x=Math.floor(s%60);return m+':'+String(x).padStart(2,'0');}

function applyMarquee(rec){
  const span=rec.span,inner=rec.inner,L=rec.layer,s=L.style||{};
  if(!s.marquee){span.classList.remove('scroll');if(rec.inner)rec.inner.classList.remove('scroll');span.style.animation='';return;}
  if(inner.classList.contains('scroll'))return;
  const overflow=inner.scrollWidth-inner.clientWidth;
  if(overflow>4){
    const speed=s.marqueeSpeed||80,scrollSec=Math.max(0.5,overflow/speed);
    const pauseStart=1,pauseEnd=5,total=pauseStart+scrollSec+pauseEnd;
    const p1=Math.round(pauseStart/total*1000)/10,p2=Math.round((pauseStart+scrollSec)/total*1000)/10;
    const name='kf_'+L.id.replace(/[^a-z0-9_]/gi,'');
    let kf=document.getElementById(name);
    if(!kf){kf=document.createElement('style');kf.id=name;document.head.appendChild(kf);}
    kf.textContent=`@keyframes ${name}{0%,${p1}%{transform:translateX(0)}${p2}%,100%{transform:translateX(${-overflow}px)}}`;
    inner.classList.add('scroll');
    span.style.animation=`${name} ${total.toFixed(1)}s ease-in-out infinite`;
  }
}

function applyAutoHide(){
  const stage=document.getElementById('stage');
  if(doc&&doc.canvas&&doc.canvas.autoHide)stage.style.opacity=(state.isPlaying&&state.title)?'1':'0';
  else stage.style.opacity='1';
}

function renderData(){
  for(const id in layerEls){
    const rec=layerEls[id];
    if(rec.type==='albumArt'){
      const hqMode=(rec.layer.style||{}).quality==='high';
      const coverSrc=state.cover?(hqMode?state.cover+'&hq=1':state.cover):'';
      if(coverSrc){rec.img.src=coverSrc;rec.img.style.display='';rec.ph.style.display='none';}
      else{rec.img.style.display='none';rec.ph.style.display='';}
    }else if(rec.type==='text'){
      const txt=textForBind(rec.bind,rec.layer.style);
      if(rec.span.textContent!==txt){
        rec.span.style.animation='';rec.inner.classList.remove('scroll');
        rec.span.textContent=txt;
        if(rec.layer.style&&rec.layer.style.marquee)requestAnimationFrame(()=>requestAnimationFrame(()=>applyMarquee(rec)));
      }
    }else if(rec.type==='progress'){
      const pct=state.duration>0?(state.progress/state.duration*100):0;
      rec.fill.style.width=Math.max(0,Math.min(100,pct))+'%';
    }
  }
  applyAutoHide();
}

function applyDoc(dc){
  if(!dc||!dc.canvas)return;
  doc=dc;applyCanvas(dc.canvas);buildLayers(dc);renderData();
  setTimeout(()=>{for(const id in layerEls){const rec=layerEls[id];if(rec.type==='text')applyMarquee(rec);}},60);
}

function updateState(s){
  if(s._configUpdate){applyDoc(s.config);return;}
  if(s._config)applyDoc(s._config);
  ['title','artist','album','cover','progress','duration','isPlaying'].forEach(f=>{if(f in s)state[f]=s[f];});
  if(doc&&doc.canvas&&doc.canvas.bg&&doc.canvas.bg.blurFromCover&&(doc.canvas.bg.blur||0)>0){
    const blur=document.getElementById('blur');
    blur.style.backgroundImage=state.cover?`url(${state.cover})`:'none';
    blur.style.opacity=state.cover?'1':'0';
  }
  renderData();
}

// Editor live-preview channel: the editor postMessages the in-progress doc
// during drag so the preview updates without flooding the backend with POSTs.
window.addEventListener('message',function(e){if(e.data&&e.data.__overlayDoc)applyDoc(e.data.__overlayDoc);});

function connect(){
  const es=new EventSource(API+'/overlay/stream');
  es.onmessage=e=>{try{updateState(JSON.parse(e.data));}catch(_){}};
  es.onerror=()=>{es.close();setTimeout(connect,3000);};
}
fetch(API+'/overlay/config').then(r=>r.json()).then(c=>{applyDoc(c);connect();}).catch(()=>connect());
</script></body></html>"""

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
