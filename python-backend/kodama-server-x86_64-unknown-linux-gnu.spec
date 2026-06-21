# -*- mode: python ; coding: utf-8 -*-
import os, importlib.util

_ytm = importlib.util.find_spec('ytmusicapi')
_ytm_locales = os.path.join(os.path.dirname(_ytm.origin), 'locales')

# Vendored Boidu Composer — built static site (repo ./composer/dist) bundled as data,
# extracted to sys._MEIPASS/composer_dist at runtime (served by _composer_dist_dir in
# server.py). Must be built (pnpm build) before this runs.
_composer_dist = os.path.abspath(os.path.join(SPECPATH, '..', 'composer', 'dist'))

a = Analysis(
    ['server.py'],
    pathex=[],
    binaries=[],
    datas=[(_ytm_locales, 'ytmusicapi/locales'), (_composer_dist, 'composer_dist')],
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
    name='kodama-server-x86_64-unknown-linux-gnu',
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
