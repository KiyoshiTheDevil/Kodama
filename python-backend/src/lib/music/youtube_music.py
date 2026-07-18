"""YTMusic client construction and active-session maintenance."""

import hashlib
import json
import os
import threading
import time
from collections.abc import Callable, Iterable, Mapping
from typing import Optional, Protocol, cast

import requests
from ytmusicapi import YTMusic

from ..profiles.profile import Profile
from .playlist import Playlist


class SessionCookie(Protocol):
    """The subset of a requests cookie used by session refresh."""

    name: str
    value: str


class YoutubeMusicSessionState:
    """Holds the active YTMusic client, profile, playlist cache, and cookie timestamp."""

    def __init__(self) -> None:
        # Old server.py: _ytm
        self.ytm: Optional[YTMusic] = None
        # Old server.py: _current_profile
        self.current_profile: Optional[str] = None
        # Old server.py: _psidts_last_refresh
        self.psidts_last_refresh = 0.0
        # Old server.py: _adding_account
        self.adding_account = False


class YoutubeMusicSession:
    """Creates YTMusic clients and maintains one active browser-auth session."""

    # Old server.py: _SHORT_LIVED_COOKIES
    SHORT_LIVED_COOKIES = {
        "__Secure-1PSIDTS",
        "__Secure-3PSIDTS",
        "SIDCC",
        "__Secure-1PSIDCC",
        "__Secure-3PSIDCC",
        "CONSISTENCY",
        "YSC",
        "__Secure-YEC",
        "VISITOR_PRIVACY_METADATA",
        "__Secure-ROLLOUT_TOKEN",
    }

    def __init__(
        self,
        profiles: Optional[Profile] = None,
        state: Optional[YoutubeMusicSessionState] = None,
        playlist_cache: Optional[Playlist] = None,
        client_factory: Callable[..., YTMusic] = YTMusic,
        session_factory: Callable[[], requests.Session] = requests.Session,
    ) -> None:
        self.profiles = profiles or Profile()
        self.state = state or YoutubeMusicSessionState()
        self._playlist_cache = playlist_cache
        self._client_factory = client_factory
        self._session_factory = session_factory
        self._cookie_refresh_loop_lock = threading.Lock()
        self._cookie_refresh_loop_started = False

    def start_cookie_refresh_loop(self) -> bool:
        """Start the background cookie refresher once for this session."""
        with self._cookie_refresh_loop_lock:
            if self._cookie_refresh_loop_started:
                return False
            threading.Thread(
                target=self.run_cookie_refresh_loop,
                name="youtube-cookie-refresh",
                daemon=True,
            ).start()
            self._cookie_refresh_loop_started = True
        return True

    @staticmethod
    def is_oauth_profile(raw: object) -> bool:
        """Identify unsupported OAuth profiles left over from older releases."""
        return isinstance(raw, dict) and ("refresh_token" in raw or raw.get("token_type") == "Bearer")

    @staticmethod
    # Old server.py: clean_headers_for_storage
    def prepare_auth_headers(headers: Mapping[str, str]) -> dict[str, str]:
        """Remove unsuitable headers and restore a SAPISIDHASH auth header when possible."""
        cleaned_headers = dict(headers)
        cleaned_headers.pop("content-encoding", None)
        if "authorization" not in cleaned_headers:
            cookie_string = cleaned_headers.get("cookie", "")
            sapisid = next(
                (part.strip()[8:] for part in cookie_string.split(";") if part.strip().startswith("SAPISID=")),
                "",
            )
            if sapisid:
                timestamp = str(int(time.time()))
                signature = hashlib.sha1(
                    f"{timestamp} {sapisid} https://music.youtube.com".encode()
                ).hexdigest()
                cleaned_headers["authorization"] = f"SAPISIDHASH {timestamp}_{signature}"
        return cleaned_headers

    # Old server.py: make_ytmusic
    def create_client(self, name: str) -> YTMusic:
        """Build a YTMusic client for a stored browser-auth profile."""
        path = self.profiles.profile_file_path(name)
        with open(path, encoding="utf-8") as profile_file:
            raw = cast(dict[str, str], json.load(profile_file))
        if self.is_oauth_profile(raw):
            raise Exception("OAuth-Profile werden nicht mehr unterstützt (YT-Music-Inkompatibilität).")
        if "authorization" not in raw:
            with open(path, "w", encoding="utf-8") as profile_file:
                json.dump(self.prepare_auth_headers(raw), profile_file, indent=2)
        return self._client_factory(path, user=self.profiles.brand_user_id(name))

    # Old server.py: load_profile
    def activate_profile(self, name: str) -> bool:
        """Load a profile into this manager's active YTMusic session."""
        if self.profiles.is_local(name):
            self.state.ytm = self._client_factory()
            self.state.current_profile = name
            return True

        path = self.profiles.profile_file_path(name)
        if not os.path.exists(path):
            return False
        try:
            self.state.ytm = self.create_client(name)
        except Exception as error:
            print(f"[auth] load_profile failed for {name}: {error}", flush=True)
            return False

        self.state.current_profile = name
        threading.Thread(target=self.refresh_session_cookies, kwargs={"force": True}, daemon=True).start()
        return True

    def activate_verified_profile(self, name: str) -> YTMusic:
        """Validate browser auth with a lightweight request, then activate the profile."""
        client = self.create_client(name)
        client.get_liked_songs(limit=1)
        self.state.ytm = client
        self.state.current_profile = name
        self._clear_profile_playlist_memory(name)
        threading.Thread(target=self.refresh_session_cookies, kwargs={"force": True}, daemon=True).start()
        return client

    def clear_active_profile(self) -> None:
        """Clear the active client and profile without deleting profile files."""
        self._clear_profile_playlist_memory(self.state.current_profile)
        self.state.current_profile = None
        self.state.ytm = None

    def _clear_profile_playlist_memory(self, profile_name: Optional[str]) -> None:
        if self._playlist_cache is not None:
            self._playlist_cache.clear_memory_for_profile(profile_name)

    def apply_webview_cookies(self, cookie_string: str) -> tuple[bool, Optional[str], bool]:
        """Apply browser-refreshed cookies to the active session and profile file."""
        if (
            self.state.ytm is None
            or not self.state.current_profile
            or self.profiles.is_local(self.state.current_profile)
        ):
            return False, "no_profile", False
        if "SAPISID" not in cookie_string:
            return False, "invalid", False
        base_headers = getattr(self.state.ytm, "base_headers", None)
        if base_headers is None:
            return False, "no_headers", False

        # The keeper WebView may still hold the login helper cookies (KODAMA_DSID/KODAMA_DONE,
        # max-age 1h) — never let them bleed into the persisted auth header.
        if "KODAMA_" in cookie_string:
            cookie_string = "; ".join(
                part.strip() for part in cookie_string.split(";") if not part.strip().startswith("KODAMA_")
            )
        base_headers["cookie"] = cookie_string
        try:
            path = self.profiles.profile_file_path(self.state.current_profile)
            with open(path, encoding="utf-8") as profile_file:
                raw = cast(dict[str, str], json.load(profile_file))
            raw["cookie"] = cookie_string
            with open(path, "w", encoding="utf-8") as profile_file:
                json.dump(raw, profile_file, indent=2)
        except Exception:
            pass

        self.state.psidts_last_refresh = time.time()
        has_psidts = "__Secure-1PSIDTS" in cookie_string or "__Secure-3PSIDTS" in cookie_string
        print(f"[cookies] WebView refresh applied (PSIDTS present: {has_psidts})", flush=True)
        return True, None, has_psidts

    # Old server.py: get_ytmusic
    def get_active_client(self) -> YTMusic:
        """Return the active YTMusic client or raise when no profile is loaded."""
        if self.state.ytm is None:
            raise Exception("Kein Profil aktiv. Bitte zuerst anmelden.")
        return self.state.ytm

    # Old server.py: fetch_account_info
    def refresh_account_info(self, profile_name: str) -> None:
        """Fetch YouTube account metadata and save it with the profile."""
        if self.profiles.is_local(profile_name):
            return
        try:
            account = self.create_client(profile_name).get_account_info()
            if not account:
                return
            metadata = self.profiles._read_metadata(profile_name)
            metadata["displayName"] = account.get("accountName", profile_name)
            metadata["handle"] = account.get("channelHandle", "")
            metadata["avatar"] = account.get("accountPhotoUrl", "")
            with open(self.profiles.metadata_file_path(profile_name), "w", encoding="utf-8") as meta_file:
                json.dump(metadata, meta_file)
        except Exception as error:
            print(f"[i] Account-Info nicht abrufbar: {error}")

    # Old server.py: autoload
    def autoload_first_profile(self) -> None:
        """Migrate legacy storage and activate the first usable profile."""
        self.profiles.migrate_legacy_browser_profile(self.state.current_profile)
        for profile in self.profiles.list_profiles(self.state.current_profile):
            if profile.get("loggedOut"):
                continue
            profile_name = str(profile["name"])
            if self.activate_profile(profile_name):
                threading.Thread(target=self.refresh_account_info, args=(profile_name,), daemon=True).start()
                break

    # Old server.py: _refresh_ytm_psidts
    def refresh_session_cookies(self, force: bool = False) -> None:
        """Refresh short-lived anti-bot cookies for the active browser-auth session."""
        try:
            if (
                self.state.ytm is None
                or not self.state.current_profile
                or self.profiles.is_local(self.state.current_profile)
            ):
                return

            now = time.time()
            if not force and (now - self.state.psidts_last_refresh) < 240:
                return
            base_headers = getattr(self.state.ytm, "base_headers", None)
            if base_headers is None:
                return
            cookie_header = base_headers.get("cookie", "")
            if not cookie_header or "SAPISID" not in cookie_header:
                return

            user_agent = base_headers.get(
                "user-agent",
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            )
            session = self._session_factory()
            authenticated = None
            statuses = []
            for url in ("https://music.youtube.com/", "https://www.youtube.com/", "https://accounts.google.com/"):
                try:
                    response = session.get(
                        url,
                        headers={
                            "Cookie": cookie_header,
                            "User-Agent": user_agent,
                            "Accept-Language": "en-US,en;q=0.9",
                        },
                        timeout=8,
                        allow_redirects=True,
                    )
                    statuses.append(f"{url.split('//', 1)[1].split('/', 1)[0]}={response.status_code}")
                    if authenticated is None and "youtube.com" in url:
                        page = response.text or ""
                        if '"LOGGED_IN":true' in page:
                            authenticated = True
                        elif '"LOGGED_IN":false' in page:
                            authenticated = False
                except Exception:
                    pass

            fresh_cookies: dict[str, str] = {
                cookie.name: cookie.value
                for cookie in cast(Iterable[SessionCookie], session.cookies)
                if cookie.name in self.SHORT_LIVED_COOKIES
            }
            if authenticated is False:
                print(
                    f"[cookies] refresh ping is LOGGED OUT (statuses: {', '.join(statuses)}) - re-login required.",
                    flush=True,
                )
            if not fresh_cookies:
                print(
                    f"[cookies] refresh: no rotating cookies returned (authed={authenticated}, statuses: {', '.join(statuses)})",
                    flush=True,
                )
                return

            parts: list[str] = []
            seen: set[str] = set()
            for value in cookie_header.split(";"):
                value = value.strip()
                if not value or "=" not in value:
                    continue
                cookie_name = value.split("=", 1)[0].strip()
                if cookie_name in fresh_cookies:
                    parts.append(f"{cookie_name}={fresh_cookies[cookie_name]}")
                    seen.add(cookie_name)
                else:
                    parts.append(value)
            for cookie_name, value in fresh_cookies.items():
                if cookie_name not in seen:
                    parts.append(f"{cookie_name}={value}")
            base_headers["cookie"] = "; ".join(parts)

            try:
                path = self.profiles.profile_file_path(self.state.current_profile)
                with open(path, encoding="utf-8") as profile_file:
                    raw = json.load(profile_file)
                raw["cookie"] = base_headers["cookie"]
                with open(path, "w", encoding="utf-8") as profile_file:
                    json.dump(raw, profile_file, indent=2)
            except Exception:
                pass

            self.state.psidts_last_refresh = now
            print(
                f"[cookies] session refreshed (authed={authenticated}): "
                f"{', '.join(sorted(fresh_cookies))} | {', '.join(statuses)}",
                flush=True,
            )
        except Exception as error:
            print(f"[cookies] PSIDTS refresh failed (non-fatal): {error}", flush=True)

    # Old server.py: _psidts_refresher_loop
    def run_cookie_refresh_loop(self) -> object:
        """Refresh active-session cookies every five minutes."""
        while True:
            time.sleep(300)
            self.refresh_session_cookies(force=True)
