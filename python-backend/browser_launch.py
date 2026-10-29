#!/usr/bin/env python3
"""Kodama in a browser: the Linux route without WebKitGTK.

Starts the backend with the built frontend (KODAMA_WEB_DIR), then opens it in a Chromium in app
mode, with a profile of Kodama's own. Closing the window stops the backend again.

    python3 browser_launch.py [--fullscreen] [--web-dir PATH]

--fullscreen is for the Steam Deck's game mode. KODAMA_BROWSER names a Chromium if the search
(chromium.py) does not find the one wanted.
"""
import argparse
import os
import subprocess
import sys
import time
import urllib.request

from chromium import find_chromium, profile_dir

HERE = os.path.dirname(os.path.abspath(__file__))
URL = "http://localhost:9847/"


def data_root():
    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA", HERE)
    else:
        base = os.environ.get("XDG_DATA_HOME", os.path.expanduser("~/.local/share"))
    return os.path.join(base, "dev.kodama.music")


def answers(url, timeout=1):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return r.status == 200
    except Exception:
        return False


def start_backend(web_dir):
    env = dict(os.environ, KODAMA_WEB_DIR=web_dir)
    # A packaged backend next to this file if there is one, else the source.
    for name in ("kodama-server", "kodama-server.exe"):
        exe = os.path.join(HERE, name)
        if os.path.exists(exe):
            return subprocess.Popen([exe], env=env, cwd=HERE)
    return subprocess.Popen([sys.executable, os.path.join(HERE, "server.py")], env=env, cwd=HERE)


def main():
    ap = argparse.ArgumentParser(description="Kodama in a browser")
    ap.add_argument("--fullscreen", action="store_true", help="open full screen (Steam Deck game mode)")
    ap.add_argument("--deck", action="store_true", help="the Steam Deck layout even outside game mode")
    ap.add_argument("--web-dir", default=os.path.join(HERE, "..", "dist"), help="the built frontend (npm run build)")
    args = ap.parse_args()

    web_dir = os.path.abspath(args.web_dir)
    if not os.path.exists(os.path.join(web_dir, "index.html")):
        sys.exit(f"No built frontend in {web_dir}. Run `npm run build` first, or pass --web-dir.")
    browser = find_chromium()
    if not browser:
        sys.exit("No Chromium found. Install Chromium or Chrome, or set KODAMA_BROWSER.")

    backend = None
    if answers(URL + "status"):
        # A backend is up already. Without the frontend it is the desktop app's; starting a second
        # would make the first shut down (server.py takes the port over), so leave it be.
        if not answers(URL):
            sys.exit("Another Kodama is running. Close it first.")
    else:
        backend = start_backend(web_dir)
        for _ in range(120):  # the backend's cold start is a few seconds, more on a slow disk
            if answers(URL + "status"):
                break
            if backend.poll() is not None:
                sys.exit("The backend stopped while starting.")
            time.sleep(0.25)
        else:
            backend.terminate()
            sys.exit("The backend did not come up.")

    # The Steam Deck's game mode runs under gamescope, which says so; the page then takes the
    # compact layout with its tabs down the left edge (IS_DECK in src/platform.js).
    deck = (args.deck or os.environ.get("XDG_CURRENT_DESKTOP", "").lower() == "gamescope"
            or "GAMESCOPE_WAYLAND_DISPLAY" in os.environ)
    profile = profile_dir(browser, data_root(), "browser-app")
    cmd = browser + [
        f"--app={URL}{'?deck=1' if deck else ''}", f"--user-data-dir={profile}",
        "--no-first-run", "--no-default-browser-check",
        # Not the desktop's keyring: game mode has none, and a profile sealed with KWallet in desktop
        # mode then stops at a "could not unlock your key store" dialog.
        "--password-store=basic",
        # The player resumes and moves on to the next song without a click in between.
        "--autoplay-policy=no-user-gesture-required",
        "--class=Kodama",  # the window's name for the taskbar on Linux
    ]
    if args.fullscreen:
        cmd.append("--start-fullscreen")
    opened = time.time()
    try:
        subprocess.run(cmd)
    except KeyboardInterrupt:
        # Steam ends a non-Steam game this way; the backend still goes down with the window.
        pass

    # A Chromium already running on that profile hands the window over and returns at once; the
    # backend then still has a window to serve.
    if backend and time.time() - opened > 3:
        try:
            urllib.request.urlopen(URL + "shutdown", timeout=3)
        except Exception:
            pass
        try:
            backend.wait(timeout=5)
        except subprocess.TimeoutExpired:
            backend.terminate()


if __name__ == "__main__":
    main()
