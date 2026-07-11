"""Production launcher for the local Flask backend."""

import socket
import sys
import threading
import time
import traceback
import urllib.request
from pathlib import Path

from flask import Flask

from src.config import BACKEND_PORT, config_dirs


HOST = "0.0.0.0"


class StartupLog:
    """Best-effort, persistent diagnostics for packaged backend startup."""

    def __init__(self, path: Path):
        self.path = path

    def reset(self) -> None:
        try:
            self.path.write_text("", encoding="utf-8")
        except OSError:
            pass

    def write(self, message: str) -> None:
        try:
            with self.path.open("a", encoding="utf-8") as log_file:
                log_file.write(f"[{time.time():.3f}] {message}\n")
                log_file.flush()
        except OSError:
            pass


def _port_is_free(port: int) -> bool:
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as connection:
            connection.settimeout(0.3)
            return connection.connect_ex(("127.0.0.1", port)) != 0
    except OSError:
        return True


def _request_existing_shutdown(port: int, startup_log: StartupLog) -> None:
    try:
        urllib.request.urlopen(f"http://127.0.0.1:{port}/shutdown", timeout=2)
        startup_log.write("sent /shutdown to existing server")
    except Exception:
        pass
    time.sleep(0.5)


def _start_self_test(port: int, startup_log: StartupLog) -> None:
    def self_test() -> None:
        time.sleep(3)
        for host in ("127.0.0.1", "localhost", "::1"):
            url = f"http://{host}:{port}/status"
            try:
                response = urllib.request.urlopen(url, timeout=3)
                startup_log.write(f"self-test {url} -> HTTP {response.status} OK")
            except Exception as error:
                startup_log.write(f"self-test {url} -> FAILED: {type(error).__name__}: {error}")

    threading.Thread(target=self_test, daemon=True).start()


def run_server(app: Flask, *, host: str = HOST, port: int = BACKEND_PORT) -> None:
    """Run the backend with single-instance handling and startup diagnostics."""
    startup_log = StartupLog(config_dirs.BASE_DIR / "server_startup.log")
    startup_log.reset()
    startup_log.write("process started")
    startup_log.write(f"python={sys.version}")
    startup_log.write(f"frozen={getattr(sys, 'frozen', False)}")
    startup_log.write(f"base_dir={config_dirs.BASE_DIR}")

    startup_log.write(f"checking port {port} ...")
    if _port_is_free(port):
        startup_log.write(f"port {port} is free")
    else:
        startup_log.write("port occupied — sending shutdown and waiting")
        _request_existing_shutdown(port, startup_log)
        time.sleep(0.5)

    _start_self_test(port, startup_log)
    startup_log.write("calling app.run ...")
    try:
        app.run(host=host, port=port, debug=False, threaded=True, use_reloader=False)
        startup_log.write("app.run returned cleanly")
    except BaseException as error:
        startup_log.write(f"CRASH: {type(error).__name__}: {error}")
        try:
            with startup_log.path.open("a", encoding="utf-8") as log_file:
                traceback.print_exc(file=log_file)
        except OSError:
            pass
        raise
