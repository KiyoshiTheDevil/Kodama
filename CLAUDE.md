# Kodama — Claude Code Hinweise

## Projekttyp
Dies ist eine **Tauri 2.x Desktop-App** (React/JSX Frontend + Python Flask Backend).

## Verifikation nach Code-Änderungen
Browser-basiertes Preview (`preview_start`) ist **nicht anwendbar** — die App nutzt Tauri-spezifische APIs (`@tauri-apps/api`, `@tauri-apps/plugin-dialog`, etc.), die im Browser nicht vollständig verfügbar sind.

Frontend-Änderungen mit Lint und Produktions-Build prüfen:

```bash
npm run lint
npm run build
```

Backend-Änderungen aus `python-backend/` mit der Projekt-Virtualenv prüfen:

```bash
.venv/bin/python -m unittest discover -s tests -p 'test_*.py'
```

Die Browser-e2e-Suite läuft mit `npm run e2e:browser`. Dafür müssen die Ports 1421 und 9847 frei sein; der Harness bricht mit einer klaren Meldung ab, wenn bereits die Entwicklungs-App oder das echte Backend darauf läuft.

## Struktur
- `src/app/` — React-Komposition, globale Hooks, Styles und Diagnose-UI
- `src/features/` — fachlich getrennte Frontend-Features wie Player, Musik, Lyrics, Profile und Einstellungen
- `src/shared/` — gemeinsame API-, i18n-, Hook-, Icon- und UI-Bausteine
- `python-backend/server.py` — schlanker ausführbarer Flask-Einstiegspunkt
- `python-backend/src/routes/` — Flask-Blueprints nach Domäne
- `python-backend/src/lib/` — Backend-Dienste, Integrationen und gemeinsame Logik
- `src-tauri/` — Tauri-Konfiguration und Rust-Wrapper
