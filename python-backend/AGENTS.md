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

The matching legacy handlers have been removed from `server.py` after each
family was ported.

The streaming family (`/stream`, `/stream-prepare`, `/audio-stream` and its
`/warm` variant) is served by `StreamService` in `src/lib/music/stream.py`,
registered as `app.extensions["stream_service"]`. It owns the browser-cookie
extraction cache and the resolved-URL cache, and resolves auth through the
`YTDLP` instance (`app.extensions["ytdlp"]`, built with the active profile and
music-session state). yt-dlp client options, the audio format, the browser
cookie file, and `STREAM_ATTEMPTS` live in `ConfigYTDLP` (`src/config.py`).
The shared `_is_hard_error` helper stays in `server.py` until the download and
export families that also use it are ported.

## Startup and Runtime Helpers

Non-route infrastructure ported out of `server.py`'s module top-level:

- IPv4-first outbound resolution is now `setup_ipv4_first()` in
  `src/lib/runtime/network.py`, called at the start of `create_app()` and
  toggled by `Config.PREFER_IPV4`. It mirrors the `setup_debug()` pattern so it
  can be deactivated from config.

## Remaining Server Families

The remaining `server.py` routes should be migrated by coherent subject, not in
file order:

1. Music library and detail pages
   - `/library/*`, `/playlist/*`, `/radio/*`
   - `/album/*`, `/artist/*`, `/song/meta/*`, `/song/credits/*`
   - Local-profile SQLite behavior and playlist/album disk caches.

2. Discovery
   - `/podcast/*`, `/mood/*`
   - Any remaining response-normalization helpers they require.

3. Download, export, and tool updates
   - `/song/download/*`, `/song/cached/*`, `/downloads/queue`
   - `/song/export/*`, `/ffmpeg/*`, `/ytdlp/*`
   - Download state, ffmpeg discovery, export status, and update workflows.

4. Operations and integrations
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
