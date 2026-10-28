"""Finding a Chromium for Kodama in a browser (the Linux route): the app window that
browser_launch.py opens, and the sign-in window the backend opens (server.py)."""
import os
import shutil
import subprocess
import sys


def find_chromium():
    """The command that starts a Chromium: KODAMA_BROWSER if set, else the usual names and places.
    None when there is none."""
    own = os.environ.get("KODAMA_BROWSER", "").strip()
    if own:
        return own.split()
    for name in ("chromium", "chromium-browser", "google-chrome", "google-chrome-stable", "brave-browser", "microsoft-edge"):
        found = shutil.which(name)
        if found:
            return [found]
    if sys.platform == "win32":
        for root in (os.environ.get("PROGRAMFILES", ""), os.environ.get("PROGRAMFILES(X86)", ""), os.environ.get("LOCALAPPDATA", "")):
            for rel in ("Google\\Chrome\\Application\\chrome.exe", "BraveSoftware\\Brave-Browser\\Application\\brave.exe",
                        "Vivaldi\\Application\\vivaldi.exe", "Microsoft\\Edge\\Application\\msedge.exe"):
                p = os.path.join(root, rel)
                if root and os.path.exists(p):
                    return [p]
    if sys.platform == "darwin":
        p = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
        if os.path.exists(p):
            return [p]
    # SteamOS and other immutable systems install browsers as Flatpaks.
    if shutil.which("flatpak"):
        for app_id in ("org.chromium.Chromium", "com.google.Chrome"):
            try:
                if subprocess.run(["flatpak", "info", app_id], capture_output=True, timeout=5).returncode == 0:
                    return ["flatpak", "run", app_id]
            except Exception:
                pass
    return None


def profile_dir(cmd, fallback, name):
    """Where that Chromium keeps a profile of Kodama's. A Flatpak may only write inside its own
    folder, so its profiles live there; any other Chromium gets `fallback`/`name`."""
    if cmd[:2] == ["flatpak", "run"] and len(cmd) > 2:
        path = os.path.expanduser(f"~/.var/app/{cmd[2]}/data/kodama-{name}")
    else:
        path = os.path.join(fallback, name)
    os.makedirs(path, exist_ok=True)
    return path
