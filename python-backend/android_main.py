"""Starts the backend inside the Android app.

On the desktop the backend is its own process (a PyInstaller build started by the Rust side).
On Android there are no child processes to start, so the app embeds Python (Chaquopy) and calls
start() from MainActivity. The web view talks to it exactly as on the desktop, on port 9847.
"""
import os
import threading

_started = False


def start(data_dir):
    """Runs the Flask server on a background thread and returns at once.

    data_dir is the app's private files folder. It has to be set before server.py is imported,
    which decides where profiles and caches live while it loads.
    """
    global _started
    if _started:
        return
    _started = True
    os.makedirs(data_dir, exist_ok=True)
    os.environ["KODAMA_DATA_DIR"] = data_dir

    def run():
        import server
        # Loopback only: on a phone the desktop's 0.0.0.0 would put the backend on every
        # network the phone joins.
        server.app.run(host="127.0.0.1", port=9847, debug=False, threaded=True, use_reloader=False)

    threading.Thread(target=run, name="kodama-backend", daemon=True).start()
