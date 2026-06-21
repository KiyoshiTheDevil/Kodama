# Kodama — Claude Code Hinweise

## Projekttyp
Dies ist eine **Tauri 2.x Desktop-App** (React/JSX Frontend + Python Flask Backend).

## Verifikation nach Code-Änderungen
Browser-basiertes Preview (`preview_start`) ist **nicht anwendbar** — die App nutzt Tauri-spezifische APIs (`@tauri-apps/api`, `@tauri-apps/plugin-dialog`, etc.) die im Browser nicht verfügbar sind und sofort Fehler werfen.

**Korrekte Verifikationsmethode:** `npx vite build` — prüft ob der Code fehlerfrei kompiliert.

```bash
cd /c/Users/bexga/Downloads/kiyoshi-music/kiyoshi-music && npx vite build
```

Ein erfolgreicher Build (`✓ built in X.XXs`) ohne Fehler ist die geeignete Verifikation für dieses Projekt. Die bekannten Tauri-Warnings über dynamic/static imports sind pre-existing und können ignoriert werden.

## Struktur
- `src/App.jsx` — Gesamte Frontend-Logik (React, ~5000+ Zeilen)
- `src/i18n.js` — Übersetzungen (Deutsch + Englisch)
- `python-backend/server.py` — Flask-Backend (Lyrics-Proxy, YTMusic API, Cache)
- `src-tauri/` — Tauri-Konfiguration und Rust-Wrapper
