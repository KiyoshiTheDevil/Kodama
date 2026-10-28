// The equaliser on Android and in a browser. The desktop filters in the Rust audio core
// (src-tauri/src/audio/eq.rs); without that core the sound comes from the page's <audio>. Here the same curve
// runs as Web Audio: a preamp and ten peaking filters at the same frequencies and Q.
//
// Web Audio may only filter sound it is allowed to read, and googlevideo sends no CORS headers,
// so a filtered element is silent on a stream straight from there. With the equaliser in play
// the song therefore comes through the backend (/audio-chunked) into Media Source, and the
// element plays a blob: URL of the page's own. Once an element is wired to the filters it stays
// wired, so from then on every song takes that way (needsWebEq).
import { BANDS } from "./presets.js";

const Q = Math.SQRT2; // one octave, as eq.rs
let state = { enabled: false, preamp: 0, gains: BANDS.map(() => 0) };
let ctx = null;
let preampNode = null;
let filters = [];
let wired = null; // the element the graph listens to

const db = (v) => Math.pow(10, v / 20);
const audible = (s) => s.enabled && (Math.abs(s.preamp) > 0.05 || s.gains.some((g) => Math.abs(g) > 0.05));

function apply() {
  if (!ctx) return;
  const on = state.enabled;
  const t = ctx.currentTime;
  preampNode.gain.setTargetAtTime(on ? db(state.preamp) : 1, t, 0.02);
  filters.forEach((f, i) => f.gain.setTargetAtTime(on ? state.gains[i] || 0 : 0, t, 0.02));
}

/** The curve, from the equaliser page or the saved state at start (applyToCore). */
export function setWebEq(next) {
  const wasNeeded = needsWebEq();
  state = { enabled: !!next.enabled, preamp: +next.preamp || 0, gains: BANDS.map((_, i) => +next.gains?.[i] || 0) };
  apply();
  // Switched on with a song playing from googlevideo: the player has to take it the other way.
  if (!wasNeeded && needsWebEq()) window.dispatchEvent(new Event("kodama-eq-reroute"));
}

/** Whether songs have to come through the backend: the curve does something, or the element is wired already. */
export function needsWebEq() {
  return !!wired || audible(state);
}

/** Wire the player's element to the filters, once. */
export function wireWebEq(el) {
  if (!el || wired === el) return;
  if (!ctx) {
    ctx = new AudioContext();
    preampNode = ctx.createGain();
    filters = BANDS.map((f) => {
      const b = ctx.createBiquadFilter();
      b.type = "peaking";
      b.frequency.value = f;
      b.Q.value = Q;
      return b;
    });
    preampNode.connect(filters[0]);
    for (let i = 0; i < filters.length - 1; i++) filters[i].connect(filters[i + 1]);
    filters[filters.length - 1].connect(ctx.destination);
  }
  ctx.createMediaElementSource(el).connect(preampNode);
  el.addEventListener("play", resumeWebEq);
  wired = el;
  apply();
}

/** A suspended context plays nothing; resumed whenever playback starts. */
export function resumeWebEq() {
  if (ctx && ctx.state !== "running") ctx.resume().catch(() => {});
}

/**
 * A song from the backend as a blob: URL the element may play and the filters may read. The
 * bytes are fetched once the element opens the source, and appended as they come, so playback
 * starts before the song is all there.
 */
// googlevideo names the container only; Media Source wants the codec too. Android's streams
// are Opus in WebM, the desktop backend's (yt-dlp) may be AAC in MP4.
const CODECS = { "audio/webm": 'audio/webm; codecs="opus"', "audio/mp4": 'audio/mp4; codecs="mp4a.40.2"' };

export function mediaSourceUrl(src) {
  const ms = new MediaSource();
  const url = URL.createObjectURL(ms);
  const abort = new AbortController();
  ms.addEventListener("sourceopen", async () => {
    URL.revokeObjectURL(url);
    let sb;
    const append = (chunk) => new Promise((res, rej) => {
      sb.addEventListener("updateend", res, { once: true });
      sb.addEventListener("error", rej, { once: true });
      sb.appendBuffer(chunk);
    });
    try {
      const r = await fetch(src, { signal: abort.signal });
      if (!r.ok) throw new Error(r.status);
      const mime = (r.headers.get("Content-Type") || "audio/webm").split(";")[0].trim();
      sb = ms.addSourceBuffer(CODECS[mime] || CODECS["audio/webm"]);
      const reader = r.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (ms.readyState !== "open") return; // the element moved on to another song
        await append(value);
      }
      if (ms.readyState === "open") ms.endOfStream();
    } catch {
      try { if (ms.readyState === "open") ms.endOfStream("network"); } catch { /* closed */ }
    }
  }, { once: true });
  return { url, abort: () => abort.abort() };
}
