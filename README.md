<div align="center">
  <img width="210" height="48" alt="Kodama Logo Full" src="https://github.com/user-attachments/assets/e003560b-1760-4657-a8fc-454195293937" />
</div>

<div align="center">
  <p>An unofficial desktop player for YouTube Music.</p>

  [![Version](https://img.shields.io/github/v/release/KiyoshiTheDevil/Kodama?include_prereleases&style=for-the-badge&color=a855f7&label=version)](https://github.com/KiyoshiTheDevil/Kodama/releases/latest)
  [![Downloads](https://img.shields.io/github/downloads/KiyoshiTheDevil/Kodama/total?style=for-the-badge&color=a855f7&label=downloads)](https://github.com/KiyoshiTheDevil/Kodama/releases)
  [![Active users](https://img.shields.io/endpoint?style=for-the-badge&url=https%3A%2F%2Fkodama-stats.kiyoshidesign.workers.dev%2Fbadge%3Fmetric%3Dmau)](https://github.com/KiyoshiTheDevil/Kodama)
  [![Platform](https://img.shields.io/badge/platform-Windows_%7C_macOS-0078d4?style=for-the-badge)](https://github.com/KiyoshiTheDevil/Kodama/releases/latest)
  [![Tauri](https://img.shields.io/badge/Tauri-2.x-24c8db?style=for-the-badge&logo=tauri&logoColor=white)](https://tauri.app)
  [![Crowdin](https://img.shields.io/badge/translate-Crowdin-2e3340?style=for-the-badge&logo=crowdin&logoColor=white)](https://crowdin.com/project/kiyoshi-music)
  [![License](https://img.shields.io/badge/license-AGPL_v3-3da639?style=for-the-badge)](LICENSE)
</div>

---

> Kodama is in active **alpha**.

## Features

- **Synced lyrics** with word- and syllable-level timing, plus **Unison** community lyrics.
- **Lyrics Composer** for creating and editing your own.
- **Crossfade** and a built-in **visualizer**.
- **Remote control** from your phone.
- **OBS overlay** for streaming.
- **Offline downloads**, Discord Rich Presence, and Last.fm scrobbling.

## Download

Grab the latest build from the [**Releases**](https://github.com/KiyoshiTheDevil/Kodama/releases/latest) page:

**Windows:** download and run the `*_x64-setup.exe` installer from the latest release.

**macOS (Apple Silicon):** the build is **unsigned**, so install it with this command (it
downloads the latest release and avoids Gatekeeper's quarantine):

```bash
curl -fsSL https://raw.githubusercontent.com/KiyoshiTheDevil/Kodama/master/install.sh | bash
```

Automatic Updates on macOS are currently not functional. Hopefully I can fix it in the near future.

## Screenshots

<!-- TODO: add fresh screenshots of the current app (player, lyrics, library, settings). -->
No screenshot available... yet.


> A Google account is not required to use the player, Premium isn't required either.
> Please be aware, that some content might be inaccessable due to Premium restrictions.

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

## License

Kodama is licensed under the **[GNU Affero General Public License v3.0](LICENSE)** (AGPL-3.0).
You are free to use, study, modify and redistribute it, provided derivative works remain under
the same license and their source is made available.

The bundled lyrics Composer is a vendored component licensed under the AGPL-3.0 as well.

## Disclaimer

Kodama is an **unofficial** client and is **not affiliated with or endorsed by YouTube or
Google**. It relies on the unofficial YouTube Music API and is provided for personal use, as-is
and without warranty. Use at your own risk.
