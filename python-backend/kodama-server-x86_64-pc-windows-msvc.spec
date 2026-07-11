# -*- mode: python ; coding: utf-8 -*-


import importlib.util as _iu
import os as _os
_ytm = _iu.find_spec('ytmusicapi')
_ytm_locales = _os.path.join(_os.path.dirname(_ytm.origin), 'locales')

# Vendored Boidu Composer — its built static site (repo ./composer/dist) is bundled as
# data and extracted to sys._MEIPASS/composer_dist at runtime; the backend serves it from
# there (see _composer_dist_dir in run.py). Must be built (pnpm build) before this runs.
_composer_dist = _os.path.abspath(_os.path.join(SPECPATH, '..', 'composer', 'dist'))

# Discord feedback webhook config (gitignored). CI writes it from a secret before building;
# bundled to _MEIPASS root so _load_feedback_webhook() finds it at runtime. Absent → no feedback.
_feedback_cfg = _os.path.join(SPECPATH, 'feedback_config.json')
_extra_datas = [(_feedback_cfg, '.')] if _os.path.exists(_feedback_cfg) else []

# Last.fm API key + secret (gitignored, same pattern as feedback). CI writes it from secrets;
# bundled to _MEIPASS root so the Last.fm loader finds it at runtime. Absent → "Not configured".
_lastfm_cfg = _os.path.join(SPECPATH, 'lastfm_config.json')
if _os.path.exists(_lastfm_cfg):
    _extra_datas.append((_lastfm_cfg, '.'))

a = Analysis(
    ['run.py'],
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
    name='kodama-server-x86_64-pc-windows-msvc',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
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
