#!/usr/bin/env bash
#
# Kodama macOS installer.
#   curl -fsSL https://raw.githubusercontent.com/KiyoshiTheDevil/Kodama/master/install.sh | bash
#
# Downloading the .dmg with curl means macOS never attaches the com.apple.quarantine
# flag, so Gatekeeper does not block the (unsigned) app - no "is damaged", no right-click,
# no xattr. The app updates itself afterwards via the in-app updater.
#
# Plain ASCII only and ${braced} variables on purpose: macOS still ships bash 3.2, which
# mis-parses a multibyte char placed right after a $variable.
#
set -euo pipefail

REPO="KiyoshiTheDevil/Kodama"
APP="/Applications/Kodama.app"
LATEST_JSON="https://raw.githubusercontent.com/${REPO}/master/updates/latest.json"

if [ "$(uname)" != "Darwin" ]; then
  echo "This installer is for macOS only." >&2
  exit 1
fi

echo "==> Checking the current Kodama version..."
# latest.json is the single source of truth (updated on every release) - don't rely on the
# /releases list ordering, which GitHub does not return strictly newest-first.
VER=$(curl -fsSL "${LATEST_JSON}" | grep '"version"' | head -1 | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')
if [ -z "${VER:-}" ]; then
  echo "Could not read the latest version from ${LATEST_JSON}" >&2
  exit 1
fi
VNUM="${VER#v}"
DMG_URL="https://github.com/${REPO}/releases/download/${VER}/Kodama_${VNUM}_aarch64.dmg"

TMP="$(mktemp -d)"
trap 'rm -rf "${TMP}"' EXIT

echo "==> Downloading Kodama ${VER} ..."
curl -fsSL "${DMG_URL}" -o "${TMP}/Kodama.dmg"

echo "==> Mounting..."
MOUNT=$(hdiutil attach "${TMP}/Kodama.dmg" -nobrowse -noautoopen | tail -n1 | sed -E 's/^.*(\/Volumes\/.*)$/\1/')
if [ -z "${MOUNT:-}" ] || [ ! -d "${MOUNT}/Kodama.app" ]; then
  echo "Mounted volume did not contain Kodama.app." >&2
  exit 1
fi

echo "==> Installing to /Applications..."
rm -rf "${APP}"
cp -R "${MOUNT}/Kodama.app" /Applications/
hdiutil detach "${MOUNT}" -quiet || true

# Belt-and-suspenders: strip quarantine in case it was set somehow.
xattr -dr com.apple.quarantine "${APP}" 2>/dev/null || true

echo "==> Kodama ${VER} installed. Launching..."
open "${APP}"
