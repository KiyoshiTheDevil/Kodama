#!/usr/bin/env bash
#
# Upload built HTDemucs ONNX models to a Cloudflare R2 bucket via wrangler.
#
# Usage:
#   ./scripts/upload-htdemucs.sh <bucket-name> [models_dir]
#
# Example:
#   ./scripts/upload-htdemucs.sh composer-vocal-models ./htdemucs-onnx-out
#
# Requires wrangler installed and authenticated against the right account:
#   pnpm dlx wrangler login

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <bucket-name> [models_dir]" >&2
  exit 1
fi

BUCKET="$1"
MODELS_DIR="${2:-./htdemucs-onnx-out}"

if [[ ! -d "${MODELS_DIR}" ]]; then
  echo "ERROR: models dir ${MODELS_DIR} does not exist." >&2
  echo "Run ./scripts/build-htdemucs-onnx.sh first." >&2
  exit 1
fi

echo "==> applying CORS rules to ${BUCKET}"
# AllowedOrigins:
#   - production site
#   - local Vite dev (5173) + preview (4173), both localhost and 127.0.0.1
#   - any Cloudflare Workers/Pages preview deployment under boidushyabhattacharya.workers.dev
# ExposeHeaders MUST include Content-Length so the in-browser download progress
# bar can read the response size cross-origin (see src/audio/separation/model-cache.ts).
CORS_FILE="$(mktemp -t r2-cors-XXXX.json)"
trap 'rm -f "${CORS_FILE}"' EXIT
cat > "${CORS_FILE}" <<'JSON'
{
  "rules": [
    {
      "allowed": {
        "origins": [
          "https://composer.boidu.dev",
          "http://localhost:5173",
          "http://127.0.0.1:5173",
          "http://localhost:4173",
          "http://127.0.0.1:4173",
          "https://*.boidushyabhattacharya.workers.dev"
        ],
        "methods": ["GET", "HEAD"],
        "headers": ["Range"]
      },
      "exposeHeaders": ["Content-Length", "Content-Type", "ETag"],
      "maxAgeSeconds": 86400
    }
  ]
}
JSON
pnpm dlx wrangler r2 bucket cors set "${BUCKET}" --file "${CORS_FILE}"

for variant in fp16 fp32; do
  file="${MODELS_DIR}/htdemucs_${variant}.onnx"
  if [[ ! -f "${file}" ]]; then
    echo "skip: ${file} not present"
    continue
  fi
  echo "==> uploading htdemucs_${variant}.onnx ($(du -h "${file}" | cut -f1))"
  pnpm dlx wrangler r2 object put --remote "${BUCKET}/htdemucs_${variant}.onnx" \
    --file="${file}" \
    --content-type=application/octet-stream \
    --cache-control='public, max-age=31536000, immutable'
done

echo ""
echo "Done. Verify the files are reachable via your bound custom domain, e.g.:"
echo "  curl -I https://models.composer.boidu.dev/htdemucs_fp16.onnx"
