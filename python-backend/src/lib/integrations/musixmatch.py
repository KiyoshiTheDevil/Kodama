import time

from src.config import config_musixmatch
import json as _json, requests as req


class MusixMatch:
    _mx_token = None
    _mx_token_expires = 0

    def get_mx_token(self):
        """Holt oder erneuert den Musixmatch User-Token (10-Minuten-Cache)."""
        if self._mx_token and time.time() < self._mx_token_expires:
            return self._mx_token
        try:
            r = req.get(f"{config_musixmatch.MX_BASE}/token.get",
                        params={"app_id": config_musixmatch.MX_APP_ID, "guid": "default"},
                        headers=config_musixmatch.MX_HEADERS, timeout=8)
            tok = r.json()["message"]["body"]["user_token"]
            self._mx_token = tok
            self._mx_token_expires = time.time() + 600
            return tok
        except Exception as e:
            print(f"[lyrics] Musixmatch token error: {e}", flush=True)
            return None

    def _try_musixmatch(self, title, artist, duration=None):
        """Sucht einen Track auf Musixmatch und gibt RichSync (Word) oder Subtitle (LRC) zurück."""
        token = self.get_mx_token()
        if not token:
            return None
        base = {"app_id": config_musixmatch.MX_APP_ID, "usertoken": token}

        # Track suchen
        try:
            sr = req.get(f"{config_musixmatch.MX_BASE}/track.search",
                         params={**base, "q_track": title, "q_artist": artist,
                                 "s_track_rating": "desc", "page_size": 5},
                         headers=config_musixmatch.MX_HEADERS, timeout=8)
            track_list = sr.json()["message"]["body"]["track_list"]
        except Exception as e:
            print(f"[lyrics] Musixmatch search error: {e}", flush=True)
            return None
        if not track_list:
            return None
        track_id = track_list[0]["track"]["track_id"]
        bp = {**base, "track_id": track_id}

        # RichSync (Word-Sync)
        try:
            rr = req.get(f"{config_musixmatch.MX_BASE}/track.richsync.get",
                         params=bp, headers=config_musixmatch.MX_HEADERS, timeout=8)
            rb = rr.json()["message"]["body"]
            if rb and isinstance(rb, dict) and rb.get("richsync", {}).get("richsync_body"):
                richsync = _json.loads(rb["richsync"]["richsync_body"])
                if richsync:
                    return {"source": "Musixmatch", "richsync": richsync, "synced": None, "plain": None}
        except Exception as e:
            print(f"[lyrics] Musixmatch richsync error: {e}", flush=True)

        # Fallback: Line-Sync (LRC)
        try:
            lr = req.get(f"{config_musixmatch.MX_BASE}/track.subtitle.get",
                         params={**bp, "subtitle_format": "lrc"},
                         headers=config_musixmatch.MX_HEADERS, timeout=8)
            lb = lr.json()["message"]["body"]
            if lb and isinstance(lb, dict) and lb.get("subtitle", {}).get("subtitle_body"):
                return {"source": "Musixmatch", "richsync": None,
                        "synced": lb["subtitle"]["subtitle_body"], "plain": None}
        except Exception as e:
            print(f"[lyrics] Musixmatch subtitle error: {e}", flush=True)

        return None