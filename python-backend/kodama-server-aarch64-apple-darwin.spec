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

a = Analysis(
    ['server.py'],
    pathex=[],
    binaries=[],
    datas=[(_ytm_locales, 'ytmusicapi/locales'), (_composer_dist, 'composer_dist')] + _extra_datas,
    hiddenimports=["pykakasi", "jaconv"],
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
    name='kodama-server-aarch64-apple-darwin',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,  # UPX-packed binaries are unreliable on macOS (Gatekeeper/codesign)
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch='arm64',
    codesign_identity=None,
    entitlements_file=None,
)
