import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChipLabel, ChipRoot } from "@heroui/react";
import { openUrl } from "@tauri-apps/plugin-opener";

import { CaretDown, UploadSimple } from "../../icons.jsx";
import { API } from "../../shared/api/client.js";
import { thumb } from "../../shared/api/thumbnails.js";
import { translate } from "../../i18n.js";
import { useLang } from "../../context.jsx";
import { parseLrc, parseTtml, parseDurationToSeconds } from "../../lyrics/parse.js";
import { fetchLyrics } from "../../lyrics/fetch.js";
import { DEFAULT_LYRICS_PROVIDERS } from "../../lyrics/providers.js";
import { LyricsBrowserModal } from "../../modals/lyrics-browser-modal.jsx";

// Open Boidu's Composer (community-lyrics editor) in its own Kodama window, pre-filled
// with the current track and pre-configured to use Kodama as its audio bridge. Window
// creation + the settings-seeding init script run in Rust (open_composer_window).
async function openComposer(videoId) {
  const { invoke } = await import("@tauri-apps/api/core");
  // Pause Kodama's own playback so the main player and the Composer's editor audio
  // don't play simultaneously (the App player component listens for this).
  try {
    window.dispatchEvent(new Event("kodama-pause-playback"));
  } catch { /* intentionally ignored */ }
  // Theme the composer with Kodama's current colours (applied as CSS-variable overrides).
  const overrides = {};
  try {
    const cs = getComputedStyle(document.documentElement);
    const read = (n) => cs.getPropertyValue(n).trim();
    const valid = (x) => x && /^[#0-9a-zA-Z(),.%\s-]{1,60}$/.test(x);
    const put = (composerVar, val) => {
      if (valid(val)) overrides[composerVar] = val;
    };
    const accent = read("--accent");
    put("--color-composer-accent", accent);
    put("--color-composer-accent-dark", accent);
    put("--color-composer-accent-darker", accent);
    put("--color-composer-accent-text", accent);
    put("--color-composer-link", accent);
    // The composer is dark-only — only theme its surfaces/text when Kodama is on a dark theme.
    if (document.documentElement.getAttribute("data-theme") !== "light") {
      put("--color-composer-bg", read("--bg-base"));
      put("--color-composer-bg-dark", read("--bg-base"));
      put("--color-composer-bg-elevated", read("--bg-elevated"));
      put("--color-composer-border", read("--border"));
      put("--color-composer-border-hover", read("--bg-hover"));
      put("--color-composer-button", read("--bg-elevated"));
      put("--color-composer-button-hover", read("--bg-hover"));
      put("--color-composer-input", read("--bg-elevated"));
      put("--color-composer-text", read("--text-primary"));
      put("--color-composer-text-secondary", read("--text-secondary"));
      put("--color-composer-text-muted", read("--text-muted"));
      put("--color-composer-text-tertiary", read("--text-muted"));
    }
  } catch { /* intentionally ignored */ }
  return invoke("open_composer_window", { videoId: videoId || null, overrides });
}

// zoomMaxRef: pass a ref to enable the per-syllable zoom (active line); pass null to
// disable it (trailing line — it just finishes its wipe quietly, no attention-grab).
// Paints a single karaoke word sequence (its own active-word index, stored under
// idxKey on idxRef). Main vocals and background vocals are painted as INDEPENDENT
// sequences so a bg line starting does not mark the main line as fully sung.
// Map each non-space word entry to its space-delimited word-group index (for word-level glow).
function wordGroupIndices(allWords) {
  const groups = [];
  let g = -1,
    inWord = false;
  for (const w of allWords || []) {
    if (w.isSpace) {
      inWord = false;
    } else {
      if (!inWord) {
        g++;
        inWord = true;
      }
      groups.push(g);
    }
  }
  return groups;
}

function paintWordSeq(words, els, idxRef, idxKey, t, zoomMaxRef, glow, groups) {
  if (!words.length || !els.length) return;
  let curWordIdx = -1;
  for (let wi = 0; wi < words.length; wi++) {
    if (t >= words[wi].time) curWordIdx = wi;
    else break;
  }
  const prevIdx = idxRef[idxKey] ?? -1;
  // Update non-active words only on word change (cheap)
  if (curWordIdx !== prevIdx) {
    idxRef[idxKey] = curWordIdx;
    // Zoom only on a genuine sequential forward step to a not-yet-zoomed syllable.
    // Guards against (a) double-zoom from time-interpolation jitter flipping the index
    // back and forth, and (b) a spurious zoom when the index jumps (seek / line catch-up).
    const doZoom = zoomMaxRef && curWordIdx === prevIdx + 1 && curWordIdx > zoomMaxRef.current;
    if (doZoom) zoomMaxRef.current = curWordIdx;
    for (let wi = 0; wi < els.length; wi++) {
      const el = els[wi];
      if (!el) continue;
      const dimEl = el.previousElementSibling;
      if (wi === curWordIdx) {
        // Fade-in: bright span was opacity=0 (future state) → animate to 1
        el.style.transition = "opacity 0.15s ease-out, text-shadow 0.4s ease-out";
        el.style.opacity = "1";
        // Gentle karaoke zoom: a smooth, soft scale on the syllable as it activates.
        // transform-origin left → the scale grows toward the right. No overshoot/bounce.
        if (doZoom) {
          const wrap = el.parentElement;
          if (wrap && wrap.animate) {
            // Scale the zoom duration to the syllable length so long words swell gently
            // over their whole duration instead of a quick fixed pop. Clamped so very
            // short syllables still read and very long ones don't drag.
            const word = words[curWordIdx];
            const sylMs = word ? (word.end - word.time) * 1000 : 440;
            const durMs = Math.min(1100, Math.max(300, sylMs));
            wrap.style.transformOrigin = "left center";
            // Per-segment ease-in-out → velocity reaches 0 at start, peak AND end, so the
            // swell rises and falls with no hard corner at the top. Much smoother than a
            // single easing across the whole pulse.
            wrap.animate(
              [
                { transform: "scale(1)", easing: "ease-in-out" },
                { transform: "scale(1.05)", offset: 0.5, easing: "ease-in-out" },
                { transform: "scale(1)" },
              ],
              { duration: durMs }
            );
          }
        }
      } else if (wi < curWordIdx) {
        // Past: keep bright span fully visible (same white as active)
        el.style.transition = "text-shadow 0.4s ease-out";
        el.style.WebkitMaskImage = "";
        el.style.maskImage = "";
        el.style.opacity = "1";
      } else {
        // Future: instant reset
        el.style.transition = "text-shadow 0.4s ease-out";
        el.style.opacity = "0";
        el.style.WebkitMaskImage = "linear-gradient(to right, black -6px, transparent 6px)";
        el.style.maskImage = "linear-gradient(to right, black -6px, transparent 6px)";
        if (dimEl) dimEl.style.color = "rgba(255,255,255,0.25)";
      }
      // Word-level glow (fluid): glow the segments of the active word that have ALREADY been
      // sung (incl. the one wiping) so the lit part of the word keeps glowing across syllable
      // changes; only fade out when the word itself changes. Not-yet-sung segments stay unlit.
      el.style.textShadow =
        glow && groups && curWordIdx >= 0 && wi <= curWordIdx && groups[wi] === groups[curWordIdx]
          ? "0 0 7px rgba(255,255,255,0.45)"
          : "";
    }
  }
  // Update active word mask every frame for smooth wipe (opacity handled by CSS transition)
  if (curWordIdx >= 0 && curWordIdx < els.length) {
    const el = els[curWordIdx];
    const word = words[curWordIdx];
    if (el && word) {
      const pct = Math.min(100, ((t - word.time) / Math.max(word.end - word.time, 0.001)) * 100);
      el.style.WebkitMaskImage = `linear-gradient(to right, black calc(${pct.toFixed(1)}% - 6px), transparent calc(${pct.toFixed(1)}% + 6px))`;
      el.style.maskImage = `linear-gradient(to right, black calc(${pct.toFixed(1)}% - 6px), transparent calc(${pct.toFixed(1)}% + 6px))`;
    }
  }
}

function paintLineWords(line, els, wordIdxRef, t, zoomMaxRef = null, glow = false) {
  if (!line || !els || els.length === 0) return;
  // DOM order of bright spans: main words first, then bg words. Split and paint each
  // as its own sequence so the two vocal streams never bleed into each other's fill.
  const mainWords = (line.words || []).filter((w) => !w.isSpace);
  const bgWords = (line.bgWords || []).filter((w) => !w.isSpace);
  const mainEls = mainWords.length ? els.slice(0, mainWords.length) : [];
  const bgEls = bgWords.length ? els.slice(mainWords.length) : [];
  paintWordSeq(
    mainWords,
    mainEls,
    wordIdxRef,
    "current",
    t,
    zoomMaxRef,
    glow,
    wordGroupIndices(line.words)
  );
  paintWordSeq(
    bgWords,
    bgEls,
    wordIdxRef,
    "bgCurrent",
    t,
    null,
    glow,
    wordGroupIndices(line.bgWords)
  );
}

export function LyricsOverlay({
  track,
  audioRef,
  fontSize = 32,
  providers = DEFAULT_LYRICS_PROVIDERS,
  refetchKey = 0,
  onAddToast,
  language = "de",
  forcedProvider = null,
  onSourceChange,
  onProviderFailed,
  showTranslation = false,
  translationLang = "DE",
  translationFontSize = 20,
  showRomaji = false,
  romajiFontSize = 18,
  onCustomLyricsStatusChange,
  importLyricsRef,
  removeCustomLyricsRef,
  showAgentTags = true,
  ambientVisualizer = true,
  syllableZoom = false,
  fluidLyrics = false,
  ambientBackground = false,
  fullscreen = false,
  playerBarVisible = false,
  onInstrumentalChange,
}) {
  // In fullscreen the player bar overlays the bottom of the lyrics view; lift the
  // bottom-anchored chips above it while it's visible so they aren't covered.
  const chipBottomLift = fullscreen && playerBarVisible ? 104 : 0;
  const [lyrics, setLyrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [source, setSource] = useState("");
  const [submitterName, setSubmitterName] = useState(null);
  const [browserOpen, setBrowserOpen] = useState(false);
  // Identifies the exact version currently shown (Unison submission id), so the browser
  // can mark the right one active when two versions share text + submitter.
  const [appliedVersionId, setAppliedVersionId] = useState(null);

  // Apply a specific version chosen from the lyrics browser, and remember it for this
  // song via the same per-video cache the normal fetch uses.
  const applyLyricsVersion = (r) => {
    if (!r?.lrc) return;
    setLyrics(r.lrc);
    setSource(r.source);
    setSubmitterName(r.submitterName || null);
    setAppliedVersionId(r.id ?? null);
    onSourceChange?.(r.source);
    try {
      localStorage.setItem(
        `kiyoshi-lyrics-${track?.videoId}`,
        JSON.stringify({
          lrc: r.lrc,
          source: r.source,
          submitterName: r.submitterName || null,
          versionId: r.id ?? null,
          failedIds: [],
        })
      );
    } catch { /* intentionally ignored */ }
  };
  const [tick, setTick] = useState(0);
  const [translations, setTranslations] = useState(null); // array of strings, one per lyric line
  const [, setTranslating] = useState(false);
  const [romajiLines, setRomajiLines] = useState(null); // array of romaji strings
  const [isCustomLyrics, setIsCustomLyrics] = useState(false);
  const [customLyricsKey, setCustomLyricsKey] = useState(0);
  const [, setInGap] = useState(false);
  const [trailingIdx, setTrailingIdx] = useState(-1); // previous line still visible after new line starts
  const [scrollActive, setScrollActive] = useState(false); // auto-hide scrollbar (hover + idle)
  const t = useLang();
  const containerRef = useRef(null);
  const scrollIdleRef = useRef(null);

  // Reveal the scrollbar on cursor activity, then auto-hide after a short idle.
  const wakeScrollbar = useCallback(() => {
    setScrollActive(true);
    if (scrollIdleRef.current) clearTimeout(scrollIdleRef.current);
    scrollIdleRef.current = setTimeout(() => setScrollActive(false), 3200);
  }, []);
  const sleepScrollbar = useCallback(() => {
    if (scrollIdleRef.current) clearTimeout(scrollIdleRef.current);
    // Linger before sliding out instead of snapping away on mouse-leave.
    scrollIdleRef.current = setTimeout(() => setScrollActive(false), 1600);
  }, []);
  useEffect(
    () => () => {
      if (scrollIdleRef.current) clearTimeout(scrollIdleRef.current);
    },
    []
  );
  // Briefly reveal the source badge (+ scrollbar) once lyrics have loaded, then let it idle-hide.
  useEffect(() => {
    if (source) wakeScrollbar();
  }, [source]); // eslint-disable-line react-hooks/exhaustive-deps
  const rafRef = useRef(null);
  const lyricsDataRef = useRef(null); // rAF loop reads lyrics without closure
  const syncedRef = useRef(false); // whether the current lyrics have real timestamps (not plain)
  const lastIdxRef = useRef(-1); // tracks active line to detect changes
  const prevTRef = useRef(0); // previous loop time — to detect backward seeks/restarts
  const inGapRef = useRef(false); // tracks inter-line gap state without closure
  const instVizRef = useRef(false); // tracks instrumental-segment state without closure
  const onInstChangeRef = useRef(onInstrumentalChange); // live prop for the rAF loop
  useEffect(() => {
    onInstChangeRef.current = onInstrumentalChange;
  });
  const trailingIdxRef = useRef(-1); // mirror of trailingIdx for RAF access without stale closure
  const wordElsRef = useRef([]); // DOM refs to active line's word spans
  const activeWordIdxRef = useRef(-1); // tracks active word within line
  const activeWordMaxRef = useRef(-1); // highest syllable already zoomed (dedupes the pop)
  const trailWordElsRef = useRef([]); // DOM refs to trailing line's word spans
  const activeTrailWordIdxRef = useRef(-1); // tracks active word within the trailing line
  const syllableZoomRef = useRef(syllableZoom); // read live in the rAF loop without re-subscribing
  useEffect(() => {
    syllableZoomRef.current = syllableZoom;
  }, [syllableZoom]);
  const fluidLyricsRef = useRef(fluidLyrics); // live read in the word-paint rAF (for the word glow)
  useEffect(() => {
    fluidLyricsRef.current = fluidLyrics;
  }, [fluidLyrics]);
  const bgContainerRef = useRef(null); // DOM ref to bg-vocals container (RAF-controlled opacity)
  // High-resolution playback time: interpolate between timeupdate events
  const audioSnapRef = useRef({ ct: 0, pt: 0, playing: false });

  // Keep lyricsDataRef in sync with state
  useEffect(() => {
    lyricsDataRef.current = lyrics;
    // Plain (unsynced) lyrics have time -1 on every line; only treat as synced if at least one
    // line carries a real timestamp.
    syncedRef.current = !!(lyrics && lyrics.some((l) => (l.time ?? -1) >= 0));
  }, [lyrics]);

  // Fetch translations when showTranslation is enabled, lyrics change, or target language changes
  useEffect(() => {
    if (!showTranslation || !lyrics || lyrics.length === 0) {
      if (!showTranslation) setTranslations(null);
      return;
    }
    const lines = lyrics.map((line) => {
      const main = line.wordSync ? (line.words || []).map((w) => w.text).join("") : line.text || "";
      const bg = (line.bgWords || []).map((w) => w.text).join("") || line.bgText || "";
      return bg ? `${main} ${bg}` : main;
    });
    setTranslating(true);
    setTranslations(null);
    fetch("http://localhost:9847/translate-lyrics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines, target_lang: translationLang }),
    })
      .then((r) => r.json())
      .then((d) => {
        setTranslations(d.translations || null);
      })
      .catch(() => setTranslations(null))
      .finally(() => setTranslating(false));
  }, [showTranslation, lyrics, translationLang]);

  // Fetch Romaji when toggle is enabled or lyrics change
  useEffect(() => {
    if (!showRomaji || !lyrics || lyrics.length === 0) {
      if (!showRomaji) setRomajiLines(null);
      return;
    }
    const lines = lyrics.map((line) => {
      const main = line.wordSync ? (line.words || []).map((w) => w.text).join("") : line.text || "";
      const bg = (line.bgWords || []).map((w) => w.text).join("") || line.bgText || "";
      return bg ? `${main} ${bg}` : main;
    });
    fetch("http://localhost:9847/romanize-lyrics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines }),
    })
      .then((r) => r.json())
      .then((d) => {
        setRomajiLines(d.romanizations || null);
      })
      .catch(() => setRomajiLines(null));
  }, [showRomaji, lyrics]);

  // Sync audio snap so the rAF loop can interpolate currentTime at 60 fps
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const snap = () => {
      audioSnapRef.current = {
        ct: audio.currentTime,
        pt: performance.now(),
        playing: !audio.paused,
      };
    };
    audio.addEventListener("timeupdate", snap);
    audio.addEventListener("play", snap);
    audio.addEventListener("pause", snap);
    audio.addEventListener("seeked", snap);
    snap(); // initial
    return () => {
      audio.removeEventListener("timeupdate", snap);
      audio.removeEventListener("play", snap);
      audio.removeEventListener("pause", snap);
      audio.removeEventListener("seeked", snap);
    };
  }, [audioRef]);

  // rAF loop: line changes trigger React re-render; word highlighting is direct DOM manipulation
  useEffect(() => {
    const loop = () => {
      const { ct, pt, playing } = audioSnapRef.current;
      const t = playing ? ct + (performance.now() - pt) / 1000 : ct;
      const lyr = lyricsDataRef.current;

      // Line detection — React re-render only when line changes
      // Plain lyrics: every line has time -1, so the reduce would mark the LAST line active and
      // auto-scroll to the bottom. No timestamps → no active line, no scroll.
      const newIdx =
        lyr && syncedRef.current ? lyr.reduce((b, l, i) => (l.time <= t ? i : b), -1) : -1;

      // Backward seek / restart (e.g. "previous" restarting the current song): time jumped
      // back >1s. videoId is unchanged so the song-change reset doesn't fire — handle it here.
      // Landing before the first line snaps to the top; landing on a line lets the centring
      // effect treat it as a jump (instant). A normal forward mid-song gap is unaffected.
      if (t < prevTRef.current - 1) {
        lastCenteredIdxRef.current = -1;
        if (newIdx < 0) {
          // Glide back to the top instead of a hard cut.
          scrollTargetRef.current = 0;
          scrollHistRef.current = [];
          if (!fluidLyricsRef.current)
            containerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
          // Fluid: leave scrollPos/velocity so the spring glides smoothly to the new target.
        }
      }
      prevTRef.current = t;

      // Gap detection: if gap between line's endTime and next line's start > 3s, deactivate at endTime
      let displayIdx = newIdx;
      if (newIdx >= 0 && lyr) {
        const line = lyr[newIdx];
        if (line.endTime != null) {
          const nextStart = lyr[newIdx + 1]?.time ?? Infinity;
          if (nextStart - line.endTime > 3 && t >= line.endTime) displayIdx = -1;
        }
      }

      if (displayIdx !== lastIdxRef.current) {
        const prevIdx = lastIdxRef.current;
        // If the previous line's endTime hasn't been reached yet, keep it visible as
        // a "trailing" line so it finishes naturally while the new line is already active.
        const newTrailing =
          prevIdx >= 0 && lyr?.[prevIdx]?.endTime != null && t < lyr[prevIdx].endTime
            ? prevIdx
            : -1;
        if (newTrailing !== trailingIdxRef.current) {
          trailingIdxRef.current = newTrailing;
          setTrailingIdx(newTrailing);
          // Reset trailing word tracking so the new trailing line gets a full repaint
          trailWordElsRef.current = [];
          activeTrailWordIdxRef.current = -1;
          activeTrailWordIdxRef.bgCurrent = -1;
        }
        lastIdxRef.current = displayIdx;
        activeWordIdxRef.current = -1;
        activeWordIdxRef.bgCurrent = -1;
        activeWordMaxRef.current = -1; // reset zoom dedupe for the new active line
        wordElsRef.current = []; // cleared until useLayoutEffect repopulates after render
        bgContainerRef.current = null; // clear so RAF doesn't update the old line's element
        setTick((n) => n + 1);
      }

      // Expire trailing line once its endTime is reached
      if (trailingIdxRef.current >= 0) {
        const trailEnd = lyr?.[trailingIdxRef.current]?.endTime;
        if (trailEnd != null && t >= trailEnd) {
          trailingIdxRef.current = -1;
          setTrailingIdx(-1);
        }
      }

      // Gap indicator: true only when a line has played but we're between lines (gap > 3s)
      const isGap = newIdx >= 0 && displayIdx === -1;
      if (isGap !== inGapRef.current) {
        inGapRef.current = isGap;
        setInGap(isGap);
      }

      // Instrumental segment: no active line and the next vocal is still ≥ INSTR_LEAD away
      // (covers a long intro, mid-song breaks, and the outro). Synced lyrics only — plain
      // lyrics have time -1 and never resolve to displayIdx -1.
      let inst = false;
      if (displayIdx === -1 && lyr && lyr.length) {
        let nextStart = Infinity;
        for (let i = 0; i < lyr.length; i++) {
          if (lyr[i].time > t) {
            nextStart = lyr[i].time;
            break;
          }
        }
        if (nextStart - t > 2) inst = true; // 2s lead so vocals are back before the cover clears
      }
      if (inst !== instVizRef.current) {
        instVizRef.current = inst;
        onInstChangeRef.current?.(inst);
      }

      // Word highlighting — direct DOM, bypasses React entirely.
      // ACTIVE line animates from newIdx. The TRAILING line (handed over before its
      // endTime) keeps animating in parallel so it finishes its syllable wipe instead
      // of snapping fully white. Both run through the same paintLineWords routine.
      const lyrLine = lyr?.[newIdx];
      // Zoom enabled only when the setting is on (pass null to disable per-syllable pop).
      paintLineWords(
        lyrLine,
        wordElsRef.current,
        activeWordIdxRef,
        t,
        syllableZoomRef.current ? activeWordMaxRef : null,
        fluidLyricsRef.current
      );
      if (trailingIdxRef.current >= 0) {
        // Trailing line: no zoom (null) — it only finishes its wipe quietly.
        paintLineWords(
          lyr?.[trailingIdxRef.current],
          trailWordElsRef.current,
          activeTrailWordIdxRef,
          t,
          null,
          fluidLyricsRef.current
        );
      }

      // BG vocals: fade in container independently based on bg-vocals' own start time
      if (bgContainerRef.current && lyrLine?.bgWords?.length) {
        const bgStart = lyrLine.bgWords.find((w) => !w.isSpace)?.time;
        if (bgStart != null) {
          const bgActive = t >= bgStart;
          bgContainerRef.current.style.opacity = bgActive ? "1" : "0.35";
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [audioRef]);

  // After React renders, cache word span elements and bg-vocals container for the active line
  useLayoutEffect(() => {
    const idx = lastIdxRef.current;
    if (idx >= 0) {
      // Scope to this instance's own container — Big Picture mounts a second LyricsOverlay while
      // the desktop one may still be in the DOM, and a global querySelector would grab the wrong
      // (earlier-in-document) instance's spans, leaving this instance's words unpainted.
      const root = containerRef.current || document;
      const lineEl = root.querySelector(`[data-lyric-idx="${idx}"]`);
      wordElsRef.current = lineEl ? Array.from(lineEl.querySelectorAll("[data-word-bright]")) : [];
      bgContainerRef.current = lineEl ? lineEl.querySelector("[data-bg-container]") : null;
    } else {
      wordElsRef.current = [];
      bgContainerRef.current = null;
    }
    // Trailing line: cache its word spans and paint them immediately so already-sung
    // syllables stay bright (no 1-frame dim flash) while the line finishes its wipe.
    const tIdx = trailingIdxRef.current;
    if (tIdx >= 0) {
      const trailEl = (containerRef.current || document).querySelector(
        `[data-lyric-idx="${tIdx}"]`
      );
      trailWordElsRef.current = trailEl
        ? Array.from(trailEl.querySelectorAll("[data-word-bright]"))
        : [];
      activeTrailWordIdxRef.current = -1;
      activeTrailWordIdxRef.bgCurrent = -1;
      const { ct, pt, playing } = audioSnapRef.current;
      const tNow = playing ? ct + (performance.now() - pt) / 1000 : ct;
      paintLineWords(
        lyricsDataRef.current?.[tIdx],
        trailWordElsRef.current,
        activeTrailWordIdxRef,
        tNow,
        null,
        fluidLyricsRef.current
      );
    } else {
      trailWordElsRef.current = [];
    }
  }, [tick, trailingIdx]);

  // Sync isCustomLyrics to parent
  useEffect(() => {
    onCustomLyricsStatusChange?.(isCustomLyrics);
  }, [isCustomLyrics]); // eslint-disable-line react-hooks/exhaustive-deps

  // Import lyrics: open file dialog, read content, POST to backend
  const importCustomLyrics = async () => {
    if (!track?.videoId) return;
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const path = await open({
        filters: [{ name: "Lyrics", extensions: ["lrc", "ttml"] }],
        title: "Lyrics importieren",
      });
      if (!path) return;
      const { readTextFile } = await import("@tauri-apps/plugin-fs");
      const content = await readTextFile(path);
      const fmt = path.toLowerCase().endsWith(".ttml") ? "ttml" : "lrc";
      const r = await fetch(`${API}/lyrics/custom`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: track.videoId, content, format: fmt }),
      });
      if (!r.ok) throw new Error("Speichern fehlgeschlagen");
      const parsed = fmt === "ttml" ? parseTtml(content) : parseLrc(content);
      setLyrics(parsed.length ? parsed : null);
      setSource("Custom");
      onSourceChange?.("Custom");
      setIsCustomLyrics(true);
      setLoading(false);
      onAddToast?.("Lyrics importiert", "success");
    } catch (e) {
      onAddToast?.("Import fehlgeschlagen", "error");
      console.error(e);
    }
  };

  // Remove custom lyrics
  const removeCustomLyrics = async () => {
    if (!track?.videoId) return;
    try {
      await fetch(`${API}/lyrics/custom/${track.videoId}`, { method: "DELETE" });
    } catch { /* intentionally ignored */ }
    setIsCustomLyrics(false);
    setLyrics(null);
    setSource("");
    onSourceChange?.("");
    setLoading(true);
    // Trigger a fresh provider fetch by bumping a local key
    setCustomLyricsKey((k) => k + 1);
  };

  // Expose functions via refs for parent
  useEffect(() => {
    if (importLyricsRef) importLyricsRef.current = importCustomLyrics;
    if (removeCustomLyricsRef) removeCustomLyricsRef.current = removeCustomLyrics;
  });

  useEffect(() => {
    if (!track) return;
    setLoading(true);
    setLyrics(null);
    setIsCustomLyrics(false);

    const cacheKey = `kiyoshi-lyrics-${track.videoId}`;

    // Check for custom lyrics first
    fetch(`${API}/lyrics/custom/${track.videoId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.content) {
          const parsed = data.format === "ttml" ? parseTtml(data.content) : parseLrc(data.content);
          if (parsed.length) {
            setLyrics(parsed);
            setSource("Custom");
            onSourceChange?.("Custom");
            setIsCustomLyrics(true);
            setLoading(false);
            return;
          }
        }
        // No custom lyrics — proceed with normal fetch
        continueWithProviders();
      })
      .catch(() => continueWithProviders());

    function continueWithProviders() {
      // Forced provider: skip cache, fetch only that one provider
      if (forcedProvider) {
        const singleProviders = DEFAULT_LYRICS_PROVIDERS.map((p) => ({
          ...p,
          enabled: p.id === forcedProvider,
        }));
        fetchLyrics(
          track.title,
          track.artists,
          track.album,
          parseDurationToSeconds(track.duration),
          singleProviders,
          track.videoId || ""
        ).then((res) => {
          if (res?.lrc) {
            setLyrics(res.lrc);
            setSource(res.source);
            setSubmitterName(res.submitterName || null);
            setAppliedVersionId(null);
            onSourceChange?.(res.source);
          } else {
            setLyrics(null);
            setSubmitterName(null);
            onSourceChange?.("");
            onProviderFailed?.(forcedProvider);
          }
          setLoading(false);
        });
        return;
      }

      // Check localStorage cache first (keyed by videoId), skip if refetching
      if (refetchKey === 0) {
        try {
          const cached = localStorage.getItem(cacheKey);
          if (cached) {
            const parsed = JSON.parse(cached);
            const { lrc, source, submitterName: cachedSubmitter } = parsed;
            // Invalidate old Unison cache entries that predate submitterName support
            if (source === "Unison" && !("submitterName" in parsed)) {
              localStorage.removeItem(cacheKey);
              throw new Error("stale");
            }
            setLyrics(lrc);
            setSource(source);
            setSubmitterName(cachedSubmitter || null);
            setAppliedVersionId(parsed.versionId ?? null);
            onSourceChange?.(source);
            setLoading(false);
            if (Array.isArray(parsed.failedIds)) {
              // Already have availability info — use immediately
              parsed.failedIds.forEach((id) => onProviderFailed?.(id));
            } else {
              // Old cache entry — check availability silently in background
              fetchLyrics(
                track.title,
                track.artists,
                track.album,
                parseDurationToSeconds(track.duration),
                providers,
                track.videoId || ""
              ).then((res) => {
                const ids = res?.failedIds || [];
                ids.forEach((id) => onProviderFailed?.(id));
                try {
                  localStorage.setItem(
                    cacheKey,
                    JSON.stringify({
                      lrc,
                      source,
                      submitterName: cachedSubmitter || null,
                      failedIds: ids,
                    })
                  );
                } catch { /* intentionally ignored */ }
              });
            }
            return;
          }
        } catch { /* intentionally ignored */ }
      } else {
        // Clear stale cache before refetching
        try {
          localStorage.removeItem(cacheKey);
        } catch { /* intentionally ignored */ }
      }

      fetchLyrics(
        track.title,
        track.artists,
        track.album,
        parseDurationToSeconds(track.duration),
        providers,
        track.videoId || ""
      ).then((res) => {
        if (res?.lrc) {
          setLyrics(res.lrc);
          setSource(res.source);
          setSubmitterName(res.submitterName || null);
          setAppliedVersionId(null);
          onSourceChange?.(res.source);
          try {
            localStorage.setItem(
              cacheKey,
              JSON.stringify({
                lrc: res.lrc,
                source: res.source,
                submitterName: res.submitterName || null,
                failedIds: res.failedIds || [],
              })
            );
          } catch { /* intentionally ignored */ }
        }
        // Mark providers that were tried but failed
        res?.failedIds?.forEach((id) => onProviderFailed?.(id));
        setLoading(false);
      });
    } // end continueWithProviders
  }, [track, refetchKey, forcedProvider, customLyricsKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeIdx = lastIdxRef.current;
  const lyricsSynced = !!(lyrics && lyrics.some((l) => (l.time ?? -1) >= 0));

  // Unique agents in order of first appearance (only when ≥2 distinct named agents)
  const lyricsAgents = useMemo(() => {
    if (!lyrics) return [];
    const seen = new Set();
    const result = [];
    for (const line of lyrics) {
      const key = line.agent?.id || line.agent?.name;
      if (key && line.agent.name && !seen.has(key)) {
        seen.add(key);
        result.push(line.agent);
      }
    }
    return result;
  }, [lyrics]);

  const activeAgent = lyrics?.[activeIdx]?.agent;

  // Centre the active line. Fluid mode drives scrollTop with a critically-damped spring
  // (SmoothDamp) — soft, no overshoot, and velocity-continuous so rapid line changes carry
  // their momentum (organic Apple-Music glide); otherwise the browser's native smooth scroll.
  const scrollTargetRef = useRef(0);
  const scrollPosRef = useRef(0);
  const scrollVelRef = useRef(0);
  const scrollLastTimeRef = useRef(0);
  const userScrollUntilRef = useRef(0);
  const scrollHistRef = useRef([]); // recent {t,s} scroll positions for the staggered drift
  const activeIdxRef = useRef(activeIdx);
  activeIdxRef.current = activeIdx; // read live in the scroll rAF (which doesn't re-run per line)
  const lastCenteredIdxRef = useRef(-1); // last line we centred on — used to detect jumps

  // On song change, snap back to the top and reset the spring state — otherwise the new
  // lyrics inherit the previous song's scroll offset until the first active line appears.
  // Also neutralise the time snapshot + last index: when the new track's lyrics are cached
  // they render instantly, and a stale (advanced) time from the previous song would
  // otherwise resolve to a mid-song line and scroll there before the real time arrives.
  useEffect(() => {
    const c = containerRef.current;
    if (c) c.scrollTop = 0;
    scrollPosRef.current = 0;
    scrollTargetRef.current = 0;
    scrollVelRef.current = 0;
    scrollHistRef.current = [];
    userScrollUntilRef.current = 0;
    lastIdxRef.current = -1;
    lastCenteredIdxRef.current = -1;
    prevTRef.current = 0;
    // Reset to t=0 (new track) but keep the prior playing state so the interpolated time keeps
    // advancing instead of freezing at 0 until the next audio event corrects it.
    audioSnapRef.current = { ct: 0, pt: performance.now(), playing: audioSnapRef.current.playing };
    instVizRef.current = false;
    onInstChangeRef.current?.(false);
  }, [track?.videoId]);

  useEffect(() => {
    if (activeIdx < 0 || !containerRef.current) return;
    const container = containerRef.current;
    // Fluid wraps each line in a will-change:transform div (its own offsetParent), so the
    // inner [data-lyric] offsetTop is ~0 — measure the wrapper for positioning instead.
    const sel = fluidLyrics ? "[data-lyricdrift]" : "[data-lyric]";
    const measure = () => {
      const activeEl = container.querySelectorAll(sel)[activeIdx];
      if (!activeEl) return null;
      return Math.max(
        0,
        activeEl.offsetTop - container.clientHeight / 2 + activeEl.clientHeight / 2
      );
    };
    let target = measure();
    if (target == null) return;
    // A jump (song change, seek, or skipping >1 line) snaps instantly so it lands centred;
    // sequential line advances scroll smoothly. lastCenteredIdxRef is -1 right after a reset.
    const prev = lastCenteredIdxRef.current;
    const jump = prev < 0 || Math.abs(activeIdx - prev) > 1;
    lastCenteredIdxRef.current = activeIdx;
    if (!fluidLyrics) {
      container.scrollTo({ top: target, behavior: jump ? "auto" : "smooth" });
    } else {
      scrollTargetRef.current = target;
      if (jump) {
        scrollPosRef.current = target;
        scrollVelRef.current = 0;
        container.scrollTop = target;
      }
    }
    // On a jump the new lyrics/line may still be settling (fonts, translations, wrapping) —
    // re-measure on the next frame and correct so it lands exactly centred.
    if (jump) {
      requestAnimationFrame(() => {
        if (!containerRef.current || activeIdxRef.current !== activeIdx) return;
        const t2 = measure();
        if (t2 == null || Math.abs(t2 - target) < 1) return;
        if (!fluidLyrics) container.scrollTo({ top: t2, behavior: "auto" });
        else {
          scrollTargetRef.current = t2;
          scrollPosRef.current = t2;
          scrollVelRef.current = 0;
          container.scrollTop = t2;
        }
      });
    }
  }, [activeIdx, fluidLyrics]);

  useEffect(() => {
    if (!fluidLyrics) return;
    const container = containerRef.current;
    if (!container) return;
    scrollPosRef.current = container.scrollTop;
    scrollVelRef.current = 0;
    scrollLastTimeRef.current = performance.now();
    scrollHistRef.current = [];
    const wraps = container.querySelectorAll("[data-lyricdrift]");
    let raf = 0;
    const onUserScroll = () => {
      userScrollUntilRef.current = performance.now() + 2000;
      scrollPosRef.current = container.scrollTop;
      scrollVelRef.current = 0;
    };
    container.addEventListener("wheel", onUserScroll, { passive: true });
    container.addEventListener("touchmove", onUserScroll, { passive: true });

    // Spring from the Apple-Music video analysis: stiffness 120 / damping 20 / mass 1
    // (damping ratio ~0.91 → <1% overshoot, ~650ms settle). Velocity-continuous.
    const K = 120,
      C = 20,
      STAGGER = 0.05; // s of lag per line of distance (elastic chain)
    const histAt = (hist, t) => {
      if (hist.length === 0) return scrollPosRef.current;
      if (t <= hist[0].t) return hist[0].s;
      for (let i = hist.length - 1; i >= 0; i--) {
        if (hist[i].t <= t) {
          const a = hist[i],
            b = hist[i + 1] || a;
          return b.t === a.t ? a.s : a.s + (b.s - a.s) * ((t - a.t) / (b.t - a.t));
        }
      }
      return hist[hist.length - 1].s;
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      const dt = Math.min((now - scrollLastTimeRef.current) / 1000, 0.04);
      scrollLastTimeRef.current = now;

      if (now < userScrollUntilRef.current) {
        scrollPosRef.current = container.scrollTop;
      } else {
        const target = scrollTargetRef.current;
        let p = scrollPosRef.current,
          v = scrollVelRef.current;
        const steps = Math.max(1, Math.ceil(dt / 0.008)); // sub-step for stability
        const h = dt / steps;
        for (let s = 0; s < steps; s++) {
          v += (-K * (p - target) - C * v) * h;
          p += v * h;
        }
        if (Math.abs(p - target) < 0.15 && Math.abs(v) < 0.5) {
          p = target;
          v = 0;
        }
        scrollPosRef.current = p;
        scrollVelRef.current = v;
        container.scrollTop = p;
      }

      // Scroll-position history (for the staggered drift lookup).
      const hist = scrollHistRef.current;
      hist.push({ t: now, s: scrollPosRef.current });
      while (hist.length > 2 && hist[0].t < now - 600) hist.shift();

      // Staggered positional drift ("rubber-band" chain): each line is shifted to the scroll
      // position from (distance × STAGGER) ago → it lags behind and catches up elastically.
      const ai = activeIdxRef.current;
      const cur = scrollPosRef.current;
      for (let n = 0; n < wraps.length; n++) {
        const dist = Math.abs(n - ai);
        if (dist === 0) {
          if (wraps[n].style.transform) wraps[n].style.transform = "";
          continue;
        }
        const drift = Math.max(
          -34,
          Math.min(34, cur - histAt(hist, now - Math.min(dist, 8) * STAGGER * 1000))
        );
        wraps[n].style.transform = Math.abs(drift) > 0.1 ? `translateY(${drift.toFixed(2)}px)` : "";
      }
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      container.removeEventListener("wheel", onUserScroll);
      container.removeEventListener("touchmove", onUserScroll);
      wraps.forEach((w) => {
        w.style.transform = "";
      });
    };
  }, [fluidLyrics, lyrics]);

  return (
    <div
      onMouseMove={wakeScrollbar}
      onWheel={wakeScrollbar}
      onMouseLeave={sleepScrollbar}
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* Fluid: a strong blurred + saturated album cover as the backdrop (Apple-style),
          replacing the ambient blobs. Darkened so the white lyrics stay high-contrast. */}
      {fluidLyrics && !ambientBackground && track?.thumbnail && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 0,
            pointerEvents: "none",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: "-12%",
              backgroundImage: `url(${thumb(track.thumbnail)})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: "blur(90px) saturate(1.4) brightness(0.5)",
              transform: "scale(1.25)",
            }}
          />
        </div>
      )}
      {/* Ambient colour blobs — wrapped in an isolated layer so their mix-blend-mode
          stays contained and doesn't flatten the backdrop for the chips' backdrop-filter. */}
      {ambientVisualizer && !fluidLyrics && !ambientBackground && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
            pointerEvents: "none",
            isolation: "isolate",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: "-30%",
              pointerEvents: "none",
              background:
                "radial-gradient(ellipse 38% 30% at 44% 42%, var(--accent) 0%, transparent 70%)",
              mixBlendMode: "screen",
              animation: "blobDrift1 18s ease-in-out infinite",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: "-30%",
              pointerEvents: "none",
              background:
                "radial-gradient(ellipse 32% 38% at 63% 61%, #7b2ff7 0%, transparent 68%)",
              mixBlendMode: "screen",
              animation: "blobDrift2 23s ease-in-out infinite",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: "-30%",
              pointerEvents: "none",
              background:
                "radial-gradient(ellipse 44% 36% at 52% 46%, #1565c0 0%, transparent 65%)",
              mixBlendMode: "screen",
              animation: "blobDrift3 29s ease-in-out infinite",
            }}
          />
        </div>
      )}

      {/* Source badge — HeroUI Chip, glassy. Auto-hides with a slide-out like the
          scrollbar: revealed on cursor activity, slides off-right after idle. */}
      <div
        style={{
          position: "absolute",
          bottom: 12 + chipBottomLift,
          right: 16,
          zIndex: 2,
          display: "flex",
          alignItems: "center",
          gap: 6,
          transform: scrollActive ? "translateX(0)" : "translateX(calc(100% + 16px))",
          opacity: scrollActive ? 1 : 0,
          transition:
            "transform 0.42s cubic-bezier(0.4,0,0.2,1), opacity 0.32s ease, bottom 0.4s ease",
          pointerEvents: scrollActive ? "auto" : "none",
        }}
      >
        {source && (
          <button
            onClick={() => setBrowserOpen(true)}
            title={translate(language, "browseLyrics")}
            className="border-0 bg-transparent p-0 cursor-default"
          >
            <ChipRoot
              size="sm"
              className="border-0! px-3.5! py-1.5! transition-all duration-200 hover:brightness-125"
              style={{
                background: "rgba(255,255,255,0.1)",
                color: "rgba(255,255,255,0.9)",
                backdropFilter: "blur(18px)",
                WebkitBackdropFilter: "blur(18px)",
              }}
            >
              <ChipLabel
                className="font-semibold tracking-wide flex items-center gap-1.5"
                style={{ fontSize: "var(--t10)" }}
              >
                {source}
                {submitterName && <span style={{ opacity: 0.55 }}> · {submitterName}</span>}
                <CaretDown size={9} weight="bold" style={{ opacity: 0.6 }} />
              </ChipLabel>
            </ChipRoot>
          </button>
        )}
      </div>

      {browserOpen && (
        <LyricsBrowserModal
          track={track}
          providers={providers}
          currentSource={source}
          currentSubmitter={submitterName}
          currentVersionId={appliedVersionId}
          onApply={applyLyricsVersion}
          onClose={() => setBrowserOpen(false)}
        />
      )}

      {/* Agent tags — bottom center, only when ≥2 named agents and toggle is on */}
      {showAgentTags && lyricsAgents.length >= 2 && (
        <div
          style={{
            position: "absolute",
            bottom: 14 + chipBottomLift,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 2,
            display: "flex",
            gap: 8,
            pointerEvents: "none",
            transition: "bottom 0.4s ease",
          }}
        >
          {lyricsAgents.map((agent) => {
            const key = agent.id || agent.name;
            const isActive = (activeAgent?.id || activeAgent?.name) === key;
            return (
              <ChipRoot
                key={key}
                size="sm"
                className="border-0! uppercase font-bold whitespace-nowrap px-3.5! py-1.5! transition-all duration-300"
                style={{
                  background: isActive
                    ? "color-mix(in srgb, var(--accent) 40%, transparent)"
                    : "rgba(255,255,255,0.08)",
                  color: isActive ? "#fff" : "rgba(255,255,255,0.5)",
                  backdropFilter: "blur(18px)",
                  WebkitBackdropFilter: "blur(18px)",
                  boxShadow: isActive
                    ? "0 2px 16px color-mix(in srgb, var(--accent) 32%, transparent)"
                    : "none",
                }}
              >
                <ChipLabel style={{ fontSize: 10, letterSpacing: "0.07em" }}>
                  {agent.name}
                </ChipLabel>
              </ChipRoot>
            );
          })}
        </div>
      )}

      {/* Lyrics */}
      <div
        ref={containerRef}
        className="lyrics-scroll"
        data-scroll-active={scrollActive ? "true" : "false"}
        style={{
          position: "relative",
          zIndex: 1,
          flex: 1,
          overflowY: "auto",
          padding: "40vh 80px 40vh",
          // Fluid: soft top/bottom edge-fade so lines dissolve instead of hard-clipping.
          ...(fluidLyrics
            ? {
                maskImage:
                  "linear-gradient(to bottom, transparent 0, #000 110px, #000 calc(100% - 110px), transparent 100%)",
                WebkitMaskImage:
                  "linear-gradient(to bottom, transparent 0, #000 110px, #000 calc(100% - 110px), transparent 100%)",
              }
            : {}),
        }}
      >
        {loading && (
          <div style={{ textAlign: "center", color: "var(--text-muted)", marginTop: 60 }}>
            {t("lyricsLoading")}
          </div>
        )}
        {!loading && !lyrics && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 16,
              marginTop: 60,
            }}
          >
            <div style={{ color: "rgba(255,255,255,0.75)", fontSize: "var(--t14)" }}>
              {t("noLyrics")}
            </div>
            <div style={{ color: "rgba(255,255,255,0.45)", fontSize: "var(--t12)" }}>
              {t("noLyricsHint")}
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              {/* Akari's LRC Maker */}
              <button
                onClick={() => openUrl("https://lrc-maker.github.io").catch(console.error)}
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "none",
                  borderRadius: 10,
                  padding: "8px 16px",
                  cursor: "default",
                  color: "#fff",
                  fontSize: "var(--t13)",
                  fontFamily: "var(--font)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.16)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                }}
              >
                <img src="/Akari's LRC Icon.svg" style={{ width: 26, height: 26 }} alt="" />
                {"Akari's LRC Maker"}
              </button>
              {/* Boidu's Composer — embedded in a Kodama window */}
              <button
                onClick={() => openComposer(track?.videoId).catch(console.error)}
                style={{
                  background: "rgba(255,255,255,0.08)",
                  border: "none",
                  borderRadius: 10,
                  padding: "8px 16px",
                  cursor: "default",
                  color: "#fff",
                  fontSize: "var(--t13)",
                  fontFamily: "var(--font)",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  transition: "background 0.15s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.16)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "rgba(255,255,255,0.08)";
                }}
              >
                <img src="/Boidu Composer Icon.svg" style={{ width: 26, height: 26 }} alt="" />
                {"Boidu's Composer"}
              </button>
            </div>
            <button
              onClick={importCustomLyrics}
              style={{
                background: "rgba(255,255,255,0.06)",
                border: "none",
                borderRadius: 10,
                padding: "8px 20px",
                cursor: "default",
                color: "#fff",
                fontSize: "var(--t13)",
                fontFamily: "var(--font)",
                display: "flex",
                alignItems: "center",
                gap: 8,
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.12)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "rgba(255,255,255,0.06)";
              }}
            >
              <UploadSimple size={14} />
              {t("importLyrics")}
            </button>
          </div>
        )}
        {lyrics &&
          lyrics.map((line, i) => {
            const isActive = i === activeIdx;
            const isTrailing = i === trailingIdx; // previous line still playing while new one is active
            const isPast = i < activeIdx && !isTrailing;
            const isFuture = !isActive && !isTrailing && !isPast;

            const lineText = line.wordSync
              ? (line.words || []).map((w) => w.text).join("")
              : line.text || "\u00A0";

            // Trailing line looks identical to the active line — full opacity, no blur.
            // The existing CSS transition (0.4s) will carry it smoothly into the past
            // style once trailingIdx clears when endTime is reached.
            let blur, opacity;
            if (!lyricsSynced) {
              blur = 0;
              opacity = 0.9;
            } // plain lyrics: all readable, no active line
            else if (isActive || isTrailing) {
              blur = 0;
              opacity = 1;
            } else if (isPast) {
              blur = 3;
              opacity = 0.4;
            } else {
              blur = 0;
              opacity = 0.35;
            }
            // Fluid: upcoming (future) lines sit darker than already-sung ones.
            if (lyricsSynced && fluidLyrics && isFuture) opacity = 0.22;

            const seekable = line.time >= 0;
            const agentRole = line.agentRole; // "lead", "featured", "group", or null
            const textAlign =
              agentRole === "featured" ? "right" : agentRole === "group" ? "center" : "left";
            // Trailing spaces in the word list would sit at the right edge and push a
            // right-aligned active line visually left. Drop them so it stays flush-right.
            let renderWords = line.words || [];
            {
              let n = renderWords.length;
              while (n > 0 && renderWords[n - 1].isSpace) n--;
              renderWords = renderWords.slice(0, n);
            }
            const lineNode = (
              <div
                key={i}
                data-lyric="true"
                data-lyric-idx={i}
                onClick={
                  seekable
                    ? () => {
                        audioRef.current.currentTime = line.time;
                      }
                    : undefined
                }
                onMouseEnter={
                  seekable
                    ? (e) => {
                        e.currentTarget.style.opacity = Math.min(1, opacity + 0.25);
                      }
                    : undefined
                }
                onMouseLeave={
                  seekable
                    ? (e) => {
                        e.currentTarget.style.opacity = opacity;
                      }
                    : undefined
                }
                style={{
                  fontSize: fontSize,
                  fontWeight: 700,
                  lineHeight: 1.5,
                  marginBottom: 24,
                  cursor: "default",
                  filter: `blur(${blur}px)`,
                  opacity,
                  transform: fluidLyrics
                    ? `scale(${isActive || isTrailing ? 1.06 : 1})`
                    : undefined,
                  transformOrigin:
                    textAlign === "right"
                      ? "right center"
                      : textAlign === "center"
                        ? "center center"
                        : "left center",
                  transition: fluidLyrics
                    ? "transform 0.25s ease-out, opacity 0.4s ease-out, filter 0.4s ease-out"
                    : "filter 0.4s ease, opacity 0.4s ease",
                  userSelect: "none",
                  borderRadius: 8,
                  padding: "2px 8px",
                  margin: "0 -8px 24px",
                  textAlign,
                }}
              >
                {(isActive || isTrailing) && line.wordSync ? (
                  <span style={{ whiteSpace: "pre-wrap" }}>
                    {renderWords.map((word, wi) =>
                      word.isSpace ? (
                        <span key={wi}>{word.text}</span>
                      ) : (
                        <span key={wi} style={{ position: "relative", display: "inline-block" }}>
                          <span style={{ color: "rgba(255,255,255,0.25)" }}>{word.text}</span>
                          <span
                            data-word-bright="true"
                            style={{
                              position: "absolute",
                              top: 0,
                              left: 0,
                              right: 0,
                              bottom: 0,
                              color: "white",
                              opacity: 0,
                              WebkitMaskImage:
                                "linear-gradient(to right, black -6px, transparent 6px)",
                              maskImage: "linear-gradient(to right, black -6px, transparent 6px)",
                              pointerEvents: "none",
                            }}
                          >
                            {word.text}
                          </span>
                        </span>
                      )
                    )}
                  </span>
                ) : (
                  <span style={{ color: "#fff" }}>{lineText}</span>
                )}
                {/* Background vocals — rendered in smaller text below the main line.
                  Initial opacity when isActive: 0.35 (dim). RAF loop sets it to 1
                  only when t >= bgWords[0].time so it activates independently. */}
                {line.bgWords?.length > 0 && (
                  <div
                    data-bg-container="true"
                    style={{
                      fontSize: "0.68em",
                      fontWeight: 600,
                      marginTop: 3,
                      lineHeight: 1.4,
                      opacity: isActive ? 0.35 : 0.9,
                      transition: "opacity 0.3s ease",
                    }}
                  >
                    {isActive || isTrailing ? (
                      <span style={{ whiteSpace: "pre-wrap" }}>
                        {line.bgWords.map((word, wi) =>
                          word.isSpace ? (
                            <span key={wi}>{word.text}</span>
                          ) : (
                            <span
                              key={wi}
                              style={{ position: "relative", display: "inline-block" }}
                            >
                              <span style={{ color: "rgba(255,255,255,0.25)" }}>{word.text}</span>
                              <span
                                data-word-bright="true"
                                style={{
                                  position: "absolute",
                                  top: 0,
                                  left: 0,
                                  right: 0,
                                  bottom: 0,
                                  color: "white",
                                  opacity: 0,
                                  WebkitMaskImage:
                                    "linear-gradient(to right, black -6px, transparent 6px)",
                                  maskImage:
                                    "linear-gradient(to right, black -6px, transparent 6px)",
                                  pointerEvents: "none",
                                }}
                              >
                                {word.text}
                              </span>
                            </span>
                          )
                        )}
                      </span>
                    ) : (
                      <span style={{ color: "rgba(255,255,255,0.55)" }}>
                        {line.bgWords.map((w) => w.text).join("")}
                      </span>
                    )}
                  </div>
                )}
                {line.bgText && (
                  <div
                    style={{
                      fontSize: "0.68em",
                      fontWeight: 600,
                      marginTop: 3,
                      lineHeight: 1.4,
                      opacity: isActive ? 0.35 : 0.9,
                      color: "#fff",
                    }}
                  >
                    {line.bgText}
                  </div>
                )}
                {showRomaji && romajiLines?.[i] && (
                  <div
                    style={{
                      fontSize: romajiFontSize,
                      fontWeight: 500,
                      color: "rgba(255,255,255,0.55)",
                      opacity: isActive ? 1 : 0.6,
                      marginTop: 4,
                      lineHeight: 1.4,
                      textAlign,
                    }}
                  >
                    {romajiLines[i]}
                  </div>
                )}
                {showTranslation && translations?.[i] && translations[i] !== lineText && (
                  <div
                    style={{
                      fontSize: translationFontSize,
                      fontWeight: 600,
                      color: "var(--accent)",
                      opacity: isActive ? 0.9 : 0.45,
                      marginTop: 6,
                      lineHeight: 1.4,
                      textAlign,
                    }}
                  >
                    {translations[i]}
                  </div>
                )}
              </div>
            );
            // Fluid mode wraps each line so the rAF scroll loop can drive a per-line
            // positional drift (translateY) on the wrapper while the line's own scale stays
            // a CSS transition on the inner node (separate elements → no transform clash).
            return fluidLyrics ? (
              <div key={i} data-lyricdrift="true" style={{ willChange: "transform" }}>
                {lineNode}
              </div>
            ) : (
              lineNode
            );
          })}
      </div>
    </div>
  );
}
