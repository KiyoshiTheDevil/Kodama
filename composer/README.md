<p align="center">
  <img src="public/logo.svg" width="80" height="80" alt="Composer" />
</p>

<h1 align="center">Composer</h1>

<p align="center">
  The lyrics editor for <a href="https://betterlyrics.org">Better Lyrics</a>.<br/>
  Create word-synced TTML lyrics with a visual timeline, tap-to-sync, and live preview.
</p>

<p align="center">
  <a href="https://composer.boidu.dev"><img src="https://img.shields.io/badge/Open-composer.boidu.dev-F50032?style=flat-square" alt="Open Composer" /></a>
  <a href="https://www.w3.org/TR/2018/REC-ttml1-20181108/"><img src="https://img.shields.io/badge/TTML%201-W3C%20Compliant-4caf50?style=flat-square" alt="TTML 1 W3C Compliant" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-AGPL%203.0-2196f3?style=flat-square" alt="AGPL 3.0 License" /></a>
  <a href="https://betterlyrics.org"><img src="https://img.shields.io/badge/Built%20for-Better%20Lyrics-F50032?style=flat-square" alt="Built for Better Lyrics" /></a>
</p>

---

## Why Composer

Tools like [AMLL TTML Tool](https://amll-ttml-tool.stevexmh.net/) are powerful and feature-rich. If you know what you're doing, they're great. But if you're new to lyrics syncing, the learning curve is steep. There's no clear starting point, the interface assumes familiarity with TTML structure, and you're expected to already understand concepts like word-level timing and agent roles.

Composer takes a different approach. It's built around a linear mental model: import, edit, sync, export. Each tab is one step. You don't need to know what TTML is to get started. Just paste lyrics, tap along with the music, and you get a synced file.

For users who want more control, the Timeline view is a full GUI where you can do everything without leaving that single screen. Import audio, add lyrics, drag word blocks on the waveform, split syllables, assign agents, preview your work. It's designed so beginners start with the guided tabs and naturally graduate to the Timeline as they get comfortable.

## What it does

Composer turns plain lyrics into precisely timed TTML files. You import audio, paste your lyrics, tap along to sync each word, then export the result. Everything runs in the browser with no server required.

Four-step workflow:

1. **Import** your audio (MP3, WAV, M4A, OGG, FLAC) or paste a YouTube URL
2. **Edit** your lyrics, assign agents (singers), add background vocals
3. **Sync** by tapping along with the music, or drag word blocks on the Timeline
4. **Export** as TTML, or save a project file to continue later

## Features

- **W3C TTML 1 compliant** - Standard XML output, works in any TTML 1 parser
- **Linked groups** - Group repeating sections (choruses, hooks). Edit one instance, every linked instance updates.
- **Tap-to-sync** - Press Space in time with the music to stamp each word
- **YouTube import** - Paste a video URL to pull the audio straight in, no manual download needed
- **Timeline editor** - DAW-style view with draggable word blocks on a waveform
- **Snap (magnet)** - Word edges magnetically lock onto neighbors and the playhead when dragging or resizing
- **Multiple agents** - Assign lines to different singers with distinct colors
- **Background vocals** - Separate track for backing vocals with `x-bg` TTML role
- **Syllable splitting** - Break words into individually timed syllables
- **Live preview** - See your lyrics rendered in real time with Better Lyrics' engine
- **Lyrics import** - Drop .lrc, .srt, .ttml, or .txt files to get started quickly
- **Project files** - Save and share your work as JSON
- **Keyboard-driven** - Comprehensive shortcuts for every action
- **Client-side only** - No uploads, no accounts, your audio never leaves your machine

## Standards

Composer emits **TTML 1** ([W3C Recommendation, Nov 2018](https://www.w3.org/TR/2018/REC-ttml1-20181108/)) compliant XML. Linked groups and per-instance metadata are exposed via foreign-namespace extensions the spec explicitly permits, so files round-trip through any TTML 1 parser.

For the full breakdown, see **Help → TTML & standards** in-app.

## Self-hosting

Composer is a static site with zero backend dependencies. All processing happens in the browser.

```bash
pnpm install
pnpm build
```

Serve the `dist/` folder with any static file server. That's it.

```bash
# Example with any static server
npx serve dist

# Or drop dist/ into nginx, Caddy, Vercel, Netlify, GitHub Pages, etc.
```

## Development

```bash
pnpm install
pnpm dev               # Start dev server with HMR
pnpm test              # Run all tests (unit + browser)
pnpm test:unit         # Unit tests only (jsdom)
pnpm test:component    # Component tests only (Chromium via Playwright)
pnpm lint:fix          # Format and lint
pnpm typecheck         # Type check
```

## Vocal separation hosting

Composer ships an optional HTDemucs (Hybrid Transformer Demucs v4) vocal-separation feature that runs entirely in the browser via ONNX Runtime Web (WebGPU primary, WASM fallback). The model file is too large for Cloudflare Pages' 25 MB asset limit, so it is **not** bundled — instead it's served from a public Cloudflare R2 bucket. Egress from R2 is free, and serving via a custom domain keeps the file cached at Cloudflare's edge without going through a Worker.

If `VITE_VOCAL_MODEL_BASE_URL` is unset, the vocal-separation dropdown is hidden entirely.

### Where the model comes from

HTDemucs is the **official Facebook AI Research model** (`facebookresearch/demucs`, the "Hybrid Transformer" variant published Nov 2022). The PyTorch weights are auto-downloaded from `dl.fbaipublicfiles.com` by the `demucs` Python package — you don't grab them manually. The two community ONNX export tools are:

- **`sevagh/demucs.onnx`** — the most complete PyTorch → ONNX export pipeline; ships a forked `demucs` package that pulls STFT/iSTFT outside the graph so it exports cleanly. This is what the build script below uses.
- **`gianlourbano/demucs-onnx`** — onnxruntime-web reference implementation; useful for cross-referencing the JS-side STFT/inference shape.

### Build the ONNX models

Two scripts in `scripts/` do the work:

```bash
# 1. Build fp32 + fp16 ONNX models. Outputs ./htdemucs-onnx-out/.
#    Takes ~10–30 min on CPU and needs ~10 GB of free disk while building.
./scripts/build-htdemucs-onnx.sh

# 2. Upload to your R2 bucket (requires `wrangler login` first).
./scripts/upload-htdemucs.sh composer-vocal-models
```

`build-htdemucs-onnx.sh` will clone `sevagh/demucs.onnx` into `/tmp/composer-htdemucs-build/`, spin up a Python venv, run the official converter, then quantize the fp32 export to fp16 via `onnxconverter-common`. It prints the model's input/output names + SHA-256 at the end — verify those against `src/audio/separation/worker.ts` and `src/audio/separation/model-registry.ts`.

### One-time R2 setup

1. Create a public R2 bucket (e.g. `composer-vocal-models`).
2. Bind a custom domain to the bucket (e.g. `models.composer.boidu.dev`). **Avoid `r2.dev`** — it's rate-limited and intended for development.
3. Add a Cloudflare page rule `Cache Everything` for that hostname so binary files are edge-cached.
4. Add a CORS rule allowing your site origin(s).
5. Set `VITE_VOCAL_MODEL_BASE_URL=https://models.composer.boidu.dev` at build time.

Cost: free egress; ~$0.0015/month storage for the fp16 model.

## Tech stack

React, TypeScript, Vite, TailwindCSS v4, Zustand, Vitest

## License

Composer is dual-licensed.

The open-source license is [AGPL-3.0](LICENSE). You are free to use, modify, and self-host Composer under its terms.

A commercial license is also available. It removes the AGPL copyleft obligations and covers commercial use of Composer's output, such as a record label or distributor publishing generated lyrics as part of a release. For commercial or enterprise licensing, reach out to composer@boidu.dev.
