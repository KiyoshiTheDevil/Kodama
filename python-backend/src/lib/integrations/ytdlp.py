"""yt-dlp update activation and Node.js discovery helpers."""

import json
import logging
import os
import shutil
import sys
import time

from src.config import config_dirs


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
