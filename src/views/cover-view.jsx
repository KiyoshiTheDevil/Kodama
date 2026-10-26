import { useEffect, useRef, useState } from "react";
import { thumb, hiResThumb, useZoom } from "../context.jsx";
import { ExplicitBadge } from "../ui/rows.jsx";
import { audioLevels, acquireAudioLevels } from "../audioLevels.js";
import { VIZ_DEFAULTS } from "../visualizer/defaults.js";
import { drawSpectrum } from "../visualizer/draw.js";
import { Heart } from "../icons.jsx";
import { haptic } from "../haptics.js";

// The mini player's cover where it was when it opened the player (App.jsx's Player), so the
// big cover can fly out of it. Taken only within a moment of being left.
let miniCoverFrom = null;
export function rememberMiniCover(el) {
  const r = el?.getBoundingClientRect();
  miniCoverFrom = r && r.width ? { rect: r, at: performance.now() } : null;
}

// `scale` shrinks everything the settings preview cannot express through coverSize and the
// config: the spacing, the title and the artist line. Without it the miniature drew its cover
// and bars at a third of their size around a full-size title, which is the one part of the
// preview that then did not match what it is previewing.
export function CoverView({ track, isPlaying, onClose, active = true, ambientVisualizer = true, ambientBackground = false, vizConfig, coverSize = 260, compact = false, scale = 1, fill = false, onSwipe, onDoubleTap, liked = false }) {
  // Font sizes come from tokens, so they are scaled in CSS rather than in JS. Left untouched
  // at 1 so the full-size view renders the exact same declaration it always did.
  const scaled = (v) => (scale === 1 ? v : `calc(${v} * ${scale})`);
  const hq = hiResThumb(track.thumbnail, 800);
  const specRef = useRef(null);
  const coverRef = useRef(null);
  const playingRef = useRef(isPlaying); playingRef.current = isPlaying;
  const cfgRef = useRef(null); cfgRef.current = { ...VIZ_DEFAULTS, ...(vizConfig || {}) };
  const coverColorRef = useRef(null);
  const zoom = useZoom();
  const zoomRef = useRef(zoom); zoomRef.current = zoom;
  const scaleRef = useRef(scale); scaleRef.current = scale;

  // fill (the phone player): opened from the mini player, the cover flies from the mini
  // card's into its own place, alongside the player sliding up.
  useEffect(() => {
    if (!fill || !active) return;
    const from = miniCoverFrom;
    miniCoverFrom = null;
    const el = coverRef.current;
    if (!from || performance.now() - from.at > 1000 || !el || !hq) return;
    // Where the cover will be once the player is up: its place in the player plus where the
    // player stops. Measured now, the player is still below the screen.
    const pane = el.closest("[data-player-pane]");
    if (!pane || !pane.offsetParent) return;
    const r = el.getBoundingClientRect(), p = pane.getBoundingClientRect();
    const finalTop = pane.offsetParent.getBoundingClientRect().top + pane.offsetTop + (r.top - p.top);
    const ghost = document.createElement("img");
    ghost.src = thumb(hq);
    Object.assign(ghost.style, {
      position: "fixed", left: `${from.rect.left}px`, top: `${from.rect.top}px`, width: `${from.rect.width}px`, height: `${from.rect.height}px`,
      objectFit: "cover", borderRadius: "10px", zIndex: 10050, pointerEvents: "none",
    });
    document.body.appendChild(ghost);
    el.style.opacity = "0";
    const anim = ghost.animate([
      { left: `${from.rect.left}px`, top: `${from.rect.top}px`, width: `${from.rect.width}px`, height: `${from.rect.height}px`, borderRadius: "10px" },
      { left: `${r.left}px`, top: `${finalTop}px`, width: `${r.width}px`, height: `${r.height}px`, borderRadius: "16px" },
    ], { duration: 420, easing: "cubic-bezier(0.4,0,0.2,1)", fill: "forwards" });
    const done = () => { el.style.opacity = ""; ghost.remove(); };
    anim.onfinish = done;
    anim.oncancel = done;
    return () => { anim.cancel(); };
  }, [active, fill]); // eslint-disable-line react-hooks/exhaustive-deps

  // fill: sideways on the cover swipes to the next or previous song, a double tap likes it.
  const [heart, setHeart] = useState(0);
  const lastTap = useRef(0);
  const coverGesture = (e) => {
    if (!fill || e.pointerType !== "touch") return;
    const el = coverRef.current;
    const x0 = e.clientX, y0 = e.clientY, t0 = performance.now();
    let mode = null;
    const move = (me) => {
      const dx = me.clientX - x0, dy = me.clientY - y0;
      if (mode === null) {
        if (Math.hypot(dx, dy) < 10) return;
        mode = Math.abs(dx) > Math.abs(dy) ? "swipe" : "other";
      }
      if (mode === "swipe" && el) { el.style.transition = "none"; el.style.translate = `${dx}px 0`; }
    };
    const up = (ue) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      const dx = ue.clientX - x0, dt = Math.max(1, performance.now() - t0);
      if (mode === null && ue.type === "pointerup") {
        // A tap: the second one close after the first is a like.
        if (performance.now() - lastTap.current < 320) {
          lastTap.current = 0;
          if (!liked) onDoubleTap?.(); else haptic("tap");
          setHeart((n) => n + 1);
        } else lastTap.current = performance.now();
        return;
      }
      if (mode !== "swipe" || !el) return;
      const ease = "translate 0.24s cubic-bezier(0.4,0,0.2,1), opacity 0.24s ease, transform 0.6s cubic-bezier(0.34,1.4,0.64,1), border-radius 0.3s ease";
      if (Math.abs(dx) > 90 || Math.abs(dx) / dt > 0.5) {
        const dir = dx < 0 ? 1 : -1;
        haptic("tick");
        el.style.transition = ease;
        el.style.translate = `${-dir * 120}% 0`;
        el.style.opacity = "0";
        setTimeout(() => {
          onSwipe?.(dir > 0 ? "next" : "prev");
          el.style.transition = "none";
          el.style.translate = `${dir * 120}% 0`;
          requestAnimationFrame(() => requestAnimationFrame(() => {
            el.style.transition = ease;
            el.style.translate = "";
            el.style.opacity = "";
          }));
        }, 240);
      } else {
        el.style.transition = ease;
        el.style.translate = "";
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };

  // Title and artist step aside when the view is too short for them. At the window's smallest
  // height the cover, the spectrum and a two-line title were pressed into each other, and the
  // same title and artist are already in the player bar right below. Judged on the view's own
  // height, which is what runs out, with a band between hiding and showing again so a window
  // resized right at the edge does not flicker between the two. Not in the settings preview,
  // which is a miniature on purpose.
  const rootRef = useRef(null);
  const [roomForInfo, setRoomForInfo] = useState(true);
  // The view's width: in narrow windows the cover shrinks with it, so the spectrum around it
  // keeps room on both sides instead of disappearing behind a cover as wide as the view.
  const [viewW, setViewW] = useState(0);
  const [viewH, setViewH] = useState(0);
  useEffect(() => {
    const el = rootRef.current;
    if (!el || scale !== 1 || typeof ResizeObserver === "undefined") return;
    // The smallest window leaves this view about 450 px, the default window about 590.
    const HIDE_BELOW = 520, SHOW_ABOVE = 550;
    const ro = new ResizeObserver(([entry]) => {
      const h = entry.contentRect.height;
      setRoomForInfo(prev => (prev ? h >= HIDE_BELOW : h > SHOW_ABOVE));
      setViewW(entry.contentRect.width);
      setViewH(h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [scale]);

  // Extract a vibrant colour from the cover for the "dynamic" colour mode.
  useEffect(() => {
    const url = track.thumbnail ? thumb(track.thumbnail) : null;
    if (!url) { coverColorRef.current = null; return; }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas"); c.width = 40; c.height = 40;
        const cx = c.getContext("2d"); cx.drawImage(img, 0, 0, 40, 40);
        const d = cx.getImageData(0, 0, 40, 40).data;
        let br = 0, bg = 0, bb = 0, best = -1, sr = 0, sg = 0, sb = 0, cnt = 0;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i], g = d[i + 1], b = d[i + 2];
          sr += r; sg += g; sb += b; cnt++;
          const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
          const score = (mx === 0 ? 0 : (mx - mn) / mx) * (mx / 255); // saturation × brightness
          if (score > best) { best = score; br = r; bg = g; bb = b; }
        }
        const useV = best > 0.18;
        const R = useV ? br : Math.round(sr / cnt), G = useV ? bg : Math.round(sg / cnt), B = useV ? bb : Math.round(sb / cnt);
        coverColorRef.current = `rgb(${R},${G},${B})`;
      } catch { coverColorRef.current = null; }
    };
    img.onerror = () => { coverColorRef.current = null; };
    img.src = url;
  }, [track.thumbnail]);

  // Audio-reactive spectrum (ring or cover-hugging frame) + cover pulse, driven by the live
  // `audioLevels` (Rust FFT). Config read via a ref so changes apply without restarting rAF.
  useEffect(() => {
    // `active` as well as the setting: this component stays mounted while the expanded view is
    // closed (the pane is slid off screen), and without the check it kept asking Rust for the
    // FFT and drawing the spectrum for the whole of every song, onto a surface nobody sees.
    if (!ambientVisualizer || !active) return;
    const cv = specRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    // Tell Rust the spectrum is actually being drawn; it stays silent otherwise.
    const releaseLevels = acquireAudioLevels();
    const accentVar = (getComputedStyle(document.documentElement).getPropertyValue("--accent").trim()) || "#e040fb";
    let raf = 0, smoothLevel = 0;
    const sm = [], pk = [];
    const draw = () => {
      const cfg = cfgRef.current;
      const dpr = window.devicePixelRatio || 1;
      const w = cv.clientWidth, h = cv.clientHeight;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const src = audioLevels.bands || [], srcN = src.length || 48;
      // The linear spectrum spreads its bars across the width it is given, so a fixed count
      // crammed them together as the window narrowed. The setting now means the count across the
      // SCREEN's full width, the widest this view can be, and a narrower view shows
      // proportionally fewer at the same spacing. That also covers the split pane, which used to
      // be the one case scaled, against the window rather than the screen, so resizing the
      // window still squeezed it. Measured in screen pixels: the canvas is in local units, so UI
      // zoom is multiplied back in, and the settings preview divides its miniature scale out, or
      // it would collapse to the minimum. Ring and frame follow the cover, which has a fixed size.
      let n = Math.max(8, (cfg.barCount | 0) || 48);
      if (cfg.shape === "linear") {
        const full = Math.max(320, window.screen?.availWidth || window.innerWidth || w);
        const here = (w * (zoomRef.current || 1)) / (scaleRef.current || 1);
        n = Math.max(8, Math.round(n * Math.min(1, here / full)));
      }
      const resp = Math.max(0, Math.min(1, cfg.responsiveness != null ? cfg.responsiveness : 0.75));
      const rel = (1 - resp) * 0.95; // 0 = instant, 0.95 = very floaty
      const bandAt = (i) => { const f = (i / n) * srcN, lo = Math.floor(f), hi = Math.min(srcN - 1, lo + 1), t = f - lo; return (src[lo] || 0) * (1 - t) + (src[hi] || 0) * t; };
      // ── value pipeline: tilt → floor/ceiling → temporal smoothing → spatial blur ──
      const tilt = cfg.tilt || 0, fl = cfg.floor || 0, ce = (cfg.ceiling != null ? cfg.ceiling : 1), rng = Math.max(0.02, ce - fl);
      for (let i = 0; i < n; i++) {
        let v = Math.max(0, Math.min(1, bandAt(i)));
        if (tilt) v = Math.min(1, v * (1 + tilt * (i / Math.max(1, n - 1)) * 3));
        v = Math.max(0, Math.min(1, (v - fl) / rng));
        const p = sm[i] || 0;
        sm[i] = v > p ? v : p * rel + v * (1 - rel);
      }
      const sbr = Math.round((cfg.smoothBands || 0) * 8);
      const vals = new Array(n);
      if (sbr > 0) {
        for (let i = 0; i < n; i++) { let s = 0, wsum = 0; for (let k = -sbr; k <= sbr; k++) { const j = i + k; if (j < 0 || j >= n) continue; const wk = 1 - Math.abs(k) / (sbr + 1); s += (sm[j] || 0) * wk; wsum += wk; } vals[i] = s / wsum; }
      } else { for (let i = 0; i < n; i++) vals[i] = sm[i] || 0; }
      const peakOn = !!cfg.peakHold;
      if (peakOn) for (let i = 0; i < n; i++) pk[i] = Math.max(vals[i], (pk[i] || 0) * 0.94);

      const baseCol = cfg.color === "cover" ? (coverColorRef.current || accentVar)
        : cfg.color === "custom" ? (cfg.customColor || accentVar) : accentVar;

      let bx = (w - 260) / 2, by = (h - 260) / 2, bw = 260, bh = 260;
      const cover = coverRef.current;
      if (cover) {
        // getBoundingClientRect() returns real, already-zoomed screen pixels, but the canvas's
        // own drawing coordinate system is calibrated to clientWidth/clientHeight (w/h above),
        // which — unlike getBoundingClientRect — do NOT reflect an ancestor's CSS `zoom` and
        // stay in local/unzoomed units. Feeding zoomed rect diffs straight into local-unit
        // drawing coords double-applies the zoom (the canvas itself is also zoomed when
        // rendered), visibly shifting/misscaling the visualizer at any zoom level other than
        // 100%. Divide back down to local units to match.
        const z = zoomRef.current || 1;
        const r = cover.getBoundingClientRect(), cr = cv.getBoundingClientRect();
        bx = (r.left - cr.left) / z; by = (r.top - cr.top) / z; bw = r.width / z; bh = r.height / z;
      }

      drawSpectrum(ctx, {
        w, h, box: { x: bx, y: by, w: bw, h: bh }, cfg, n, vals,
        peaks: peakOn ? pk : null, baseCol,
      });

      smoothLevel += ((audioLevels.level || 0) - smoothLevel) * 0.25;
      const base = playingRef.current ? 1.03 : 0.97;
      // Pulse amplitude: strength (0..1) scales up to a 0.20 cover-scale swing at full level.
      // Default 0.3 ≈ the previous fixed 0.06 factor.
      const pulseAmt = cfg.coverPulse ? smoothLevel * (cfg.coverPulseStrength ?? 0.3) * 0.2 : 0;
      if (coverRef.current) coverRef.current.style.transform = `scale(${base + pulseAmt})`;

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); releaseLevels(); if (coverRef.current) coverRef.current.style.transform = ""; };
  }, [ambientVisualizer, active]);

  // fill (the compact layout, no spectrum): as large as a phone player's, 84% of the width and
  // at most 72% of the height. Otherwise with the spectrum at most 56% of the width, so it keeps
  // room around the cover (only below ~465px does that bite on the default 260).
  const shownCover = scale !== 1 || !viewW ? coverSize
    : fill ? Math.round(Math.min(viewW * 0.84, (viewH || viewW) * 0.72))
    : ambientVisualizer ? Math.min(coverSize, Math.round(viewW * 0.56))
    : coverSize;

  return (
    <div ref={rootRef} style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center" }}>

      {/* Ambient colour blobs — negative inset keeps edges outside the visible area. Skipped in
          ambientBackground mode: the global AmbientBackdrop already provides the colour, and these
          blobs (mix-blend-mode, clipped at the pane edge) would show a visible seam toward the
          sidebar. The lyrics view gates its own blobs on !ambientBackground the same way. */}
      {ambientVisualizer && !ambientBackground && (vizConfig?.blobs !== false) && (<>
        <div style={{
          position: "absolute", inset: "-30%", zIndex: 1, pointerEvents: "none",
          background: "radial-gradient(ellipse 38% 32% at 44% 42%, var(--accent) 0%, transparent 70%)",
          mixBlendMode: "screen",
          animation: "blobDrift1 18s ease-in-out infinite",
        }} />
        <div style={{
          position: "absolute", inset: "-30%", zIndex: 1, pointerEvents: "none",
          background: "radial-gradient(ellipse 32% 38% at 62% 60%, #7b2ff7 0%, transparent 68%)",
          mixBlendMode: "screen",
          animation: "blobDrift2 23s ease-in-out infinite",
        }} />
        <div style={{
          position: "absolute", inset: "-30%", zIndex: 1, pointerEvents: "none",
          background: "radial-gradient(ellipse 44% 36% at 52% 48%, #1565c0 0%, transparent 65%)",
          mixBlendMode: "screen",
          animation: "blobDrift3 29s ease-in-out infinite",
        }} />
      </>)}

      {/* Audio-reactive spectrum ring */}
      {ambientVisualizer && (
        <canvas ref={specRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", zIndex: 2, pointerEvents: "none" }} />
      )}

      {/* Content — shifted up when a bottom linear spectrum would otherwise overlap it */}
      <div style={{ position: "relative", zIndex: 3, display: "flex", flexDirection: "column", alignItems: "center", gap: (compact ? 32 : 64) * scale,
        marginBottom: (ambientVisualizer && vizConfig?.shape === "linear" && (vizConfig?.linearPos || "bottom") === "bottom") ? (compact ? 56 : 96) * scale : 0,
        transition: "margin-bottom 0.3s ease" }}>
        {/* Album cover */}
        <div ref={coverRef} onPointerDown={fill ? coverGesture : undefined} style={{
          position: "relative",
          width: shownCover, height: shownCover, overflow: "hidden",
          borderRadius: vizConfig?.coverShape === "circle" ? "50%" : scaled(compact ? "var(--r-xl)" : "var(--r-2xl)"),
          boxShadow: fill ? "none" : "var(--elevation-5)", // compact: flat, as on a phone
          // fill: paused, the cover steps back clearly, with a little spring when it returns.
          transform: fill ? (isPlaying ? "none" : "scale(0.84)") : isPlaying ? "scale(1.03)" : "scale(0.97)",
          transition: ambientVisualizer ? "border-radius 0.3s ease"
            : fill ? "transform 0.6s cubic-bezier(0.34,1.4,0.64,1), border-radius 0.3s ease"
            : "transform 0.6s cubic-bezier(0.4,0,0.2,1), border-radius 0.3s ease",
        }}>
          {hq
            ? <img src={thumb(hq)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : <div style={{ width: "100%", height: "100%", background: "var(--placeholder-gradient)" }} />
          }
          {heart > 0 && (
            <div key={heart} aria-hidden="true" style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
              <Heart size={Math.round(shownCover * 0.3)} weight="fill" style={{ color: "#fff", filter: "drop-shadow(0 4px 18px rgba(0,0,0,0.45))", animation: "coverHeart 0.75s cubic-bezier(0.22,1,0.36,1) forwards" }} />
            </div>
          )}
        </div>

        {/* Track info */}
        {/* fill (the compact player): never, since its head right below always names the song.
            Only the height used to hide it there, and a tall phone screen has height to spare. */}
        {roomForInfo && !fill && <div style={{ textAlign: "center", maxWidth: (compact ? 360 : 520) * scale, animation: "fadeIn 0.2s ease" }}>
          <div style={{ fontSize: compact ? 17 * scale : scaled("var(--t22)"), fontWeight: 700, color: "#fff", marginBottom: (compact ? 3 : 6) * scale, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 8 * scale, lineHeight: 1.3 }}>
            <span style={{ overflowWrap: "anywhere" }}>{track.title}</span>
            {/* The badge is a shared component with its own fixed size. Shrunk from the outside
                rather than threading a scale through every place that uses it; zoom, not
                transform, so it still takes up the room it draws in. */}
            {track.isExplicit && (scale === 1 ? <ExplicitBadge /> : <span style={{ zoom: scale, display: "inline-flex" }}><ExplicitBadge /></span>)}
          </div>
          <div style={{ fontSize: compact ? 12 * scale : scaled("var(--t14)"), color: "rgba(255,255,255,0.6)", overflowWrap: "anywhere" }}>{track.artists}</div>
        </div>}
      </div>
    </div>
  );
}



// wordGroupIndices/paintWordSeq/paintLineWords now live in ./lyrics/paint.js — extracted so the
// video-sync caption overlay can reuse the exact same karaoke word painting for its active line.
