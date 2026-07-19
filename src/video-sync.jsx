// Video-sync mode: shows the official-video release, muted, while its OWN audio track plays
// through the normal Rust pipeline in place of the song's (App.jsx swaps the source on the
// audio/video switch) — so volume, visualizer, Discord RPC etc. all stay on the one audio path
// that already exists, nothing plays through the WebView's own audio output. The backend
// resolves the counterpart video and computes a fixed offset via audio cross-correlation
// (python-backend/server.py's /video-sync/* routes); App.jsx applies that offset ONCE, as the
// seek target for the swap, so playback lands on the corresponding moment in the other version.
// This module just fetches that data once per track and keeps the <video> element's own position
// corrected against ordinary clock drift against whatever audio is currently loaded.
import { useEffect, useRef, useState } from "react";
import { API } from "./context.jsx";
import { fetchLyrics } from "./lyrics/fetch.js";
import { DEFAULT_LYRICS_PROVIDERS } from "./lyrics/providers.js";
import { parseDurationToSeconds } from "./lyrics/parse.js";
import { paintWordSeq, wordGroupIndices } from "./lyrics/paint.js";

// Real-world calibration (2026-07-18): a confirmed correct match ("Nachos") scored 10.5, a
// second plausible one scored 5.2 — but a confidence of 3.38 turned out to be a false positive
// (matched a completely unrelated video). 3 was far too permissive; 7 sits with real margin
// above the observed false positive while still under the strongest confirmed match.
const CONFIDENCE_THRESHOLD = 7; // below this the computed offset is untrustworthy — skip video mode
const DRIFT_CORRECTION_S = 0.35; // only re-seek the video once it has drifted this far from target

// maxHeight: null/0 = best available; otherwise caps resolution (e.g. for a weak/metered connection).
export function useVideoSync(videoId, enabled, maxHeight) {
  const [state, setState] = useState({ videoUrl: null, offsetSeconds: 0, counterpartVideoId: null, ready: false });

  useEffect(() => {
    setState({ videoUrl: null, offsetSeconds: 0, counterpartVideoId: null, ready: false });
    if (!enabled || !videoId) return;
    let cancelled = false;
    fetch(`${API}/video-sync/offset/${videoId}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled || !d.available || !d.counterpartVideoId || !(d.confidence >= CONFIDENCE_THRESHOLD)) return;
        const q = maxHeight ? `?maxHeight=${maxHeight}` : "";
        return fetch(`${API}/video-sync/stream/${d.counterpartVideoId}${q}`)
          .then(r => r.json())
          .then(sd => {
            if (cancelled || !sd.url) return;
            setState({ videoUrl: sd.url, offsetSeconds: d.offsetSeconds, counterpartVideoId: d.counterpartVideoId, ready: true });
          });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [videoId, enabled, maxHeight]);

  return state;
}

export function VideoSyncVideo({ src, offsetSeconds, audioRef, isPlaying, style }) {
  const videoRef = useRef(null);
  // Snapshot the audio clock the same way the lyrics rAF loop does (App.jsx), so the correction
  // loop below can interpolate the current audio position at 60fps between IpcAudio's own events.
  const snapRef = useRef({ ct: 0, pt: 0, playing: false });

  useEffect(() => {
    const audio = audioRef?.current;
    if (!audio) return;
    const snap = () => { snapRef.current = { ct: audio.currentTime, pt: performance.now(), playing: !audio.paused }; };
    audio.addEventListener("timeupdate", snap);
    audio.addEventListener("play", snap);
    audio.addEventListener("pause", snap);
    audio.addEventListener("seeked", snap);
    snap();
    return () => {
      audio.removeEventListener("timeupdate", snap);
      audio.removeEventListener("play", snap);
      audio.removeEventListener("pause", snap);
      audio.removeEventListener("seeked", snap);
    };
  }, [audioRef]);

  // Correct the video's position against the interpolated audio clock; only re-seek past the
  // drift threshold so ordinary playback doesn't stutter from constant sub-frame seeks.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const v = videoRef.current;
      if (v && v.duration) {
        const { ct, pt, playing } = snapRef.current;
        const audioT = playing ? ct + (performance.now() - pt) / 1000 : ct;
        const target = Math.max(0, Math.min(v.duration, audioT + offsetSeconds));
        if (Math.abs(v.currentTime - target) > DRIFT_CORRECTION_S) v.currentTime = target;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [offsetSeconds]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isPlaying) v.play().catch(() => {});
    else v.pause();
  }, [isPlaying, src]);

  return (
    <video
      ref={videoRef}
      src={src}
      muted
      playsInline
      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", ...style }}
    />
  );
}

// Lightweight standalone "what's the current line" tracker for the caption overlay — deliberately
// NOT reusing LyricsOverlay's full rendering pipeline (syllable timing, romaji, the whole fluid
// scroll-physics system), since a one-line caption strip has no scroll room for any of that. Just
// fetches the plain synced line list once per track (+ a translation batch, same endpoint/shape
// as the main lyrics view, when enabled) and tracks the active index against the audio clock
// (same snapshot+rAF interpolation pattern used elsewhere in this file).
function useCaptionLine(track, audioRef, enabled, showTranslation, translationLang) {
  const [currentText, setCurrentText] = useState("");
  const [currentWords, setCurrentWords] = useState(null);
  const [currentTranslation, setCurrentTranslation] = useState("");
  const [lines, setLines] = useState([]);
  const linesRef = useRef([]);
  const translationsRef = useRef(null);
  const curIdxRef = useRef(-1);
  const snapRef = useRef({ ct: 0, pt: 0, playing: false });
  const timeRef = useRef(0); // live interpolated playback position, for the per-word highlight loop

  useEffect(() => {
    linesRef.current = [];
    translationsRef.current = null;
    curIdxRef.current = -1;
    setCurrentText("");
    setCurrentTranslation("");
    setLines([]);
    if (!enabled || !track) return;
    let cancelled = false;
    fetchLyrics(track.title, track.artists, track.album, parseDurationToSeconds(track.duration), DEFAULT_LYRICS_PROVIDERS, track.videoId)
      .then(res => {
        if (cancelled) return;
        // Syllable/word-synced lines (TTML word-mode, Musixmatch richsync) carry no .text at
        // all — only .words[] — so normalize every line to a plain string up front, same as the
        // main lyrics view's own translation-fetch effect does.
        const lrc = (res?.lrc || [])
          .filter(l => l.time >= 0)
          .map(l => ({ ...l, text: l.wordSync ? (l.words || []).map(w => w.text).join("") : (l.text || "") }));
        linesRef.current = lrc;
        setLines(lrc);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [track?.videoId, enabled]);

  useEffect(() => {
    translationsRef.current = null;
    if (!enabled || !showTranslation || !lines.length) return;
    let cancelled = false;
    fetch("http://localhost:9847/translate-lyrics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines: lines.map(l => l.text), target_lang: translationLang }),
    })
      .then(r => r.json())
      .then(d => {
        if (cancelled) return;
        translationsRef.current = d.translations || null;
        // Translation can arrive after the active line already settled — correct it retroactively.
        const idx = curIdxRef.current;
        const tr = idx >= 0 ? translationsRef.current?.[idx] : null;
        const lineText = idx >= 0 ? linesRef.current[idx]?.text : null;
        setCurrentTranslation(tr && tr !== lineText ? tr : "");
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [enabled, showTranslation, lines, translationLang]);

  useEffect(() => {
    const audio = audioRef?.current;
    if (!audio || !enabled) return;
    const snap = () => { snapRef.current = { ct: audio.currentTime, pt: performance.now(), playing: !audio.paused }; };
    audio.addEventListener("timeupdate", snap);
    audio.addEventListener("play", snap);
    audio.addEventListener("pause", snap);
    audio.addEventListener("seeked", snap);
    snap();
    return () => {
      audio.removeEventListener("timeupdate", snap);
      audio.removeEventListener("play", snap);
      audio.removeEventListener("pause", snap);
      audio.removeEventListener("seeked", snap);
    };
  }, [audioRef, enabled]);

  useEffect(() => {
    if (!enabled) return;
    let raf = 0;
    const loop = () => {
      const { ct, pt, playing } = snapRef.current;
      const t = playing ? ct + (performance.now() - pt) / 1000 : ct;
      timeRef.current = t;
      const lns = linesRef.current;
      let idx = -1;
      for (let i = 0; i < lns.length; i++) { if (lns[i].time <= t) idx = i; else break; }
      // Gap detection (mirrors the main lyrics view): a line with a known endTime deactivates
      // once that's passed, if the silence before the next line is long enough to be a real gap.
      if (idx >= 0) {
        const line = lns[idx];
        if (line.endTime != null) {
          const nextStart = lns[idx + 1]?.time ?? Infinity;
          if (nextStart - line.endTime > 3 && t >= line.endTime) idx = -1;
        }
      }
      if (idx !== curIdxRef.current) {
        curIdxRef.current = idx;
        const line = idx >= 0 ? lns[idx] : null;
        setCurrentText(line?.text || "");
        setCurrentWords(line?.wordSync ? line.words : null);
        const tr = idx >= 0 ? translationsRef.current?.[idx] : null;
        setCurrentTranslation(tr && tr !== line?.text ? tr : "");
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [enabled]);

  return { text: currentText, words: currentWords, translation: currentTranslation, timeRef };
}

// Renders a word-synced line using the exact same dim-baseline + bright-overlay-with-wipe-mask
// markup as the main lyrics view (LyricsOverlay), painted by the same paintWordSeq — a real
// syllable wipe + gentle zoom pulse + optional glow, not just an opacity toggle. Direct-DOM,
// not per-word React state, so it updates at 60fps without fighting the parent's re-renders.
function KaraokeLine({ words, timeRef, fluid, syllableZoom }) {
  const brightRefs = useRef([]);
  const idxRef = useRef({}).current; // plain mutable bag (paintWordSeq indexes it by string key)
  const zoomMaxRef = useRef(-1);
  const nonSpaceWords = words.filter(w => !w.isSpace);
  const groups = wordGroupIndices(words);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      paintWordSeq(nonSpaceWords, brightRefs.current, idxRef, "current", timeRef.current, syllableZoom ? zoomMaxRef : null, fluid, groups);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [words]);

  let nsIdx = 0;
  return (
    <span style={{ whiteSpace: "pre-wrap" }}>
      {words.map((word, wi) => {
        if (word.isSpace) return <span key={wi}>{word.text}</span>;
        const myIdx = nsIdx++;
        return (
          <span key={wi} style={{ position: "relative", display: "inline-block" }}>
            <span style={{ color: "rgba(255,255,255,0.25)" }}>{word.text}</span>
            <span
              ref={el => { brightRefs.current[myIdx] = el; }}
              style={{
                position: "absolute", top: 0, left: 0, right: 0, bottom: 0,
                color: "white", opacity: 0,
                WebkitMaskImage: "linear-gradient(to right, black -6px, transparent 6px)",
                maskImage: "linear-gradient(to right, black -6px, transparent 6px)",
                pointerEvents: "none",
              }}
            >{word.text}</span>
          </span>
        );
      })}
    </span>
  );
}

// Bottom-third caption strip — an alternative to the split-with-lyrics view for users who'd
// rather keep the video full-size. fluid=true (mirrors the app's own "fluid lyrics" setting)
// swaps the plain crossfade for a softer blur/glow entrance on each line change.
function CaptionOverlay({ track, audioRef, fluid = false, showTranslation = false, translationLang = "DE", syllableZoom = false }) {
  const { text, words, translation, timeRef } = useCaptionLine(track, audioRef, true, showTranslation, translationLang);
  const [shown, setShown] = useState("");
  const [shownWords, setShownWords] = useState(null);
  const [shownTranslation, setShownTranslation] = useState("");
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    // A gap between lines (text === "") should fade the CURRENT content out, not blank it
    // instantly — so leave `shown` alone here and just let the opacity below drop to 0. Only
    // swap in new content once a real (non-empty) line starts.
    if (!text) return;
    if (text === shown) { if (translation !== shownTranslation) setShownTranslation(translation); return; }
    setShown(text);
    setShownWords(words);
    setShownTranslation(translation);
    setAnimKey(k => k + 1);
  }, [text, words, translation]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!shown) return null;

  return (
    <div style={{
      position: "absolute", left: 0, right: 0, bottom: 0, padding: "64px 40px 40px",
      background: "linear-gradient(to top, rgba(0,0,0,0.72), transparent)",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 8, pointerEvents: "none",
      opacity: text ? 1 : 0, transition: "opacity 0.4s ease",
    }}>
      <div
        key={animKey}
        style={{
          color: "#fff", fontWeight: 700, fontSize: 30, textAlign: "center", lineHeight: 1.35,
          maxWidth: 900, overflowWrap: "anywhere",
          textShadow: "0 2px 14px rgba(0,0,0,0.65)",
          animation: fluid ? "videoCaptionFluidIn 0.55s cubic-bezier(0.22,1,0.36,1)" : "videoCaptionFadeIn 0.2s ease",
        }}
      >
        {shownWords ? <KaraokeLine words={shownWords} timeRef={timeRef} fluid={fluid} syllableZoom={syllableZoom} /> : shown}
      </div>
      {shownTranslation && (
        <div
          key={`${animKey}-tr`}
          style={{
            color: "rgba(255,255,255,0.72)", fontWeight: 500, fontSize: 19, textAlign: "center", lineHeight: 1.35,
            maxWidth: 900, overflowWrap: "anywhere",
            textShadow: "0 2px 10px rgba(0,0,0,0.6)",
            animation: fluid ? "videoCaptionFluidIn 0.55s cubic-bezier(0.22,1,0.36,1) 0.05s backwards" : "videoCaptionFadeIn 0.2s ease",
          }}>
          {shownTranslation}
        </div>
      )}
    </div>
  );
}

// Dedicated video pane — parallel to CoverView / LyricsOverlay, not squeezed into the small
// cover-art box (a muted video that size would be pointless). Fills the full width of this pane
// (not the whole app window — this only ever occupies the cover-pane's share of the layout,
// same as CoverView/LyricsOverlay). No title/artist overlay — that's already shown by the rest
// of the player chrome and would just clutter the picture. Only ever mounted once a synced video
// is actually ready (gated by the audio/video switch in the player bar), so it doesn't need its
// own loading/unavailable state.
export function VideoSyncView({ videoSync, audioRef, isPlaying, fullscreen = false, track, showCaptions = false, fluidCaptions = false, captionsTranslation = false, captionsTranslationLang = "DE", captionsSyllableZoom = false }) {
  return (
    <div style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "#000", borderRadius: fullscreen ? 0 : 16 }}>
      {videoSync.ready && (
        // offsetSeconds is 0 here, not videoSync.offsetSeconds — App.jsx's audio-switching effect
        // already applies that offset ONCE, as the seek target when swapping the Rust audio source
        // over to this same counterpart video's own audio track. From that point on, video and
        // audio share one timeline (same source), so the only remaining drift to correct for is
        // ordinary clock drift between the two independent decoders, not a content offset.
        <VideoSyncVideo src={videoSync.videoUrl} offsetSeconds={0} audioRef={audioRef} isPlaying={isPlaying} style={{ objectFit: "contain" }} />
      )}
      {showCaptions && <CaptionOverlay track={track} audioRef={audioRef} fluid={fluidCaptions} showTranslation={captionsTranslation} translationLang={captionsTranslationLang} syllableZoom={captionsSyllableZoom} />}
    </div>
  );
}
