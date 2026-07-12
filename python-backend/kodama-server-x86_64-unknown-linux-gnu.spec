# -*- mode: python ; coding: utf-8 -*-
import os, importlib.util

_ytm = importlib.util.find_spec('ytmusicapi')
_ytm_locales = os.path.join(os.path.dirname(_ytm.origin), 'locales')

# Vendored Boidu Composer — built static site (repo ./composer/dist) bundled as data,
# extracted to sys._MEIPASS/composer_dist at runtime (served by _composer_dist_dir in
# server.py). Must be built (pnpm build) before this runs.
_composer_dist = os.path.abspath(os.path.join(SPECPATH, '..', 'composer', 'dist'))

# Discord feedback webhook config (gitignored). CI writes it from a secret before building;
# bundled to _MEIPASS root so _load_feedback_webhook() finds it at runtime. Absent → no feedback.
_feedback_cfg = os.path.join(SPECPATH, 'feedback_config.json')
_extra_datas = [(_feedback_cfg, '.')] if os.path.exists(_feedback_cfg) else []

# Last.fm API key + secret (gitignored, same pattern as feedback). CI writes it from secrets.
_lastfm_cfg = os.path.join(SPECPATH, 'lastfm_config.json')
if os.path.exists(_lastfm_cfg):
    _extra_datas.append((_lastfm_cfg, '.'))

# PO-token stack: bundle the bgutil yt-dlp plugin + the yt-dlp-ejs solver scripts so the
# frozen server can discover them (plugins via the yt_dlp_plugins namespace, EJS via its
# data files). The node generator itself ships separately as a Tauri resource (potgen/).
from PyInstaller.utils.hooks import collect_all as _collect_all
_pot_datas = []
_pot_hidden = [
    "yt_dlp_plugins",
    "yt_dlp_plugins.extractor.getpot_bgutil",
    "yt_dlp_plugins.extractor.getpot_bgutil_http",
    "yt_dlp_plugins.extractor.getpot_bgutil_script",
]
for _pkg in ("yt_dlp_ejs", "yt_dlp_plugins"):
    _pd, _pb, _ph = _collect_all(_pkg)
    _pot_datas += _pd
    _pot_hidden += _ph

a = Analysis(
    ['server.py'],
    pathex=[],
    binaries=[],
    datas=[(_ytm_locales, 'ytmusicapi/locales'), (_composer_dist, 'composer_dist')] + _extra_datas + _pot_datas,
    hiddenimports=["pykakasi", "jaconv"] + _pot_hidden,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='kodama-server-x86_64-unknown-linux-gnu',
    debug=False,
    bootloader_ignore_signals=False,
    strip=True,  # Strip binaries on Linux for smaller size
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
