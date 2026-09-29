// Braccato: the rendering engine of Better Lyrics, as an experiment beside Kodama's own lyrics view.
//
// Only the drawing is Braccato's. The lines still come from Kodama's own provider chain, the clock
// from Kodama's player (the audio plays in the Rust core, so there is no <audio> element to bind),
// and translations and romaji from the backend, as before. This module turns Kodama's line shape
// into Braccato's, feeds it the time every frame, and routes a click on a line back as a seek.
//
// The engine and its stylesheets load on first use, so nobody who leaves the experiment off pays
// for them.
import { useEffect, useMemo, useRef, useState } from "react";

let loading = null;
function loadBraccato() {
  loading ??= Promise.all([
    import("@braccato/core/element"),
    import("@braccato/core/styles/variables.css"),
    import("@braccato/core/styles/lyrics.css"),
    import("@braccato/core/styles/instrumental.css"),
    import("./braccato-view.css"),
  ]);
  return loading;
}

// The stage (captions over a video) is not offered by the element: it is a renderer built with
// layout "stage" and ticked by hand. Its placement sheet comes with it.
let loadingStage = null;
function loadBraccatoStage() {
  loadingStage ??= Promise.all([
    loadBraccato(),
    import("@braccato/core/styles/stage.css"),
    import("@braccato/core"),
  ]).then(([, , core]) => core);
  return loadingStage;
}

// Better Lyrics names the voices of a duet v1 (lead), v2 (the other voice, drawn on the right) and
// v1000 (everyone). Kodama's TTML parser calls the same three lead, featured and group.
const AGENT = { lead: "v1", featured: "v2", group: "v1000" };

const ms = (s) => Math.max(0, Math.round(s * 1000));

// Kodama keeps a space as a word of its own; Braccato expects it on the end of the word before, the
// way Better Lyrics' own lyrics carry it. A space with no word before it is dropped.
function toParts(words, background) {
  const parts = [];
  for (const w of words || []) {
    if (w.isSpace) {
      if (parts.length) parts[parts.length - 1].words += w.text;
      continue;
    }
    parts.push({
      startTimeMs: ms(w.time),
      durationMs: Math.max(0, ms(w.end) - ms(w.time)),
      words: w.text,
      ...(background ? { isBackground: true } : {}),
    });
  }
  return parts;
}

// Kodama's lines are { time, endTime, text | words[], bgWords?, agentRole? } in seconds.
export function toBraccatoLyrics(lines, { translations, romaji, translationLang } = {}) {
  if (!Array.isArray(lines)) return [];
  return lines.map((line, i) => {
    const text = line.wordSync ? (line.words || []).map(w => w.text).join("") : (line.text || "");
    const next = lines[i + 1]?.time;
    const end = line.endTime ?? (next != null && next > line.time ? next : line.time + 5);
    const out = {
      key: String(i),
      startTimeMs: ms(line.time),
      durationMs: Math.max(0, ms(end) - ms(line.time)),
      words: text.trim() ? text : "",
    };
    let parts = line.wordSync ? toParts(line.words, false) : [];
    if (line.bgWords?.length) {
      // A line-synced line with background vocals: the main text becomes one part spanning the
      // line, so the background parts have something to sit beside.
      if (!line.wordSync && out.words) parts = [{ startTimeMs: out.startTimeMs, durationMs: out.durationMs, words: out.words }];
      parts = parts.concat(toParts(line.bgWords, true));
    }
    if (parts.length) out.parts = parts;
    if (line.agentRole && AGENT[line.agentRole]) out.agent = AGENT[line.agentRole];
    const tr = translations?.[i];
    if (tr && tr !== text) out.translation = { text: tr, lang: (translationLang || "").toLowerCase() };
    if (romaji?.[i]) out.romanization = romaji[i];
    return out;
  });
}

// `clock()` returns { t, playing }, t already shifted by the lyrics offset. `onSeek(t)` is handed
// that same kind of time back. `scrollRef` is the container that scrolls, which Braccato would
// otherwise have to guess. `onUserScrolling(bool)` mirrors Braccato's own manual-scroll detection
// onto Kodama's "Resume autoscroll" pill, and `resumeRef.current()` resumes it from there.
export function BraccatoLyricsView({
  lines, translations, romaji, translationLang, fontSize, active,
  clock, onSeek, scrollRef, onUserScrolling, resumeRef,
}) {
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const elRef = useRef(null);
  // Read live by the engine's host callbacks, which are handed over once.
  const live = useRef({});
  live.current = { clock, onSeek, onUserScrolling, active };

  useEffect(() => {
    let alive = true;
    loadBraccato()
      .then(() => { if (alive) setReady(true); })
      .catch((e) => { console.error("[braccato] could not load the engine", e); if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  const data = useMemo(
    () => toBraccatoLyrics(lines, { translations, romaji, translationLang }),
    [lines, translations, romaji, translationLang],
  );

  useEffect(() => {
    const el = elRef.current;
    if (!ready || !el) return;
    el.host = {
      getScrollElement: () => scrollRef.current,
      seek: (s) => live.current.onSeek?.(s),
      // Same rule as the rest of Kodama: a pane that is slid off screen does no work.
      isViewVisible: () => !!live.current.active,
      setResumeAffordanceVisible: (v) => live.current.onUserScrolling?.(v),
    };
    const onError = (e) => console.error("[braccato]", e.detail?.phase, e.detail?.error);
    el.addEventListener("braccato:error", onError);
    return () => el.removeEventListener("braccato:error", onError);
  }, [ready, scrollRef]);

  useEffect(() => {
    if (ready && elRef.current) elRef.current.lyrics = data;
  }, [ready, data]);

  useEffect(() => {
    if (resumeRef) resumeRef.current = () => elRef.current?.renderer?.resumeAutoscroll();
  }, [resumeRef]);

  // The clock. Braccato renders on every write of currentTime, so this is its frame loop, and like
  // every loop in Kodama it stops while the lyrics are not on screen.
  useEffect(() => {
    if (!ready || !active) return;
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const el = elRef.current;
      const now = live.current.clock?.();
      if (!el || !now) return;
      if (el.playing !== now.playing) el.playing = now.playing;
      el.currentTime = now.t;
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [ready, active]);

  if (failed) return <div style={{ textAlign: "center", color: "var(--text-muted)" }}>Braccato could not be loaded.</div>;
  if (!ready) return null;
  return (
    <braccato-lyrics
      ref={elRef}
      style={{ "--blyrics-font-size": `${fontSize}px` }}
    />
  );
}

// Captions over a video, drawn by Braccato's stage layout: only the lines being sung, each one
// sliding and fading into the next, a duet's voices kept to their own sides. It fills the element
// it is given, so it sits in a box over the video. `clock` is the same as above.
//
// The shade behind the captions is Kodama's, not the theme's: Braccato reports where the sung lines
// are (onStageLayout), and the shade shows only while something is on stage, so a bright video
// stays readable without a dark band sitting there through every instrumental.
export function BraccatoStageView({ lines, translations, romaji, translationLang, fontSize = 30, clock }) {
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [onStage, setOnStage] = useState(false);
  const live = useRef({});
  live.current = { clock };

  useEffect(() => {
    let alive = true;
    let renderer = null;
    loadBraccatoStage()
      .then(({ createLyricsRenderer }) => {
        if (!alive || !mountRef.current) return;
        renderer = createLyricsRenderer({
          document, window,
          mount: mountRef.current,
          layout: "stage",
          host: {
            isViewVisible: () => true,
            seek: () => {},
            onStageLayout: (box) => setOnStage(!!box),
            log: () => {},
          },
        });
        rendererRef.current = renderer;
        setReady(true);
      })
      .catch((e) => console.error("[braccato] could not load the stage", e));
    return () => {
      alive = false;
      renderer?.destroy();
      rendererRef.current = null;
    };
  }, []);

  const data = useMemo(
    () => toBraccatoLyrics(lines, { translations, romaji, translationLang }),
    [lines, translations, romaji, translationLang],
  );

  useEffect(() => {
    if (ready && rendererRef.current && mountRef.current) rendererRef.current.setLyrics(data, { mount: mountRef.current });
  }, [ready, data]);

  // The stage is only mounted while the video with captions is on screen, so it ticks for as long
  // as it exists.
  useEffect(() => {
    if (!ready) return;
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const now = live.current.clock?.();
      if (now) rendererRef.current?.tick(now.t, { isPlaying: now.playing });
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [ready]);

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <div style={{
        position: "absolute", left: 0, right: 0, bottom: 0, height: "45%",
        background: "linear-gradient(to top, rgba(0,0,0,0.72), transparent)",
        opacity: onStage ? 1 : 0, transition: "opacity 0.4s ease",
      }} />
      <div ref={mountRef} className="kodama-braccato-stage"
        style={{ position: "absolute", inset: "0 40px 36px", "--blyrics-font-size": `${fontSize}px` }} />
    </div>
  );
}
