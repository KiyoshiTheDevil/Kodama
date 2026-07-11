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
