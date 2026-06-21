#!/usr/bin/env bash
#
# Build HTDemucs ONNX models for Composer's vocal separation feature.
#
# Pipeline:
#   1. Clones github.com/sevagh/demucs.onnx (with its forked `demucs` submodule
#      that exposes the spectrogram path as a standalone helper).
#   2. Creates a Python venv with PyTorch + the forked demucs + onnx tooling.
#   3. Downloads the official HTDemucs PyTorch weights via the `demucs` package.
#      (The weights come from dl.fbaipublicfiles.com and are cached in
#      ~/.cache/torch/hub/checkpoints/ — no manual download is required.)
#   4. Exports htdemucs to ONNX (fp32).
#   5. Quantizes the fp32 export to fp16 using onnxconverter-common.
#   6. Prints SHA-256 hashes and the wrangler commands you can run to upload to
#      your R2 bucket (see scripts/upload-htdemucs.sh for the same, automated).
#
# Usage:
#   ./scripts/build-htdemucs-onnx.sh [output_dir]
#
# Requirements on the host:
#   - python3 (3.10+ recommended)
#   - git
#   - ~6 GB free disk + ~10 GB while building
#
# Heads-up: ONNX export is heavy (>10 min on CPU). Run on a machine with RAM
# headroom — the fp32 graph alone is ~600 MB.

set -euo pipefail

OUT_DIR="${1:-./htdemucs-onnx-out}"
WORK_DIR="${WORK_DIR:-/tmp/composer-htdemucs-build}"
DEMUCS_REPO="https://github.com/sevagh/demucs.onnx.git"
DEMUCS_REPO_DIR="${WORK_DIR}/demucs.onnx"
VENV_DIR="${WORK_DIR}/venv"

mkdir -p "${OUT_DIR}" "${WORK_DIR}"

echo "==> Cloning sevagh/demucs.onnx into ${DEMUCS_REPO_DIR}"
# The repo's .gitmodules references SSH URLs for its C++ inference vendors
# (ort-builder, libnyquist, etc.) which fail without a GitHub SSH key — and we
# don't need those for the Python ONNX export anyway. We only need the
# `demucs-for-onnx` submodule (the forked demucs package). Clone shallow first,
# rewrite that one submodule URL to HTTPS, then init only that submodule.
if [[ ! -d "${DEMUCS_REPO_DIR}" ]]; then
  git clone "${DEMUCS_REPO}" "${DEMUCS_REPO_DIR}"
else
  (cd "${DEMUCS_REPO_DIR}" && git pull)
fi

# Selectively init only the demucs-for-onnx submodule, rewriting SSH -> HTTPS.
(
  cd "${DEMUCS_REPO_DIR}"
  # Belt-and-suspenders: rewrite SSH GitHub URLs to HTTPS for this clone.
  git config --local url."https://github.com/".insteadOf "git@github.com:"
  git submodule init demucs-for-onnx
  git submodule update --init --depth 1 demucs-for-onnx
)

echo "==> Creating Python venv at ${VENV_DIR}"
python3 -m venv "${VENV_DIR}"
# shellcheck disable=SC1091
source "${VENV_DIR}/bin/activate"

echo "==> Installing dependencies"
pip install --upgrade pip
pip install \
  "torch>=2.1" \
  "torchaudio>=2.1" \
  onnx \
  onnxruntime \
  onnxconverter-common \
  onnxscript \
  numpy \
  einops \
  julius \
  lameenc \
  openunmix \
  tqdm \
  dora-search

# The submodule at demucs-for-onnx/ is the forked demucs package that exposes
# standalone_spec / standalone_magnitude needed by the converter.
pip install -e "${DEMUCS_REPO_DIR}/demucs-for-onnx"

echo "==> Exporting htdemucs to ONNX (fp32) — this can take 10+ minutes"
FP32_DIR="${WORK_DIR}/fp32"
mkdir -p "${FP32_DIR}"
python "${DEMUCS_REPO_DIR}/scripts/convert-pth-to-onnx.py" "${FP32_DIR}"

# The converter writes the graph to <model_name>.onnx and dumps weights to a
# sidecar <model_name>.onnx.data (the model exceeds the 2 GB protobuf limit
# when serialized inline, so PyTorch defaults to external data). We merge them
# back into a single file per variant so the browser only needs one fetch.
SRC_FP32="${FP32_DIR}/htdemucs.onnx"
if [[ ! -f "${SRC_FP32}" ]]; then
  echo "ERROR: expected ${SRC_FP32} but it does not exist. Conversion failed." >&2
  exit 1
fi

echo "==> Merging external data + quantizing to fp16"
export FP32_SRC="${SRC_FP32}"
export OUT_DIR
python - <<'PY'
import os
import onnx
from onnxconverter_common import float16

src = os.environ["FP32_SRC"]
out_dir = os.environ["OUT_DIR"]

print(f"loading {src} (auto-resolves external data sidecar)…")
model = onnx.load(src)

fp32_out = os.path.join(out_dir, "htdemucs_fp32.onnx")
print(f"writing single-file fp32 -> {fp32_out}")
onnx.save_model(model, fp32_out, save_as_external_data=False)
print(f"  size: {os.path.getsize(fp32_out):,} bytes")

print("converting to fp16…")
fp16 = float16.convert_float_to_float16(
    model,
    keep_io_types=True,  # keep float32 I/O so the worker doesn't need to convert
    disable_shape_infer=False,
)
fp16_out = os.path.join(out_dir, "htdemucs_fp16.onnx")
print(f"writing single-file fp16 -> {fp16_out}")
onnx.save_model(fp16, fp16_out, save_as_external_data=False)
print(f"  size: {os.path.getsize(fp16_out):,} bytes")
PY

echo "==> Inspecting model I/O (verify these against src/audio/separation/worker.ts)"
python - <<'PY'
import os
import onnx

for variant in ("fp16", "fp32"):
    path = os.path.join(os.environ["OUT_DIR"], f"htdemucs_{variant}.onnx")
    print(f"\n-- {path} ({os.path.getsize(path):,} bytes) --")
    m = onnx.load(path, load_external_data=False)
    print("inputs:")
    for inp in m.graph.input:
        dims = [d.dim_value if d.dim_value > 0 else (d.dim_param or "?") for d in inp.type.tensor_type.shape.dim]
        print(f"  {inp.name}: {dims}  elem_type={inp.type.tensor_type.elem_type}")
    print("outputs:")
    for out in m.graph.output:
        dims = [d.dim_value if d.dim_value > 0 else (d.dim_param or "?") for d in out.type.tensor_type.shape.dim]
        print(f"  {out.name}: {dims}  elem_type={out.type.tensor_type.elem_type}")
PY

echo "==> SHA-256"
( cd "${OUT_DIR}" && sha256sum htdemucs_fp16.onnx htdemucs_fp32.onnx )

echo ""
echo "Done. Models are in ${OUT_DIR}/"
echo ""
echo "Model I/O contract (matches sevagh's export):"
echo "  Inputs:  input  [1, 2, 343980]   stereo waveform @ 44.1 kHz, exactly 7.8s"
echo "           x      [1, 4, 2048, 336] pre-computed magnitude spectrogram"
echo "                                    (L_real, L_imag, R_real, R_imag stacked,"
echo "                                     dropping the Nyquist bin)"
echo "  Outputs: output  [1, 4, 4, 2048, 336] separated spectrograms (unused)"
echo "           add_67  [1, 4, 2, 343980]    separated waveforms — what to read"
echo "                                         Stem order: drums, bass, other, vocals"
echo ""
echo "Next steps:"
echo "  1. Upload to R2:"
echo "       ./scripts/upload-htdemucs.sh <BUCKET> ${OUT_DIR}"
echo ""
echo "  2. The worker in src/audio/separation/worker.ts currently passes only the"
echo "     waveform tensor and reads the first output. To match this model it"
echo "     needs to: pre-compute magspec from the input via the existing stft(),"
echo "     pass two named inputs (\"input\" + \"x\"), and read the \"add_67\" output"
echo "     at stem index 3 for vocals."
