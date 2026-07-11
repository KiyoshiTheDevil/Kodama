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

The matching legacy handlers have been removed from `server.py` after each
family was ported.

## Remaining Server Families

The remaining `server.py` routes should be migrated by coherent subject, not in
file order:

1. Streaming
   - `/stream/<video_id>`
   - `/stream-prepare/<video_id>`
   - `/audio-stream/<video_id>` and `/audio-stream/<video_id>/warm`
   - Browser-cookie extraction and yt-dlp stream resolution helpers.

2. Music library and detail pages
   - `/library/*`, `/playlist/*`, `/radio/*`
   - `/album/*`, `/artist/*`, `/song/meta/*`, `/song/credits/*`
   - Local-profile SQLite behavior and playlist/album disk caches.

3. Discovery
   - `/podcast/*`, `/mood/*`
   - Any remaining response-normalization helpers they require.

4. Download, export, and tool updates
   - `/song/download/*`, `/song/cached/*`, `/downloads/queue`
   - `/song/export/*`, `/ffmpeg/*`, `/ytdlp/*`
   - Download state, ffmpeg discovery, export status, and update workflows.

5. Operations and integrations
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
