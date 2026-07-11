"""FFmpeg discovery, version checks, and Windows auto-download."""

import json
import os
import sys
import time

import requests

from src.config import PROJECT_ROOT


class FFmpeg:
    """Locates an ffmpeg binary and, on Windows, can fetch one from gyan.dev."""

    def __init__(self):
        # Old server.py: _FFMPEG_LATEST
        self._latest = {"ts": 0.0, "ver": None}

    # Old server.py: _find_ffmpeg
    def find(self):
        """Return the directory holding ffmpeg, ``None`` if it is on PATH, or
        ``False`` if it cannot be found."""
        bin_name = "ffmpeg.exe" if sys.platform == "win32" else "ffmpeg"
        candidates = []
        if getattr(sys, "frozen", False):
            # Next to the server executable (primary install-dir location)
            candidates.append(os.path.join(os.path.dirname(sys.executable), bin_name))
            # PyInstaller _MEIPASS temp dir (in case user bundled ffmpeg inside)
            meipass = getattr(sys, "_MEIPASS", None)
            if meipass:
                candidates.append(os.path.join(meipass, bin_name))
                # One level up from _MEIPASS (install dir)
                candidates.append(os.path.join(os.path.dirname(meipass), bin_name))
        else:
            candidates.append(os.path.join(str(PROJECT_ROOT), bin_name))

        # macOS: also probe the app bundle's Resources and the common Homebrew
        # locations (most Mac users get ffmpeg via `brew install ffmpeg`).
        if sys.platform == "darwin":
            if getattr(sys, "frozen", False):
                candidates.append(os.path.join(os.path.dirname(sys.executable), "..", "Resources", bin_name))
            candidates.append("/opt/homebrew/bin/ffmpeg")   # Apple Silicon brew
            candidates.append("/usr/local/bin/ffmpeg")       # Intel brew

        for bundled in candidates:
            if os.path.exists(bundled):
                return os.path.dirname(bundled)

        # Check PATH
        import shutil
        if shutil.which("ffmpeg"):
            return None  # yt-dlp will find it in PATH
        return False  # not found

    # Old server.py: _ffmpeg_exe_path
    def exe_path(self):
        """Absolute path (or bare 'ffmpeg' for PATH) to the binary, or None if unavailable."""
        directory = self.find()
        if directory is False:
            return None
        bin_name = "ffmpeg.exe" if sys.platform == "win32" else "ffmpeg"
        return os.path.join(directory, bin_name) if directory else bin_name

    def available(self):
        return self.find() is not False

    # Old server.py: _ffmpeg_version
    def version(self):
        """Installed ffmpeg version as a dotted string (e.g. '8.1'), or None."""
        import re
        import subprocess
        exe = self.exe_path()
        if not exe:
            return None
        try:
            kw = {"creationflags": 0x08000000} if sys.platform == "win32" else {}  # CREATE_NO_WINDOW
            out = subprocess.run([exe, "-version"], capture_output=True, text=True, timeout=10, **kw).stdout or ""
            m = re.search(r"version\s+(\d+(?:\.\d+)+)", out)
            return m.group(1) if m else None
        except Exception:
            return None

    # Old server.py: _ffmpeg_latest_version
    def latest_version(self):
        """Latest gyan.dev release version (cached 1h), or None on failure."""
        now = time.time()
        if self._latest["ver"] and now - self._latest["ts"] < 3600:
            return self._latest["ver"]
        try:
            r = requests.get("https://www.gyan.dev/ffmpeg/builds/release-version", timeout=10)
            r.raise_for_status()
            ver = (r.text or "").strip()
            if ver:
                self._latest.update(ts=now, ver=ver)
                return ver
        except Exception:
            pass
        return None

    @staticmethod
    # Old server.py: _ver_tuple
    def version_tuple(v):
        import re
        return tuple(int(x) for x in re.findall(r"\d+", v or ""))

    # Old server.py: ffmpeg_check_update
    def check_update(self):
        installed = self.version()
        latest = self.latest_version()
        update = bool(installed and latest and self.version_tuple(latest) > self.version_tuple(installed))
        return {"installed": installed, "latest": latest, "updateAvailable": update}

    # Old server.py: ffmpeg_download (_stream generator)
    def download_stream(self, force=False):
        """Yield SSE events while downloading ffmpeg.exe from gyan.dev and placing
        it next to the server executable (install dir). Windows/frozen only."""
        import io
        import zipfile

        # macOS: no stable auto-download source — point the user at Homebrew instead.
        if sys.platform == "darwin":
            yield "data: " + json.dumps({"status": "error",
                "message": "Auf macOS bitte FFmpeg via Homebrew installieren — im Terminal: brew install ffmpeg, dann Kodama neu starten."}) + "\n\n"
            return
        # Only runs when frozen (installed); in dev just report done.
        if not getattr(sys, "frozen", False):
            yield "data: {\"status\": \"done\"}\n\n"
            return

        dest_dir = os.path.dirname(sys.executable)
        dest_exe = os.path.join(dest_dir, "ffmpeg.exe")

        if os.path.exists(dest_exe) and not force:
            yield "data: {\"status\": \"done\"}\n\n"
            return

        url = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
        try:
            with requests.get(url, stream=True, timeout=30) as r:
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
                        mb_done = round(downloaded / 1048576, 1)
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
