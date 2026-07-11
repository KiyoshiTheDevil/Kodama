"""Small Last.fm API client used by the backend routes."""

import hashlib
from typing import Optional

import requests

from src.config import config_lastfm


class LastFM:
    @staticmethod
    def lastfm_enabled() -> bool:
        return bool(config_lastfm.LASTFM_API_KEY and config_lastfm.LASTFM_API_SECRET)

    @staticmethod
    def lastfm_sign(params: dict) -> str:
        """Return the Last.fm signature for request parameters."""
        raw = "".join(f"{key}{params[key]}" for key in sorted(params) if key not in ("format", "callback"))
        return hashlib.md5((raw + config_lastfm.LASTFM_API_SECRET).encode("utf-8")).hexdigest()

    def lastfm_call(self, method: str, params: Optional[dict] = None, http: str = "GET", signed: bool = False):
        """Call Last.fm and return ``(ok, payload_or_error)``."""
        if not self.lastfm_enabled():
            return False, {"error": "lastfm_not_configured"}

        payload = dict(params or {})
        payload["method"] = method
        payload["api_key"] = config_lastfm.LASTFM_API_KEY
        if signed:
            payload["api_sig"] = self.lastfm_sign(payload)
        payload["format"] = "json"

        try:
            if http == "POST":
                response = requests.post(config_lastfm.API_ROOT, data=payload, timeout=15)
            else:
                response = requests.get(config_lastfm.API_ROOT, params=payload, timeout=15)
            data = response.json() if response.content else {}
            if isinstance(data, dict) and data.get("error"):
                return False, data
            return True, data
        except requests.RequestException as error:
            return False, {"error": str(error)}
