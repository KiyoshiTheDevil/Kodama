<div align="center">
</div>

<div align="center">
  <h1>Kodama</h1>
  <p>An unofficial YouTube Music desktop client — built with Tauri 2 &amp; React.</p>

  [![Version](https://img.shields.io/badge/version-1.0.0-a855f7?style=flat-square)](https://github.com/KiyoshiTheDevil/Kodama/releases/latest)
  [![Platform](https://img.shields.io/badge/platform-Windows-0078d4?style=flat-square&logo=windows&logoColor=white)](https://github.com/KiyoshiTheDevil/Kodama/releases/latest)
  [![Tauri](https://img.shields.io/badge/Tauri-2.x-24c8db?style=flat-square&logo=tauri&logoColor=white)](https://tauri.app)
  [![Crowdin](https://img.shields.io/badge/translate-Crowdin-2e3340?style=flat-square&logo=crowdin&logoColor=white)](https://crowdin.com/project/kiyoshi-music)
  [![License](https://img.shields.io/badge/license-Personal_Use-ef4444?style=flat-square)](#disclaimer)
</div>

---

This page is under construction! Will be updated soon!
=='<img width="210" height="48" alt="Kodama Logo Full" src="https://github.com/user-attachments/assets/e003560b-1760-4657-a8fc-454195293937" />


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
