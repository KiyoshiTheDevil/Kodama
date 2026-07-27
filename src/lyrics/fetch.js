// Multi-provider lyrics fetch. Extracted from App.jsx.
import { API } from "../context.jsx";
import { DEFAULT_LYRICS_PROVIDERS } from "./providers.js";
import { parseLrc, parseRichSync, parseTtml, parseQrc, parseNetease } from "./parse.js";

// `onUpdate` is called every time a provider settles, so callers can show what has arrived
// instead of waiting for the slowest one. It receives { best, results, failedIds, pending }.
// The returned promise still resolves to the same final shape as before.
async function fetchLyrics(title, artist, album, duration, providers = DEFAULT_LYRICS_PROVIDERS, videoId = "", signal = undefined, onUpdate = null) {
  const opt = signal ? { signal } : undefined; // AbortSignal so a track change can cancel in-flight
  const tryBetter = async () => {
    const params = new URLSearchParams({ title, artist, source: "better" });
    if (album) params.set("album", album);
    if (duration) params.set("duration", Math.round(duration));
    const r = await fetch(`${API}/lyrics?${params}`, opt);
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
    const r = await fetch(`${API}/lyrics?${params}`, opt);
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
    const r = await fetch(`${API}/lyrics?${params}`, opt);
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
    const r = await fetch(`${API}/lyrics?${params}`, opt);
    if (r.ok) {
      const d = await r.json();
      if (d.synced) return { source: "Kugou", lrc: parseLrc(d.synced) };
    }
    return null;
  };
  const trySimp = async () => {
    const params = new URLSearchParams({ title, artist, source: "simp" });
    if (videoId) params.set("videoId", videoId);
    const r = await fetch(`${API}/lyrics?${params}`, opt);
    if (r.ok) {
      const d = await r.json();
      if (d.synced) return { source: "SimpMusic", lrc: parseLrc(d.synced) };
      if (d.plain) return { source: "SimpMusic", lrc: d.plain.split("\n").map(t => ({ time: -1, text: t })) };
    }
    return null;
  };
  const tryPortato = async () => {
    const params = new URLSearchParams({ title, artist, source: "portato" });
    if (album) params.set("album", album);
    if (duration) params.set("duration", Math.round(duration));
    const r = await fetch(`${API}/lyrics?${params}`, opt);
    if (r.ok) {
      const d = await r.json();
      if (d?.qrc) { const lrc = parseQrc(d.qrc, { title, artist }); if (lrc.length) return { source: "Portato (QQ)", lrc }; }
    }
    return null;
  };
  const tryPaxNetease = async () => {
    const params = new URLSearchParams({ title, artist, source: "paxsenix-netease" });
    if (duration) params.set("duration", Math.round(duration));
    const r = await fetch(`${API}/lyrics?${params}`, opt);
    if (r.ok) {
      const d = await r.json();
      if (d?.netease) {
        const lrc = parseNetease(d.netease, { title, artist });
        if (lrc.length) return { source: "NetEase (Paxsenix)", lrc };
      }
    }
    return null;
  };
  const tryMusixmatch = async () => {
    const params = new URLSearchParams({ title, artist, source: "musixmatch" });
    if (duration) params.set("duration", Math.round(duration));
    const r = await fetch(`${API}/lyrics?${params}`, opt);
    if (!r.ok) return null;
    const d = await r.json();
    if (d.richsync) { const lrc = parseRichSync(d.richsync); if (lrc.length) return { source: "Musixmatch", lrc }; }
    if (d.synced)   return { source: "Musixmatch", lrc: parseLrc(d.synced) };
    if (d.plain)    return { source: "Musixmatch", lrc: d.plain.split("\n").map(t => ({ time: -1, text: t })) };
    return null;
  };

  const tryFns = { better: tryBetter, portato: tryPortato, "paxsenix-netease": tryPaxNetease, unison: tryUnison, lrclib: tryLrclib, kugou: tryKugou, simp: trySimp, musixmatch: tryMusixmatch };
  const enabledProviders = providers.filter(p => p.enabled && tryFns[p.id]);

  // All providers run in parallel — so we learn which ones have nothing, and so a slow one
  // never holds up a fast one.
  const done = new Map(); // providerId -> tagged result, or null when it had nothing

  // Which result the view should show. It stays the highest-priority hit, so a result only
  // counts as decided once every provider ranked above it has come back empty; until then
  // this returns undefined, meaning "keep waiting" rather than "nothing found".
  const decideBest = () => {
    for (const p of enabledProviders) {
      if (!done.has(p.id)) return undefined;
      const r = done.get(p.id);
      if (r) return r;
    }
    return null;
  };

  await Promise.all(enabledProviders.map(p =>
    tryFns[p.id]().catch(() => null).then(r => {
      done.set(p.id, r ? { ...r, providerId: p.id } : null);
      if (onUpdate) {
        try {
          onUpdate({
            best: decideBest(),
            results: enabledProviders.map(q => done.get(q.id)).filter(Boolean),
            failedIds: enabledProviders.filter(q => done.get(q.id) === null).map(q => q.id),
            pending: enabledProviders.filter(q => !done.has(q.id)).map(q => q.id),
          });
        } catch { /* a listener must never break the fetch */ }
      }
    })
  ));

  // enabledProviders is in priority order, so the first surviving entry is the best one.
  const allResults = enabledProviders.map(p => done.get(p.id)).filter(Boolean);
  const failedIds = enabledProviders.filter(p => !done.get(p.id)).map(p => p.id);
  const bestResult = allResults[0] || null;

  return bestResult ? { ...bestResult, failedIds, allResults } : { failedIds, allResults };
}

// ─── Unison signed write helpers ─────────────────────────────────────────────
// The frontend signs each request with the stored identity (WebCrypto) and posts the
// signed envelope to the backend, which forwards it to Unison.

export { fetchLyrics };
