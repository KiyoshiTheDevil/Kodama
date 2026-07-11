"""yt-dlp update activation and Node.js discovery helpers."""

import glob
import json
import logging
import os
import shutil
import sys
import time

import requests

from src.config import config_dirs


# Old server.py: _is_hard_error
def is_hard_error(err_str):
    # Only Music Premium is a guaranteed dead end regardless of client.
    # "Video unavailable" can still succeed with web_music/android_music
    # for YouTube Music exclusive content.
    return "Music Premium" in err_str


# Old server.py: _is_unavailable
def is_unavailable(err_str):
    return any(k in err_str for k in ("Video unavailable", "This video is not available"))


class YTDLP:
    """Prepares yt-dlp's update path and bundled Node.js runtime."""

    def __init__(self, profiles=None, music_state=None, logger=None):
        self._profiles = profiles
        self._music_state = music_state
        self._logger = logger or logging.getLogger(__name__)
        # Old server.py: _ydl_cookie_last_refresh
        self.last_cookie_refresh = 0.0

    @staticmethod
    # Old server.py: _ensure_node_in_path
    def ensure_node_in_path() -> None:
        """Add a bundled Node.js executable directory to ``PATH`` when needed."""
        if shutil.which("node"):
            return

        executable_dir = os.path.dirname(os.path.abspath(sys.executable))
        candidates = [executable_dir]
        parent_dir = os.path.dirname(executable_dir)
        if parent_dir and parent_dir != executable_dir:
            candidates.append(parent_dir)

        node_name = "node.exe" if sys.platform == "win32" else "node"
        if sys.platform == "darwin":
            candidates.extend(
                [
                    os.path.join(parent_dir, "Resources"),
                    os.path.join(executable_dir, "..", "Resources"),
                ]
            )

        for directory in candidates:
            bundled_node = os.path.join(directory, node_name)
            if os.path.isfile(bundled_node):
                os.environ["PATH"] = directory + os.pathsep + os.environ.get("PATH", "")
                print(f"[ydl] added bundled {node_name} to PATH: {bundled_node}", flush=True)
                return

        print(f"[ydl] {node_name} not found - nsig decryption may fail for some tracks", flush=True)

    @staticmethod
    def activate_ytdlp_update() -> None:
        """Prefer the newest downloaded yt-dlp wheel over the bundled version."""
        try:
            wheels = sorted(config_dirs.YTDLP_UPDATE_DIR.glob("yt_dlp-*.whl"))
            if wheels and str(wheels[-1]) not in sys.path:
                sys.path.insert(0, str(wheels[-1]))
        except OSError:
            pass

    # Old server.py: _get_ydl_cookiefile
    def create_authenticated_cookie_file(self):
        """Write active profile/session cookies in yt-dlp's Netscape format."""
        if self._profiles is None or self._music_state is None:
            raise RuntimeError("YTDLP requires profile storage and active music-session state.")
        profile_name = self._music_state.current_profile
        if not profile_name or self._profiles.is_local(profile_name):
            return None
        try:
            cookie_file = os.path.join(self._profiles.directory, f"{profile_name}_ydl_cookies.txt")
            with open(self._profiles.profile_file_path(profile_name), encoding="utf-8") as profile_file:
                headers = json.load(profile_file)
            cookie_values = {}
            for part in headers.get("cookie", "").split(";"):
                name, separator, value = part.strip().partition("=")
                if separator and name:
                    cookie_values[name.strip()] = value.strip()

            session = getattr(self._music_state.ytm, "_session", None)
            if session is not None:
                for cookie in session.cookies:
                    if "youtube" in (cookie.domain or "") or not cookie.domain:
                        cookie_values[cookie.name] = cookie.value

            now = time.time()
            if session is not None and (now - self.last_cookie_refresh) > 55:
                try:
                    session.get(
                        "https://www.youtube.com/",
                        timeout=6,
                        headers={
                            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                            "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                            "Accept-Language": "en-US,en;q=0.9",
                        },
                        allow_redirects=True,
                    )
                    for cookie in session.cookies:
                        if "youtube" in (cookie.domain or "") or not cookie.domain:
                            cookie_values[cookie.name] = cookie.value
                    self.last_cookie_refresh = now
                    self._logger.debug("[cookies] youtube.com ping refreshed session cookies")
                except Exception as error:
                    self._logger.debug(f"[cookies] youtube.com ping failed (non-fatal): {error}")

            if not cookie_values:
                return None
            lines = ["# Netscape HTTP Cookie File\n"]
            for name, value in cookie_values.items():
                secure = "TRUE" if name.startswith(("__Secure-", "__Host-")) else "FALSE"
                lines.append(f".youtube.com\tTRUE\t/\t{secure}\t2147483647\t{name}\t{value}\n")
            with open(cookie_file, "w", encoding="utf-8", newline="\n") as cookie_output:
                cookie_output.writelines(lines)
            return cookie_file
        except Exception:
            return None

    # Old server.py: _apply_ydl_auth
    def apply_active_session_auth(self, ydl_options):
        """Attach the active-session cookie file to yt-dlp options."""
        cookie_file = self.create_authenticated_cookie_file()
        if cookie_file:
            ydl_options["cookiefile"] = cookie_file
        return ydl_options

    @staticmethod
    # Old server.py: _active_ytdlp_version
    def active_version():
        try:
            import yt_dlp
            return getattr(yt_dlp.version, "__version__", None) or getattr(yt_dlp, "__version__", None)
        except Exception:
            return None

    @staticmethod
    # Old server.py: _cmp_ytdlp
    def compare_versions(a, b):
        """Compare yt-dlp date versions (e.g. 2025.06.24). Returns 1 / 0 / -1."""
        def parse(v):
            return [int(p) if p.isdigit() else 0 for p in str(v).replace("-", ".").split(".")]
        pa, pb = parse(a), parse(b)
        n = max(len(pa), len(pb))
        pa += [0] * (n - len(pa))
        pb += [0] * (n - len(pb))
        return (pa > pb) - (pa < pb)

    # Old server.py: ytdlp_check_update
    def check_update(self):
        installed = self.active_version()
        latest = None
        try:
            latest = requests.get("https://pypi.org/pypi/yt-dlp/json", timeout=10).json()["info"]["version"]
        except Exception:
            pass
        update = bool(installed and latest and self.compare_versions(latest, installed) > 0)
        return {"installed": installed, "latest": latest, "updateAvailable": update}

    # Old server.py: ytdlp_update
    def update(self):
        """Download the latest yt-dlp wheel from PyPI, activate it on sys.path and reload, so the
        new version takes effect without an app restart (yt_dlp is imported lazily). Returns
        ``(payload, status_code)``."""
        try:
            data = requests.get("https://pypi.org/pypi/yt-dlp/json", timeout=15).json()
            wheel_url = wheel_name = None
            for entry in data.get("urls", []):
                if entry.get("packagetype") == "bdist_wheel" and entry.get("filename", "").endswith(".whl"):
                    wheel_url, wheel_name = entry["url"], entry["filename"]
                    break
            if not wheel_url:
                return {"ok": False, "error": "no wheel on PyPI"}, 502
            dest = os.path.join(config_dirs.YTDLP_UPDATE_DIR, wheel_name)
            tmp = dest + ".part"
            with requests.get(wheel_url, stream=True, timeout=120) as wheel_response:
                wheel_response.raise_for_status()
                with open(tmp, "wb") as f:
                    for chunk in wheel_response.iter_content(65536):
                        if chunk:
                            f.write(chunk)
            os.replace(tmp, dest)
            # Keep only the freshest wheel.
            for old in glob.glob(os.path.join(config_dirs.YTDLP_UPDATE_DIR, "yt_dlp-*.whl")):
                if old != dest:
                    try:
                        os.remove(old)
                    except OSError:
                        pass
            # Activate: prepend + drop cached module so the next lazy `import yt_dlp` picks it up.
            if dest not in sys.path:
                sys.path.insert(0, dest)
            for module_name in [m for m in sys.modules if m == "yt_dlp" or m.startswith("yt_dlp.")]:
                del sys.modules[module_name]
            return {"ok": True, "version": self.active_version()}, 200
        except Exception as e:
            return {"ok": False, "error": str(e)}, 502
