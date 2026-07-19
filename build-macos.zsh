#!/usr/bin/env zsh
# Build a release-ready Kodama macOS app, including the Python sidecar.

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
TARGET="aarch64-apple-darwin"
PYTHON="$ROOT_DIR/python-backend/.venv/bin/python"

fail() {
  print -u2 -- "Error: $*"
  exit 1
}

[[ "$(uname -s)" == "Darwin" ]] || fail "This script must run on macOS."
[[ "$(uname -m)" == "arm64" ]] || fail "Only Apple Silicon is supported by the bundled macOS sidecar."
command -v node >/dev/null || fail "Node.js 22 or newer is required."
command -v npm >/dev/null || fail "npm is required."
command -v python3 >/dev/null || fail "Python 3 is required."

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
(( NODE_MAJOR >= 22 )) || fail "Node.js 22 or newer is required (found $(node --version))."

cd "$ROOT_DIR"

print -- "==> Installing frontend dependencies"
npm install

print -- "==> Building Composer"
(
  cd composer
  npx --yes pnpm@9 install --frozen-lockfile
  npx --yes pnpm@9 build
)

if [[ ! -x "$PYTHON" ]]; then
  print -- "==> Creating Python virtual environment"
  python3 -m venv "$ROOT_DIR/python-backend/.venv"
fi

print -- "==> Installing Python build dependencies"
"$PYTHON" -m pip install --upgrade pip
"$PYTHON" -m pip install -r "$ROOT_DIR/python-backend/requirements.txt" pyinstaller

print -- "==> Building the Python sidecar"
(
  cd python-backend
  "$PYTHON" -m PyInstaller kodama-server-aarch64-apple-darwin.spec \
    --distpath ../src-tauri/binaries \
    --workpath build_tmp/kodama-server-aarch64-apple-darwin
)
chmod +x "$ROOT_DIR/src-tauri/binaries/kodama-server-aarch64-apple-darwin"

print -- "==> Building the macOS app"
npm run tauri -- build --target "$TARGET"

print -- "Build complete. Artifacts:"
print -- "  $ROOT_DIR/src-tauri/target/$TARGET/release/bundle/"
