# Backend Migration Agenda

This file tracks the route split from `server.py` into `src/routes` and
`src/lib`.

## Completed

The following route families are already registered by the app factory:

- Auth: `src/routes/auth/`
- Profiles: `src/routes/profiles/`
- Last.fm: `src/routes/lastFm/`
- Lyrics and Unison: `src/routes/lyrics/`
- Composer Bridge and Composer SPA: `src/routes/composer/`
- Cache controls: `src/routes/cache/`
- Standalone/root routes: `src/routes/root/`
- Streaming: `src/routes/streaming/`
- Music library and detail pages: `src/routes/library/`
- Download, export, and tool updates: `src/routes/downloads/`

The matching legacy handlers have been removed from `server.py` after each
family was ported.

The download/export/tools family (`/song/download/*`, `/song/cached/*`,
`/downloads/queue`, `/song/export/*`, `/ffmpeg/*`, `/ytdlp/*`) lives under
`src/routes/downloads/` (`download`, `cached`, `export`, `ffmpeg`, `ytdlp`).
It is backed by three services in `src/lib/`: `DownloadService`
(`music/download.py`, owns the download status/queue and the song-cache path
helpers), `ExportService` (`music/export.py`, owns the export status and
`embed_metadata`), and `FFmpeg` (`integrations/ffmpeg.py`, discovery + version
check + Windows auto-download SSE) — registered as `app.extensions`
`download_service`, `export_service`, and `ffmpeg`. yt-dlp version check/update
moved onto the existing `YTDLP` class (`check_update`/`update`/`active_version`
/`compare_versions`). The shared yt-dlp error classifiers `is_hard_error` /
`is_unavailable` now live in `integrations/ytdlp.py` (the last `server.py`
consumer of `_is_hard_error` is gone, so it was removed there too). `FFmpeg`
resolves its dev-mode binary path from `config.PROJECT_ROOT` rather than
`__file__`, since the module no longer sits at the backend root.

The library family (`/library/*`, `/playlist/*`, `/radio/*`, `/album/*`,
`/artist/*`, `/song/meta`, `/song/credits`) lives under `src/routes/library/`,
grouped by subject (`library`, `playlist`, `radio`, `album`, `artist`, `song`)
with shared `_services.py` accessors and a `_formatters.py` track normalizer.
Local-profile SQLite goes through `Profile.local_database`/`is_local`; playlist
and album disk caches are the `Playlist` and `Album` services in
`src/lib/music/`, registered as `app.extensions["playlist_cache"]` and
`["album_cache"]`. Cache feature flags read from `CacheSettings.enabled`, the
active YTMusic client from `session.get_active_client()`, and thumbnail/artist
normalization from `YoutubeResponseMapper`. The small `/song/credits` scrape
cache stays a module-level dict in `library/song.py`.

The streaming family (`/stream`, `/stream-prepare`, `/audio-stream` and its
`/warm` variant) is served by `StreamService` in `src/lib/music/stream.py`,
registered as `app.extensions["stream_service"]`. It owns the browser-cookie
extraction cache and the resolved-URL cache, and resolves auth through the
`YTDLP` instance (`app.extensions["ytdlp"]`, built with the active profile and
music-session state). yt-dlp client options, the audio format, the browser
cookie file, and `STREAM_ATTEMPTS` live in `ConfigYTDLP` (`src/config.py`).

## Startup and Runtime Helpers

Non-route infrastructure ported out of `server.py`'s module top-level:

- IPv4-first outbound resolution is now `setup_ipv4_first()` in
  `src/lib/runtime/network.py`, called at the start of `create_app()` and
  toggled by `Config.PREFER_IPV4`. It mirrors the `setup_debug()` pattern so it
  can be deactivated from config.

## Remaining Server Families

The remaining `server.py` routes should be migrated by coherent subject, not in
file order:

1. Discovery
   - `/podcast/*`, `/mood/*`
   - Any remaining response-normalization helpers they require.

2. Operations and integrations
   - `/debug/info`
   - `/overlay/*`
   - `/remote/*`
   - `/api/local-fonts`

## Migration Recipe

For each family:

1. Read the route handlers, their helper functions, and their module-level state
   in `server.py`.
2. Move reusable behavior into the closest `src/lib/<subject>/` package. Create
   a service object when it owns mutable state or several related operations.
3. Add one file per endpoint under `src/routes/<family>/` and a blueprint in
   that package's `__init__.py`.
4. Register shared service instances in `create_app()` and expose them through
   `app.extensions`.
5. Register the blueprint in `src/routes/__init__.py`.
6. Verify syntax with AST parsing and run `git diff --check`.
7. Only after an explicit request, remove the matching legacy route, helpers,
   and obsolete module globals from `server.py`.

## Useful Checks

```sh
python3 - <<'PY'
import ast
from pathlib import Path

for path in Path("src").rglob("*.py"):
    ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
print("AST OK")
PY

git diff --check
```

The system Python available in this workspace does not include the backend's
Flask and requests dependencies. Use the project virtual environment for route
or integration tests when it is available.
