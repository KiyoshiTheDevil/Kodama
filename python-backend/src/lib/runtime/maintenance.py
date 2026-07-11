"""Small process-maintenance helpers."""

import os
import threading
import time


class DelayedCleanup:
    """Schedules temporary entries to be removed from mutable mappings."""

    @staticmethod
    # Old server.py: _schedule_cleanup
    def schedule_removal(data, key, delay=300):
        """Remove *key* from *data* after *delay* seconds."""
        def cleanup():
            time.sleep(delay)
            data.pop(key, None)

        threading.Thread(target=cleanup, daemon=True).start()


class DirectoryInspector:
    """Calculates basic storage usage for a single directory."""

    @staticmethod
    # Old server.py: _dir_size_and_count
    def size_and_file_count(path):
        """Return ``(total_bytes, file_count)`` for direct child files."""
        total, count = 0, 0
        try:
            for filename in os.listdir(path):
                file_path = os.path.join(path, filename)
                if os.path.isfile(file_path):
                    total += os.path.getsize(file_path)
                    count += 1
        except OSError:
            pass
        return total, count
