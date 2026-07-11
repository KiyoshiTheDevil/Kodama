"""Console and standard-library logging setup for the backend."""

import collections
import logging
import sys
import threading
import time

DEBUG_LOG = collections.deque(maxlen=500)
DEBUG_LOG_LOCK = threading.Lock()
FEEDBACK_LOG_RING = collections.deque(maxlen=300)


class LogTee:
    """Mirror complete stdout/stderr lines into the feedback log ring."""

    def __init__(self, stream):
        self._stream = stream
        self._buffer = ""

    def write(self, data):
        try:
            if self._stream is not None:
                self._stream.write(data)
        except Exception:
            pass

        self._buffer += data
        while "\n" in self._buffer:
            line, self._buffer = self._buffer.split("\n", 1)
            if line.strip():
                FEEDBACK_LOG_RING.append(line)
        return len(data)

    def flush(self) -> None:
        try:
            if self._stream is not None:
                self._stream.flush()
        except Exception:
            pass


class _RingBufferHandler(logging.Handler):
    """Capture standard logging records for the debug endpoint."""

    def emit(self, record) -> None:
        try:
            level = "WARN" if record.levelname == "WARNING" else record.levelname
            if level not in ("INFO", "ERROR", "WARN", "DEBUG"):
                level = "INFO"
            with DEBUG_LOG_LOCK:
                DEBUG_LOG.append(
                    {
                        "ts": time.time(),
                        "level": level,
                        "msg": self.format(record),
                        "source": "backend",
                    }
                )
        except Exception:
            pass


_ring_handler = _RingBufferHandler()
_ring_handler.setFormatter(logging.Formatter("%(name)s: %(message)s"))
_ring_handler.setLevel(logging.DEBUG)


def setup_log_tee() -> None:
    """Install stdout/stderr mirrors once."""
    if not isinstance(sys.stdout, LogTee):
        sys.stdout = LogTee(sys.stdout)
    if not isinstance(sys.stderr, LogTee):
        sys.stderr = LogTee(sys.stderr)


def setup_logger() -> None:
    """Attach the shared ring-buffer handler to application and Werkzeug logs."""
    root_logger = logging.getLogger()
    werkzeug_logger = logging.getLogger("werkzeug")
    if _ring_handler not in root_logger.handlers:
        root_logger.addHandler(_ring_handler)
    if _ring_handler not in werkzeug_logger.handlers:
        werkzeug_logger.addHandler(_ring_handler)
    werkzeug_logger.setLevel(logging.INFO)
