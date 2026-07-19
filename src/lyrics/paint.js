// Word-level karaoke painting — direct DOM manipulation (no per-word React state/re-render), so
// the highlight/wipe/zoom/glow can update at 60fps without fighting whatever re-rendered the
// surrounding line. Extracted from App.jsx's LyricsOverlay so the video-sync caption overlay can
// reuse the exact same visual treatment for its single active line.

// Map each non-space word entry to its space-delimited word-group index (for word-level glow).
export function wordGroupIndices(allWords) {
  const groups = [];
  let g = -1, inWord = false;
  for (const w of (allWords || [])) {
    if (w.isSpace) { inWord = false; }
    else { if (!inWord) { g++; inWord = true; } groups.push(g); }
  }
  return groups;
}

// zoomMaxRef: pass a ref to enable the per-syllable zoom (active line); pass null to
// disable it (trailing line — it just finishes its wipe quietly, no attention-grab).
// Paints a single karaoke word sequence (its own active-word index, stored under
// idxKey on idxRef). Main vocals and background vocals are painted as INDEPENDENT
// sequences so a bg line starting does not mark the main line as fully sung.
export function paintWordSeq(words, els, idxRef, idxKey, t, zoomMaxRef, glow, groups) {
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
    const doZoom =
      zoomMaxRef && curWordIdx === prevIdx + 1 && curWordIdx > zoomMaxRef.current;
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
                { transform: "scale(1)",    easing: "ease-in-out" },
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
      const pct = Math.min(100, (t - word.time) / Math.max(word.end - word.time, 0.001) * 100);
      el.style.WebkitMaskImage = `linear-gradient(to right, black calc(${pct.toFixed(1)}% - 6px), transparent calc(${pct.toFixed(1)}% + 6px))`;
      el.style.maskImage = `linear-gradient(to right, black calc(${pct.toFixed(1)}% - 6px), transparent calc(${pct.toFixed(1)}% + 6px))`;
    }
  }
}

export function paintLineWords(line, els, wordIdxRef, t, zoomMaxRef = null, glow = false) {
  if (!line || !els || els.length === 0) return;
  // DOM order of bright spans: main words first, then bg words. Split and paint each
  // as its own sequence so the two vocal streams never bleed into each other's fill.
  const mainWords = (line.words   || []).filter(w => !w.isSpace);
  const bgWords   = (line.bgWords || []).filter(w => !w.isSpace);
  const mainEls = mainWords.length ? els.slice(0, mainWords.length) : [];
  const bgEls   = bgWords.length   ? els.slice(mainWords.length)     : [];
  paintWordSeq(mainWords, mainEls, wordIdxRef, "current",   t, zoomMaxRef, glow, wordGroupIndices(line.words));
  paintWordSeq(bgWords,   bgEls,   wordIdxRef, "bgCurrent", t, null, glow, wordGroupIndices(line.bgWords));
}
