# Kodama — Installations-Anleitung

## Was du brauchst (Voraussetzungen)

- Node.js (bereits installiert)
- Rust (bereits installiert)
- Python 3.8+ → https://python.org/downloads
- yt-dlp → https://github.com/yt-dlp/yt-dlp/releases (yt-dlp.exe in einen Ordner, der in PATH ist)

---

## Schritt 1 — Python-Abhängigkeiten installieren

Öffne eine Kommandozeile im Ordner `python-backend` und führe aus:

```
pip install -r requirements.txt
```

---

## Schritt 2 — YouTube-Authentifizierung einrichten (einmalig)

Führe im `python-backend`-Ordner aus:

```
python setup_auth.py
```

Die Anleitung im Terminal erklärt genau, was zu tun ist:
1. music.youtube.com im Browser öffnen (eingeloggt mit deinem Account)
2. F12 → Netzwerk-Tab → Seite neu laden
3. Auf einen Request klicken → "Request Headers" kopieren
4. In das Terminal einfügen und Enter drücken

→ Es wird eine `oauth.json` erstellt. Diese Datei niemals teilen!

---

## Schritt 3 — Python-Backend starten

Im `python-backend`-Ordner:

```
python server.py
```

Das Terminal zeigt: `Kodama Backend startet auf http://localhost:9847`
→ Dieses Fenster offen lassen!

---

## Schritt 4 — App im Entwicklungsmodus starten

Im Hauptordner `kiyoshi-music`:

```
npm install
npm run tauri dev
```

Beim ersten Mal dauert dies einige Minuten (Rust kompiliert).
Danach öffnet sich das App-Fenster.

---

## Schritt 5 — App als .exe bauen (optional)

```
npm run tauri build
```

Die fertige .exe findest du in:
`src-tauri/target/release/bundle/`

---

## Tägliche Nutzung

1. `python-backend/server.py` starten
2. Kodama App öffnen
3. Musik hören

---

## Problemlösung

**"Backend nicht erreichbar"**
→ Prüfe ob `python server.py` läuft

**"yt-dlp nicht gefunden"**  
→ yt-dlp.exe herunterladen und in `C:\Windows\System32` oder einen PATH-Ordner legen

**"oauth.json nicht gefunden"**  
→ `python setup_auth.py` nochmal ausführen
