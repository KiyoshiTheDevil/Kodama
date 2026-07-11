"""Lyrics lookup, transformation, and local custom-lyrics storage."""

import base64
import collections
import hashlib
import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional

import requests

from src.config import config_dirs, config_lyrics


class LyricsService:
    """Owns lyric providers and the small in-memory caches they need.

    Old server.py: get_lyrics, unison_versions, romanize_lyrics,
    translate_lyrics, and the /lyrics/custom handlers.
    """

    UNISON_BASE_URL = "https://unison.boidu.dev"

    def __init__(self, cache_settings, musixmatch):
        self._cache_settings = cache_settings
        self._musixmatch = musixmatch
        self._translation_cache = collections.OrderedDict()
        self._romaji_cache = collections.OrderedDict()
        self._kakasi = None
        self._japanese_characters = re.compile(r"[\u3040-\u309f\u30a0-\u30ff\u4e00-\u9fff\uff66-\uff9f]")

    @staticmethod
    def _cache_key(title: str, artist: str, source: str) -> str:
        raw = f"{title.lower().strip()}|{artist.lower().strip()}|{source}"
        return hashlib.md5(raw.encode()).hexdigest()

    def _cache_path(self, title: str, artist: str, source: str) -> Path:
        return config_dirs.LYRICS_CACHE_DIR / f"{self._cache_key(title, artist, source)}.json"

    def _lyrics_cache_enabled(self) -> bool:
        return self._cache_settings.enabled.get("lyrics", True)

    def get_lyrics(
        self,
        title: str,
        artist: str,
        album: str,
        duration: str,
        source: str,
        video_id: str,
    ) -> Dict[str, Any]:
        """Look up lyrics in the existing provider priority order."""
        cache_path = self._cache_path(title, artist, source)
        if self._lyrics_cache_enabled() and cache_path.exists():
            try:
                with cache_path.open(encoding="utf-8") as cache_file:
                    return json.load(cache_file)
            except Exception:
                pass

        result = self._lookup_lrclib(title, artist, source)
        if not result:
            result = self._lookup_better_lyrics(title, artist, album, duration, source)
        if not result:
            result = self._lookup_kugou(title, artist, duration, source)
        if not result and source in ("auto", "musixmatch"):
            try:
                result = self._musixmatch.lookup(title, artist, duration)
            except Exception as error:
                print(f"[lyrics] Musixmatch error: {error}", flush=True)
        if not result:
            result = self._lookup_unison(title, artist, album, duration, source, video_id)
        if not result:
            result = self._lookup_simpmusic(source, video_id)

        if not result:
            return {"source": None, "synced": None, "plain": None}

        if self._lyrics_cache_enabled():
            try:
                with cache_path.open("w", encoding="utf-8") as cache_file:
                    json.dump(result, cache_file, ensure_ascii=False)
            except Exception:
                pass
        return result

    @staticmethod
    def _lookup_lrclib(title: str, artist: str, source: str) -> Optional[Dict[str, Any]]:
        if source not in ("auto", "lrclib"):
            return None
        try:
            response = requests.get(
                "https://lrclib.net/api/get",
                params={"artist_name": artist, "track_name": title},
                timeout=8,
            )
            if response.ok:
                data = response.json()
                if data.get("syncedLyrics"):
                    return {"source": "LRCLIB", "synced": data["syncedLyrics"], "plain": None}
                if data.get("plainLyrics"):
                    return {"source": "LRCLIB", "synced": None, "plain": data["plainLyrics"]}
        except Exception as error:
            print(f"[lyrics] LRCLIB error: {error}", flush=True)
        return None

    @staticmethod
    def _lookup_better_lyrics(
        title: str, artist: str, album: str, duration: str, source: str
    ) -> Optional[Dict[str, Any]]:
        if source not in ("auto", "better"):
            return None
        try:
            params = {"s": title, "a": artist}
            if album:
                params["al"] = album
            if duration:
                params["d"] = duration
            response = requests.get("https://lyrics-api.boidu.dev/getLyrics", params=params, timeout=8)
            data = response.json() if response.ok else {}
            if data.get("ttml"):
                return {"source": "Better Lyrics", "ttml": data["ttml"]}
        except Exception as error:
            print(f"[lyrics] Better Lyrics error: {error}", flush=True)
        return None

    @staticmethod
    def _lookup_kugou(title: str, artist: str, duration: str, source: str) -> Optional[Dict[str, Any]]:
        if source not in ("auto", "kugou"):
            return None
        try:
            keyword = f"{title} {artist}".strip()
            duration_ms = int(float(duration) * 1000) if duration else 0
            search_response = requests.get(
                "https://mobilecdn.kugou.com/api/v3/search/song",
                params={"keyword": keyword, "page": 1, "pagesize": 5, "format": "json"},
                timeout=8,
            )
            if not search_response.ok:
                return None
            songs = search_response.json().get("data", {}).get("info", [])
            if not songs:
                return None
            candidate_response = requests.get(
                "https://lyrics.kugou.com/search",
                params={
                    "ver": 1,
                    "man": "yes",
                    "client": "pc",
                    "keyword": f"{title} - {artist}",
                    "duration": duration_ms,
                    "hash": songs[0].get("hash", ""),
                },
                timeout=8,
            )
            candidates = candidate_response.json().get("candidates", []) if candidate_response.ok else []
            if not candidates:
                return None
            candidate = candidates[0]
            download_response = requests.get(
                "https://lyrics.kugou.com/download",
                params={
                    "ver": 1,
                    "client": "pc",
                    "id": candidate["id"],
                    "accesskey": candidate["accesskey"],
                    "fmt": "lrc",
                    "charset": "utf8",
                },
                timeout=8,
            )
            content = download_response.json().get("content", "") if download_response.ok else ""
            if content:
                lyrics = base64.b64decode(content).decode("utf-8", errors="ignore")
                if lyrics.strip():
                    return {"source": "Kugou", "synced": lyrics, "plain": None}
        except Exception as error:
            print(f"[lyrics] Kugou error: {error}", flush=True)
        return None

    def _lookup_unison(
        self, title: str, artist: str, album: str, duration: str, source: str, video_id: str
    ) -> Optional[Dict[str, Any]]:
        if source not in ("auto", "unison"):
            return None
        try:
            item = None
            if video_id:
                response = requests.get(f"{self.UNISON_BASE_URL}/lyrics", params={"v": video_id}, timeout=8)
                data = response.json() if response.ok else {}
                if data.get("success") and isinstance(data.get("data"), dict):
                    item = data["data"]
            if not item:
                params = {"song": title, "artist": artist}
                if album:
                    params["album"] = album
                if duration:
                    params["duration"] = duration
                response = requests.get(f"{self.UNISON_BASE_URL}/lyrics/search", params=params, timeout=8)
                data = response.json() if response.ok else {}
                if data.get("success") and isinstance(data.get("data"), list) and data["data"]:
                    item = data["data"][0]
            if not item or not item.get("lyrics"):
                return None
            submitter_name = self.display_name((item.get("submitter") or {}).get("keyId"))
            if item.get("format") == "ttml":
                return {"source": "Unison", "ttml": item["lyrics"], "submitterName": submitter_name}
            if item.get("format") == "lrc":
                return {"source": "Unison", "synced": item["lyrics"], "plain": None, "submitterName": submitter_name}
            if item.get("format") == "plain":
                return {"source": "Unison", "synced": None, "plain": item["lyrics"], "submitterName": submitter_name}
        except Exception as error:
            print(f"[lyrics] Unison error: {error}", flush=True)
        return None

    @staticmethod
    def _lookup_simpmusic(source: str, video_id: str) -> Optional[Dict[str, Any]]:
        if source not in ("auto", "simp") or not video_id:
            return None
        try:
            response = requests.get(f"https://api-lyrics.simpmusic.org/v1/{video_id}", timeout=8)
            data = response.json() if response.ok else {}
            items = data.get("data", [])
            item = items[0] if isinstance(items, list) and items else None
            if item and item.get("syncedLyrics"):
                return {"source": "SimpMusic", "synced": item["syncedLyrics"], "plain": None}
            if item and item.get("plainLyric"):
                return {"source": "SimpMusic", "synced": None, "plain": item["plainLyric"]}
        except Exception as error:
            print(f"[lyrics] SimpMusic error: {error}", flush=True)
        return None

    def display_name(self, key_id: Optional[str]) -> Optional[str]:
        """Resolve an Unison submitter's current public display name."""
        if not key_id:
            return None
        try:
            response = requests.get(f"{self.UNISON_BASE_URL}/leaderboard/users/{key_id}", timeout=5)
            if response.ok:
                return response.json().get("data", {}).get("displayName")
        except Exception:
            pass
        return None

    def unison_versions(
        self, video_id: str, title: str, artist: str, album: str, duration: str
    ) -> List[Dict[str, Any]]:
        """Fetch the available community lyric submissions for one track."""
        candidates, seen = [], set()

        def add(item: Any) -> None:
            if not isinstance(item, dict):
                return
            candidate_id = item.get("id")
            key = candidate_id if candidate_id is not None else hash(item.get("lyrics") or repr(item))
            if key not in seen:
                seen.add(key)
                candidates.append(item)

        def search(params: Dict[str, str]) -> List[Dict[str, Any]]:
            try:
                response = requests.get(f"{self.UNISON_BASE_URL}/lyrics/search", params=params, timeout=8)
                data = response.json() if response.ok else {}
                if data.get("success") and isinstance(data.get("data"), list):
                    return data["data"]
            except Exception:
                pass
            return []

        try:
            if video_id:
                response = requests.get(f"{self.UNISON_BASE_URL}/lyrics", params={"v": video_id}, timeout=8)
                data = response.json() if response.ok else {}
                if data.get("success"):
                    direct_matches = data.get("data")
                    if isinstance(direct_matches, dict):
                        add(direct_matches)
                    elif isinstance(direct_matches, list):
                        for item in direct_matches:
                            add(item)

            strict_params = {"song": title, "artist": artist}
            if album:
                strict_params["album"] = album
            if duration:
                strict_params["duration"] = duration
            for item in search(strict_params):
                add(item)

            artist_lower, title_lower = artist.lower(), title.lower()
            for item in search({"q": f"{title} {artist}".strip()}):
                item_artist = (item.get("artist") or "").lower()
                item_title = (item.get("song") or item.get("title") or "").lower()
                if (
                    artist_lower
                    and item_artist
                    and (artist_lower in item_artist or item_artist in artist_lower)
                    and title_lower
                    and item_title
                    and (title_lower in item_title or item_title in title_lower)
                ):
                    add(item)
        except Exception as error:
            print(f"[lyrics] Unison versions error: {error}", flush=True)

        versions, name_cache = [], {}
        for item in candidates[:8]:
            lyrics = item.get("lyrics")
            lyric_format = item.get("format")
            sync_type = item.get("syncType")
            candidate_id = item.get("id")
            submitter = item.get("submitter") or {}
            if not lyrics and candidate_id is not None:
                try:
                    response = requests.get(f"{self.UNISON_BASE_URL}/lyrics/{candidate_id}", timeout=6)
                    full_data = (response.json() or {}).get("data") or {} if response.ok else {}
                    lyrics = full_data.get("lyrics")
                    lyric_format = full_data.get("format") or lyric_format
                    sync_type = full_data.get("syncType") or sync_type
                    submitter = full_data.get("submitter") or submitter
                except Exception:
                    pass
            if not lyrics:
                continue
            key_id = submitter.get("keyId")
            if key_id not in name_cache:
                name_cache[key_id] = self.display_name(key_id)
            versions.append(
                {
                    "id": candidate_id,
                    "format": lyric_format,
                    "syncType": sync_type,
                    "lyrics": lyrics,
                    "submitterName": name_cache[key_id],
                    "voteCount": item.get("voteCount"),
                }
            )
        return versions

    def romanize(self, lines: List[str]) -> List[str]:
        """Convert Japanese lyric lines to Hepburn romaji."""
        if self._kakasi is None:
            import pykakasi

            self._kakasi = pykakasi.kakasi()

        result = []
        for line in lines:
            if not line.strip() or not self._japanese_characters.search(line):
                result.append("")
                continue
            cache_key = f"romaji:{line}"
            if cache_key in self._romaji_cache:
                result.append(self._romaji_cache[cache_key])
                continue
            converted = self._kakasi.convert(line)
            romaji = " ".join(
                item.get("hepburn") or item.get("orig", "")
                for item in converted
                if (item.get("hepburn") or item.get("orig", "")).strip()
            )
            self._lru_put(self._romaji_cache, cache_key, romaji)
            result.append(romaji)
        return result

    def translate(self, lines: List[str], target_lang: str) -> List[str]:
        """Translate non-empty lyric lines through the existing Google endpoint."""
        non_empty_indices = [index for index, line in enumerate(lines) if line.strip()]
        non_empty_lines = [lines[index] for index in non_empty_indices]
        if not non_empty_lines:
            return list(lines)

        cache_key = f"{target_lang}:{hash(tuple(non_empty_lines))}"
        if cache_key in self._translation_cache:
            translated_lines = self._translation_cache[cache_key]
        else:
            translated_lines = self._google_translate_batch(non_empty_lines, target_lang)
            self._lru_put(self._translation_cache, cache_key, translated_lines)

        result = list(lines)
        for index, translated in zip(non_empty_indices, translated_lines):
            result[index] = translated
        return result

    @staticmethod
    def _google_translate_batch(lines: List[str], target_lang: str) -> List[str]:
        language = config_lyrics.GOOGLE_LANGUAGE_CODES.get(target_lang, target_lang.lower())
        response = requests.get(
            "https://translate.googleapis.com/translate_a/single",
            params={"client": "gtx", "sl": "auto", "tl": language, "dt": "t", "q": "\n".join(lines)},
            timeout=30,
            headers={"User-Agent": "Mozilla/5.0"},
        )
        response.raise_for_status()
        translated = "".join(chunk[0] for chunk in response.json()[0] if chunk and chunk[0])
        translated_lines = translated.split("\n")
        while len(translated_lines) < len(lines):
            translated_lines.append("")
        return translated_lines[: len(lines)]

    @staticmethod
    def _lru_put(cache: collections.OrderedDict, key: str, value: Any) -> None:
        cache[key] = value
        cache.move_to_end(key)
        if len(cache) > config_lyrics.TRANSLATION_CACHE_MAX:
            cache.popitem(last=False)

    @staticmethod
    def get_custom(video_id: str) -> Optional[Dict[str, str]]:
        for extension in ("lrc", "ttml"):
            path = config_dirs.CUSTOM_LYRICS_DIR / f"{video_id}.{extension}"
            if path.is_file():
                return {"content": path.read_text(encoding="utf-8"), "format": extension}
        return None

    @staticmethod
    def save_custom(video_id: str, content: str, lyric_format: str) -> None:
        for extension in ("lrc", "ttml"):
            path = config_dirs.CUSTOM_LYRICS_DIR / f"{video_id}.{extension}"
            if path.is_file():
                path.unlink()
        (config_dirs.CUSTOM_LYRICS_DIR / f"{video_id}.{lyric_format}").write_text(content, encoding="utf-8")

    @staticmethod
    def delete_custom(video_id: str) -> bool:
        deleted = False
        for extension in ("lrc", "ttml"):
            path = config_dirs.CUSTOM_LYRICS_DIR / f"{video_id}.{extension}"
            if path.is_file():
                path.unlink()
                deleted = True
        return deleted
