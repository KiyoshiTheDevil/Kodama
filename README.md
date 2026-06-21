<div align="center">
  <img width="96" alt="Kodama Logo" src="https://github.com/user-attachments/assets/bcf17683-7660-4bae-ad16-2cf474742074">
  <h1>Kodama</h1>
  <p>An unofficial YouTube Music desktop client — built with Tauri 2 &amp; React.</p>

  [![Version](https://img.shields.io/badge/version-1.0.0-a855f7?style=flat-square)](https://github.com/KiyoshiTheDevil/Kodama/releases/latest)
  [![Platform](https://img.shields.io/badge/platform-Windows-0078d4?style=flat-square&logo=windows&logoColor=white)](https://github.com/KiyoshiTheDevil/Kodama/releases/latest)
  [![Tauri](https://img.shields.io/badge/Tauri-2.x-24c8db?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app)
  [![Crowdin](https://img.shields.io/badge/translate-Crowdin-2e3340?style=flat-square&logo=crowdin&logoColor=white)](https://crowdin.com/project/kiyoshi-music)
  [![License](https://img.shields.io/badge/license-Personal_Use-ef4444?style=flat-square)](#disclaimer)
</div>

---

<div align="center">
  <img src="docs/screenshot-home.png" alt="Home Screen" width="720">
</div>

---

## Features

**Playback**
- Full YouTube Music playback with queue management
- Crossfade between tracks
- Adjustable volume with persistent state
- Keyboard shortcuts for all playback controls

**Library & Discovery**
- Browse your YouTube Music library, playlists, albums and artists
- Home feed, charts and recommendations
- Search with instant results
- Offline mode indicator

**Lyrics**
- Synced and static lyrics
- Romaji transliteration for Japanese tracks
- Translation support
- Multiple lyrics provider fallback

**Visuals & Themes**
- Dark theme with customisable accent colour
- Ambient visualizer behind the player
- Custom font selection and UI zoom
- High contrast accessibility mode

**OBS / Streaming Overlay**
- Built-in Now-Playing widget server — point your OBS browser source at `http://localhost:9847/overlay`
- Fully configurable via in-app settings: background, blur, border, shadow, typography, art size
- Per-corner style — mix rounded and beveled corners independently on both the widget frame and album art
- Save, load, export and import custom overlay profiles

**Integrations**
- Discord Rich Presence
- System tray with media controls
- Auto-updater with in-app changelog

**Other**
- Google account optional — log in only if you want library sync
- German & English UI, more languages via [Crowdin](https://crowdin.com/project/kiyoshi-music)

---

## Screenshots

| Home | Lyrics | Playlist |
|:----:|:------:|:--------:|
| ![Home](docs/screenshot-home.png) | ![Lyrics](docs/screenshot-lyrics.png) | ![Playlist](docs/screenshot-playlist.png) |

---

## Download

Head to the [**Releases**](https://github.com/KiyoshiTheDevil/Kodama/releases/latest) page and grab the latest Windows installer (`.exe`).

> **Linux:** Not officially supported. - No support planned in the future.

> **Google Account:** Not required to use the app. Only needed if you want to sync your YouTube Music library and playlists.

---

## Help Translate

Want Kodama in your language?  
Join the translation effort on **[Crowdin](https://crowdin.com/project/kiyoshi-music)** — every contribution helps! (⁠≧⁠▽⁠≦⁠)

---

## Known Issues

| Issue | Status |
|---|---|
| None right now | Yay! |

Found a bug? Please report it in the [**Issues**](https://github.com/KiyoshiTheDevil/Kodama/issues) tab — thank you!

---

## For Developers

### Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [Rust](https://rustup.rs/) (stable)
- [Python](https://www.python.org/) 3.10+

### Setup

```bash
# 1. Clone
git clone https://github.com/KiyoshiTheDevil/Kodama.git
cd Kodama

# 2. Frontend dependencies
npm install

# 3. Python backend dependencies
cd python-backend
pip install -r requirements.txt
cd ..

# 4. (Optional) Authenticate with your YouTube account
cd python-backend
python setup_auth.py
cd ..
```

### Run in development mode

```bash
npm run tauri dev
```

### Build

```bash
npm run tauri build
```

---

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a full version history.

---

## Disclaimer

Kodama is an unofficial client and is not affiliated with or endorsed by YouTube or Google.  
It uses the unofficial YouTube Music API for personal use only. Use at your own risk.
