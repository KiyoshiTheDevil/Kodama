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
import { repeatsLine } from "./same-text.js";

// Resolves to the engine's facade (createLyricsRenderer, injectTranslation, injectRomanization),
// with the element registered and the stylesheets in.
let loading = null;
function loadBraccato() {
  loading ??= Promise.all([
    import("@braccato/core"),
    import("@braccato/core/element"),
    import("@braccato/core/styles/variables.css"),
    import("@braccato/core/styles/lyrics.css"),
    import("@braccato/core/styles/instrumental.css"),
    import("./braccato-view.css"),
  ]).then(([core]) => core);
  return loading;
}

// The stage (captions over a video) is not offered by the element: it is a renderer built with
// layout "stage" and ticked by hand. Its placement sheet comes with it.
let loadingStage = null;
function loadBraccatoStage() {
  loadingStage ??= Promise.all([loadBraccato(), import("@braccato/core/styles/stage.css")]).then(([core]) => core);
  return loadingStage;
}

// Better Lyrics names the voices of a duet v1 (lead), v2 (the other voice, drawn on the right) and
// v1000 (everyone). Kodama's TTML parser calls the same three lead, featured and group.
const AGENT = { lead: "v1", featured: "v2", group: "v1000" };

const ms = (s) => Math.max(0, Math.round(s * 1000));
const lineText = (line) => line.wordSync ? (line.words || []).map(w => w.text).join("") : (line.text || "");

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
// Translations and romaji are not part of this: Braccato builds a line from its words alone and
// takes what goes under it afterwards (see decorate below).
export function toBraccatoLyrics(lines) {
  if (!Array.isArray(lines)) return [];
  return lines.map((line, i) => {
    const text = lineText(line);
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
    return out;
  });
}

const TRANSLATED = "blyrics--translated";
const ROMANIZED = "blyrics--romanized";

// Hangs translations and romaji onto lines Braccato has already built, the way Better Lyrics itself
// does it: they arrive from the backend after the lyrics, and Braccato draws a line from its words
// alone, so the `translation` and `romanization` fields of a lyric are never read. What is already
// there and still right stays; what changed or was switched off goes. Braccato builds exactly one
// element per lyric, in order, so line i is the i-th line element.
// Returns whether anything changed, so the caller only asks for a relayout when it has to.
function decorate(core, container, lines, { translations, romaji, translationLang }) {
  if (!container) return false;
  const els = container.querySelectorAll(":scope > .blyrics--line");
  const lang = (translationLang || "").toLowerCase() || null;
  let changed = false;
  els.forEach((el, i) => {
    const line = lines[i];
    if (!line) return;
    const same = (s) => repeatsLine(line, s);
    const wantRo = romaji?.[i] && !same(romaji[i]) ? romaji[i] : null;
    const wantTr = translations?.[i] && !same(translations[i]) ? translations[i] : null;
    const ro = el.querySelector(`:scope > .${ROMANIZED}`);
    if (ro && ro.textContent !== wantRo) { ro.remove(); changed = true; }
    const tr = el.querySelector(`:scope > .${TRANSLATED}`);
    // Compared against what Kodama asked for, not tr.lang: Braccato normalises the tag it writes.
    if (tr && (tr.textContent !== wantTr || tr.dataset.kodamaLang !== String(lang))) { tr.remove(); changed = true; }
    if (wantRo && !el.querySelector(`:scope > .${ROMANIZED}`)) { core.injectRomanization(document, el, null, wantRo); changed = true; }
    if (wantTr && !el.querySelector(`:scope > .${TRANSLATED}`)) {
      core.injectTranslation(document, el, wantTr, lang);
      const added = el.querySelector(`:scope > .${TRANSLATED}`);
      if (added) added.dataset.kodamaLang = String(lang);
      changed = true;
    }
  });
  return changed;
}

// Braccato reads its behaviour switches from comments in the theme stylesheet, and only from there.
// The letter wave (each letter floats up as the word is sung) is on by default; Kodama writes the
// switch either way so turning it back on does not depend on an empty theme restoring the default.
// A comment setting holds one value for every view on the page, the stage included.
const themeFor = ({ letterWave = true } = {}) => `/* blyrics-letter-wave = ${letterWave ? "true" : "false"}; */`;

// Kodama's own size settings for the lines under a lyric. Braccato sizes the translation with
// --blyrics-translated-font-size and derives the romanization from it; Kodama keeps two settings,
// so the romanization gets its own size back.
const subSizes = (translationFontSize, romajiFontSize) => ({
  ...(translationFontSize ? { "--blyrics-translated-font-size": `${translationFontSize}px` } : {}),
  ...(romajiFontSize ? { "--kodama-romaji-size": `${romajiFontSize}px` } : {}),
});

// Keeps the decorations in step with what Kodama has. Runs when the lines were (re)built and when
// the translations, romaji or their language change. After a change the renderer is asked to catch
// the layout up, which floats the new line in while its neighbours slide to make room instead of
// the lyric jumping down. Tried once more on the next frame if the lines were not built yet.
function useDecorations({ core, getRenderer, getContainer, lines, translations, romaji, translationLang, built, isTicking, retick }) {
  useEffect(() => {
    if (!core || !built) return;
    let raf = 0;
    const apply = () => {
      const container = getContainer();
      if (!container?.querySelector(".blyrics--line")) return false;
      if (decorate(core, container, lines, { translations, romaji, translationLang })) {
        getRenderer()?.scheduleLyricPositionUpdate(isTicking, retick);
      }
      return true;
    };
    if (!apply()) raf = requestAnimationFrame(apply);
    return () => cancelAnimationFrame(raf);
  }, [core, built, lines, translations, romaji, translationLang]); // eslint-disable-line react-hooks/exhaustive-deps
}

// `clock()` returns { t, playing }, t already shifted by the lyrics offset. `onSeek(t)` is handed
// that same kind of time back. `scrollRef` is the container that scrolls, which Braccato would
// otherwise have to guess. `onUserScrolling(bool)` mirrors Braccato's own manual-scroll detection
// onto Kodama's "Resume autoscroll" pill, and `resumeRef.current()` resumes it from there.
export function BraccatoLyricsView({
  lines, translations, romaji, translationLang, fontSize, translationFontSize, romajiFontSize, active,
  letterWave = true, clock, onSeek, scrollRef, onUserScrolling, resumeRef,
}) {
  const [core, setCore] = useState(null);
  const [failed, setFailed] = useState(false);
  const [built, setBuilt] = useState(0);
  const elRef = useRef(null);
  // Read live by the engine's host callbacks, which are handed over once.
  const live = useRef({});
  live.current = { clock, onSeek, onUserScrolling, active };

  useEffect(() => {
    let alive = true;
    loadBraccato()
      .then((c) => { if (alive) setCore(c); })
      .catch((e) => { console.error("[braccato] could not load the engine", e); if (alive) setFailed(true); });
    return () => { alive = false; };
  }, []);

  const data = useMemo(() => toBraccatoLyrics(lines), [lines]);

  useEffect(() => {
    const el = elRef.current;
    if (!core || !el) return;
    el.host = {
      getScrollElement: () => scrollRef.current,
      seek: (s) => live.current.onSeek?.(s),
      // Same rule as the rest of Kodama: a pane that is slid off screen does no work.
      isViewVisible: () => !!live.current.active,
      setResumeAffordanceVisible: (v) => live.current.onUserScrolling?.(v),
    };
    const onError = (e) => console.error("[braccato]", e.detail?.phase, e.detail?.error);
    // Also fires when a rebuild replaced the lines, which takes their decorations with them.
    const onLoaded = () => setBuilt(n => n + 1);
    el.addEventListener("braccato:error", onError);
    el.addEventListener("braccato:lyrics-loaded", onLoaded);
    return () => {
      el.removeEventListener("braccato:error", onError);
      el.removeEventListener("braccato:lyrics-loaded", onLoaded);
    };
  }, [core, scrollRef]);

  useEffect(() => {
    if (core && elRef.current) elRef.current.lyrics = data;
  }, [core, data]);

  // Changing the letter wave makes Braccato rebuild the lines, which fires lyrics-loaded, so the
  // translations are hung back on by the decorations below.
  useEffect(() => {
    if (core && elRef.current) elRef.current.theme = themeFor({ letterWave });
  }, [core, letterWave]);

  // Braccato measures the room above the first line (and below the last) from the height of the
  // scroll element, but only follows resizes of its own lines, not of that element. Kodama's pane
  // often has no height yet when the lyrics arrive, and it changes on fullscreen or a resized
  // window: without this the room stayed at zero and the lyrics started at the very top.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!core || !scroller || typeof ResizeObserver === "undefined") return;
    let raf = 0;
    let last = scroller.clientHeight;
    const ro = new ResizeObserver(() => {
      const h = scroller.clientHeight;
      if (h === last) return;
      last = h;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => elRef.current?.renderer?.relayout(true));
    });
    ro.observe(scroller);
    return () => { ro.disconnect(); cancelAnimationFrame(raf); };
  }, [core, scrollRef]);

  useDecorations({
    core, built, lines, translations, romaji, translationLang,
    getRenderer: () => elRef.current?.renderer,
    getContainer: () => elRef.current?.renderer?.container || elRef.current?.querySelector(".blyrics-container"),
    isTicking: () => !!live.current.active,
    retick: () => {
      const el = elRef.current, now = live.current.clock?.();
      if (el && now) el.currentTime = now.t;
    },
  });

  useEffect(() => {
    if (resumeRef) resumeRef.current = () => elRef.current?.renderer?.resumeAutoscroll();
  }, [resumeRef]);

  // The clock. Braccato renders on every write of currentTime, so this is its frame loop, and like
  // every loop in Kodama it stops while the lyrics are not on screen.
  useEffect(() => {
    if (!core || !active) return;
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
  }, [core, active]);

  if (failed) return <div style={{ textAlign: "center", color: "var(--text-muted)" }}>Braccato could not be loaded.</div>;
  if (!core) return null;
  return (
    <braccato-lyrics
      ref={elRef}
      style={{ "--blyrics-font-size": `${fontSize}px`, ...subSizes(translationFontSize, romajiFontSize) }}
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
export function BraccatoStageView({ lines, translations, romaji, translationLang, fontSize = 30, translationFontSize, romajiFontSize, letterWave = true, clock }) {
  const mountRef = useRef(null);
  const rendererRef = useRef(null);
  const [core, setCore] = useState(null);
  const [built, setBuilt] = useState(0);
  const [onStage, setOnStage] = useState(false);
  const live = useRef({});
  live.current = { clock };

  useEffect(() => {
    let alive = true;
    let renderer = null;
    loadBraccatoStage()
      .then((c) => {
        if (!alive || !mountRef.current) return;
        renderer = c.createLyricsRenderer({
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
        setCore(c);
      })
      .catch((e) => console.error("[braccato] could not load the stage", e));
    return () => {
      alive = false;
      renderer?.destroy();
      rendererRef.current = null;
    };
  }, []);

  const data = useMemo(() => toBraccatoLyrics(lines), [lines]);

  useEffect(() => {
    if (!core || !rendererRef.current || !mountRef.current) return;
    rendererRef.current.setLyrics(data, { mount: mountRef.current });
    setBuilt(n => n + 1);
  }, [core, data]);

  // setTheme answers whether the lines need building again; if so they are rebuilt here and the
  // decorations follow the build count.
  useEffect(() => {
    const r = rendererRef.current;
    if (!core || !r || !mountRef.current) return;
    if (r.setTheme(themeFor({ letterWave }))) {
      r.setLyrics(data, { mount: mountRef.current });
      setBuilt(n => n + 1);
    }
  }, [core, letterWave]); // eslint-disable-line react-hooks/exhaustive-deps

  const retick = () => {
    const now = live.current.clock?.();
    if (now) rendererRef.current?.tick(now.t, { isPlaying: now.playing });
  };

  useDecorations({
    core, built, lines, translations, romaji, translationLang,
    getRenderer: () => rendererRef.current,
    getContainer: () => rendererRef.current?.container || mountRef.current?.querySelector(".blyrics-container"),
    isTicking: () => true,
    retick,
  });

  // The stage is only mounted while the video with captions is on screen, so it ticks for as long
  // as it exists.
  useEffect(() => {
    if (!core) return;
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      retick();
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [core]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      <div style={{
        position: "absolute", left: 0, right: 0, bottom: 0, height: "45%",
        background: "linear-gradient(to top, rgba(0,0,0,0.72), transparent)",
        opacity: onStage ? 1 : 0, transition: "opacity 0.4s ease",
      }} />
      <div ref={mountRef} className="kodama-braccato-stage"
        style={{ position: "absolute", inset: "0 40px 36px", "--blyrics-font-size": `${fontSize}px`, ...subSizes(translationFontSize, romajiFontSize) }} />
    </div>
  );
}
