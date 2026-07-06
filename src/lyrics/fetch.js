// Multi-provider lyrics fetch. Extracted from App.jsx.
import { API } from "../context.jsx";
import { DEFAULT_LYRICS_PROVIDERS } from "./providers.js";
import { parseLrc, parseRichSync, parseTtml } from "./parse.js";

async function fetchLyrics(title, artist, album, duration, providers = DEFAULT_LYRICS_PROVIDERS, videoId = "") {
  const tryBetter = async () => {
    const params = new URLSearchParams({ title, artist, source: "better" });
    if (album) params.set("album", album);
    if (duration) params.set("duration", Math.round(duration));
    const r = await fetch(`${API}/lyrics?${params}`);
    if (r.ok) {
      const d = await r.json();
      if (d?.ttml) { const lrc = parseTtml(d.ttml); if (lrc.length) return { source: "Better Lyrics", lrc }; }
    }
    return null;
  };
  const tryUnison = async () => {
    const params = new URLSearchParams({ title, artist, source: "unison" });
    if (album) params.set("album", album);
    if (duration) params.set("duration", Math.round(duration));
    if (videoId) params.set("videoId", videoId);
    const r = await fetch(`${API}/lyrics?${params}`);
    if (r.ok) {
      const d = await r.json();
      const sub = d?.submitterName || null;
      if (d?.ttml) { const lrc = parseTtml(d.ttml); if (lrc.length) return { source: "Unison", lrc, submitterName: sub }; }
      if (d?.synced) return { source: "Unison", lrc: parseLrc(d.synced), submitterName: sub };
      if (d?.plain)  return { source: "Unison", lrc: d.plain.split("\n").map(t => ({ time: -1, text: t })), submitterName: sub };
    }
    return null;
  };
  const tryLrclib = async () => {
    const params = new URLSearchParams({ title, artist, source: "lrclib" });
    const r = await fetch(`${API}/lyrics?${params}`);
    if (r.ok) {
      const d = await r.json();
      if (d.synced) return { source: "LRCLIB", lrc: parseLrc(d.synced) };
      if (d.plain) return { source: "LRCLIB", lrc: d.plain.split("\n").map(t => ({ time: -1, text: t })) };
    }
    return null;
  };
  const tryKugou = async () => {
    const params = new URLSearchParams({ title, artist, source: "kugou" });
    if (duration) params.set("duration", Math.round(duration));
    const r = await fetch(`${API}/lyrics?${params}`);
    if (r.ok) {
      const d = await r.json();
      if (d.synced) return { source: "Kugou", lrc: parseLrc(d.synced) };
    }
    return null;
  };
  const trySimp = async () => {
    const params = new URLSearchParams({ title, artist, source: "simp" });
    if (videoId) params.set("videoId", videoId);
    const r = await fetch(`${API}/lyrics?${params}`);
    if (r.ok) {
      const d = await r.json();
      if (d.synced) return { source: "SimpMusic", lrc: parseLrc(d.synced) };
      if (d.plain) return { source: "SimpMusic", lrc: d.plain.split("\n").map(t => ({ time: -1, text: t })) };
    }
    return null;
  };
  const tryMusixmatch = async () => {
    const params = new URLSearchParams({ title, artist, source: "musixmatch" });
    if (duration) params.set("duration", Math.round(duration));
    const r = await fetch(`${API}/lyrics?${params}`);
    if (!r.ok) return null;
    const d = await r.json();
    if (d.richsync) { const lrc = parseRichSync(d.richsync); if (lrc.length) return { source: "Musixmatch", lrc }; }
    if (d.synced)   return { source: "Musixmatch", lrc: parseLrc(d.synced) };
    if (d.plain)    return { source: "Musixmatch", lrc: d.plain.split("\n").map(t => ({ time: -1, text: t })) };
    return null;
  };

  const tryFns = { better: tryBetter, unison: tryUnison, lrclib: tryLrclib, kugou: tryKugou, simp: trySimp, musixmatch: tryMusixmatch };
  const enabledProviders = providers.filter(p => p.enabled && tryFns[p.id]);

  // Fetch all providers in parallel — so we know which ones have no lyrics
  const settled = await Promise.all(
    enabledProviders.map(p => tryFns[p.id]().catch(() => null).then(r => ({ id: p.id, result: r })))
  );

  // Pick best result in priority order, collect failures + every available version
  const failedIds = [];
  let bestResult = null;
  const allResults = [];
  for (const p of enabledProviders) {
    const { result } = settled.find(s => s.id === p.id);
    if (result) {
      const tagged = { ...result, providerId: p.id };
      allResults.push(tagged);
      if (!bestResult) bestResult = tagged;
    } else failedIds.push(p.id);
  }

  return bestResult ? { ...bestResult, failedIds, allResults } : { failedIds, allResults };
}

// ─── Unison signed write helpers ─────────────────────────────────────────────
// The frontend signs each request with the stored identity (WebCrypto) and posts the
// signed envelope to the backend, which forwards it to Unison.

export { fetchLyrics };
