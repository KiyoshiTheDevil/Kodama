// ─────────────────────────────────────────────────────────────────────────────
//  Overlay Editor — colours that follow the cover.
//
//  A colour value can be "cover:N" (N = 1..3, the cover's strongest colours by area and
//  vividness) with an optional ":light" or ":dark". The renderer (server.py: coverChannels,
//  coverRgbJs, paletteOf) turns them into live colours; the editor only needs to show them,
//  using the palette the preview iframe reports. Mixing must match the renderer's.
// ─────────────────────────────────────────────────────────────────────────────
import { useSyncExternalStore } from "react";

// Stand-ins while nothing plays, the same as the renderer's COVER_FALLBACK.
export const COVER_FALLBACK = ["#eea8ff", "#7c4dff", "#00e5ff"];
export const COVER_TONES = ["light", "normal", "dark"];
const RE = /^cover:([123])(?::(light|dark))?$/;

export function parseCover(c) {
  const m = typeof c === "string" ? RE.exec(c) : null;
  return m ? { n: +m[1], tone: m[2] || "normal" } : null;
}
export const coverToken = (n, tone) => (tone === "normal" ? `cover:${n}` : `cover:${n}:${tone}`);

// The palette the editor's preview iframe is showing, shared by every colour field.
let snap = { colors: COVER_FALLBACK, cover: "", live: false };
const toHex = (rgb) => "#" + rgb.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
/** A cover colour as #rrggbb, from the given palette; anything else comes back unchanged. */
export function resolveColor(c, colors = snap.colors) {
  const p = parseCover(c);
  if (!p) return c;
  const hex = colors[p.n - 1] || COVER_FALLBACK[p.n - 1];
  const rgb = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  if (p.tone === "light") return toHex(rgb.map((v) => v + (255 - v) * 0.55));
  if (p.tone === "dark") return toHex(rgb.map((v) => v * 0.42));
  return toHex(rgb);
}

const subs = new Set();
export function setCoverPalette(p) {
  if (!p || !Array.isArray(p.colors) || p.colors.length < 3) return;
  const same = p.colors.every((c, i) => c === snap.colors[i]) && (p.cover || "") === snap.cover && !!p.live === snap.live;
  if (same) return;
  snap = { colors: p.colors.slice(0, 3), cover: p.cover || "", live: !!p.live };
  subs.forEach((f) => f());
}
const subscribe = (cb) => { subs.add(cb); return () => subs.delete(cb); };
export const useCoverPalette = () => useSyncExternalStore(subscribe, () => snap);

// The editor's wording, set once per render of the editor so the many colour fields do not
// each need `t` handed down.
let tx = (k) => k;
export function setCoverText(t) { tx = t; }
export function coverName(c) {
  const p = parseCover(c);
  if (!p) return "";
  return `${tx("ovlCoverName")} ${p.n}` + (p.tone === "normal" ? "" : ` · ${tx("ovlTone_" + p.tone)}`);
}
/** What the colour picker needs for its Cover tab. */
export function coverPickerProps(pal) {
  return {
    colors: pal.colors, src: pal.cover, live: pal.live,
    resolve: (c) => resolveColor(c, pal.colors),
    tokens: COVER_TONES.map((tone) => [1, 2, 3].map((n) => coverToken(n, tone))),
    name: coverName,
    text: { own: tx("ovlCoverOwn"), cover: tx("ovlCoverTab"), hint: tx(pal.live ? "ovlCoverHint" : "ovlCoverHintIdle"), tones: tx("ovlCoverTones") },
  };
}
