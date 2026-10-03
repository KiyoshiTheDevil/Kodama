# Kodama — Claude Code Hinweise

## Projekttyp
Dies ist eine **Tauri 2.x Desktop-App** (React/JSX Frontend + Python Flask Backend).

## Verifikation nach Code-Änderungen
**Immer:** erst Lint, dann Build. Der Build allein meldet keine undefinierten Bezeichner.

```bash
cd /c/Users/bexga/Downloads/kiyoshi-music/kiyoshi-music && npm run lint && npx vite build
```

Ein erfolgreicher Build (`✓ built in X.XXs`) ohne Lint-Fehler ist die Grundprüfung. Die bekannten Tauri-Warnings über dynamic/static imports sind pre-existing und können ignoriert werden.

### Im Browser bedienen (mit Tauri-Attrappe)
Die App nutzt Tauri-APIs, die im normalen Browser fehlen (`src/ui/window-chrome.jsx` ruft `getCurrentWebviewWindow()` schon beim Laden). Mit einer kleinen Attrappe lassen sich einzelne Fenster trotzdem im Browser-Bereich laden und anklicken, z. B. der Overlay-Editor (`?overlayEditor=1`) oder der Store (`?store=1`):

1. Temporäre Seite `ovl-editor-test.html` im Projektordner anlegen: Kopf wie `index.html` (`/boot.css`, `/css/all.min.css`), `<div id="root">`, dann **vor** `/boot.js` und `/src/main.jsx` dieses Skript:
   ```html
   <script>
     window.__TAURI_INTERNALS__ = {
       metadata: { currentWindow: { label: "overlay-editor" }, currentWebview: { windowLabel: "overlay-editor", label: "overlay-editor" } },
       invoke: async () => null, transformCallback: () => 0, unregisterCallback: () => {}, convertFileSrc: (s) => s,
     };
     window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener: () => {} };
     // PFLICHT: nie ins laufende Backend schreiben. Der Editor schickt beim Öffnen sein Dokument
     // per POST und würde sonst das aktive OBS-Overlay des Nutzers ersetzen.
     const realFetch = window.fetch.bind(window);
     window.fetch = (url, opts) => (opts && opts.method === "POST" ? Promise.resolve(new Response("{}")) : realFetch(url, opts));
   </script>
   ```
2. Über den laufenden Vite-Dev-Server öffnen: `http://localhost:1421/ovl-editor-test.html?overlayEditor=1` (läuft `npm run tauri dev`, ist Port 1421 schon belegt; dann einfach dorthin navigieren).
3. Klicks über `find`-Refs oder Koordinaten aus einem frischen Screenshot (der Browser-Bereich ändert seine Größe), Ergebnisse per JavaScript im DOM prüfen. Ein verdeckter Tab zeichnet keine Frames: für Animationen den Tab nach vorne holen.
4. Die Testseite danach **löschen**, sie gehört nicht ins Repo.

Der OBS-Renderer (`_OVERLAY_HTML` in `python-backend/server.py`) lässt sich genauso prüfen: den HTML-Block als Testseite ins Projekt schreiben, laden, per `postMessage({ __overlayDoc: doc })` ein Dokument geben.

## Struktur
- `src/App.jsx` — Gesamte Frontend-Logik (React, ~5000+ Zeilen)
- `src/i18n.js` — Übersetzungen (Deutsch + Englisch)
- `python-backend/server.py` — Flask-Backend (Lyrics-Proxy, YTMusic API, Cache)
- `src-tauri/` — Tauri-Konfiguration und Rust-Wrapper
