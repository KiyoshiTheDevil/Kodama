import { useEffect, useRef } from "react";

import { thumb } from "../../shared/api/thumbnails.js";
import { ExplicitBadge } from "../../ui/rows.jsx";
import { audioLevels } from "../../audioLevels.js";
import { hiResThumb } from "./cover-art.js";

export const VIZ_DEFAULTS = {
  shape: "frame", // "frame" | "ring" | "linear"
  linearPos: "bottom", // (linear only) "bottom" = over the seek bar | "center" = behind cover
  barCount: 56,
  barLength: 90,
  barThickness: 3,
  gap: 8,
  responsiveness: 0.75, // 0..1, higher = snappier (less release smoothing)
  mirror: false,
  floor: 0, // 0..1 — gate below
  ceiling: 1, // 0..1 — clip above (remap [floor,ceiling] → [0,1])
  tilt: 0, // 0..1 — high-frequency boost
  smoothBands: 0, // 0..1 — gaussian smoothing across bands
  render: "bars", // "bars" | "curve"
  peakHold: false, // hold peaks + slow decay
  gradient: false, // colour by bar height (base → gradColor)
  gradColor: "#ffffff",
  color: "accent", // "accent" | "custom" | "cover"
  customColor: "#e040fb",
  coverPulse: true,
  coverPulseStrength: 0.3,
  blobs: true,
};

// Colour helpers for the gradient mode (handle #hex and rgb()).
function vizToRGB(c) {
  if (!c) return [255, 255, 255];
  if (c[0] === "#") {
    const h = c.slice(1);
    const x =
      h.length === 3
        ? h
            .split("")
            .map((d) => d + d)
            .join("")
        : h;
    return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16)];
  }
  const m = c.match(/(\d+)\D+(\d+)\D+(\d+)/);
  return m ? [+m[1], +m[2], +m[3]] : [255, 255, 255];
}
function vizLerp(a, b, t) {
  const A = vizToRGB(a),
    B = vizToRGB(b);
  return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)})`;
}

export function CoverView({
  track,
  isPlaying,
  ambientVisualizer = true,
  vizConfig,
  coverSize = 260,
  compact = false,
  narrow = false,
}) {
  const hq = hiResThumb(track.thumbnail);
  const specRef = useRef(null);
  const coverRef = useRef(null);
  const playingRef = useRef(isPlaying);
  playingRef.current = isPlaying;
  const cfgRef = useRef(null);
  cfgRef.current = { ...VIZ_DEFAULTS, ...(vizConfig || {}) };
  const coverColorRef = useRef(null);

  // Extract a vibrant colour from the cover for the "dynamic" colour mode.
  useEffect(() => {
    const url = track.thumbnail ? thumb(track.thumbnail) : null;
    if (!url) {
      coverColorRef.current = null;
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = 40;
        c.height = 40;
        const cx = c.getContext("2d");
        cx.drawImage(img, 0, 0, 40, 40);
        const d = cx.getImageData(0, 0, 40, 40).data;
        let br = 0,
          bg = 0,
          bb = 0,
          best = -1,
          sr = 0,
          sg = 0,
          sb = 0,
          cnt = 0;
        for (let i = 0; i < d.length; i += 4) {
          const r = d[i],
            g = d[i + 1],
            b = d[i + 2];
          sr += r;
          sg += g;
          sb += b;
          cnt++;
          const mx = Math.max(r, g, b),
            mn = Math.min(r, g, b);
          const score = (mx === 0 ? 0 : (mx - mn) / mx) * (mx / 255); // saturation × brightness
          if (score > best) {
            best = score;
            br = r;
            bg = g;
            bb = b;
          }
        }
        const useV = best > 0.18;
        const R = useV ? br : Math.round(sr / cnt),
          G = useV ? bg : Math.round(sg / cnt),
          B = useV ? bb : Math.round(sb / cnt);
        coverColorRef.current = `rgb(${R},${G},${B})`;
      } catch {
        coverColorRef.current = null;
      }
    };
    img.onerror = () => {
      coverColorRef.current = null;
    };
    img.src = url;
  }, [track.thumbnail]);

  // Audio-reactive spectrum (ring or cover-hugging frame) + cover pulse, driven by the live
  // `audioLevels` (Rust FFT). Config read via a ref so changes apply without restarting rAF.
  useEffect(() => {
    if (!ambientVisualizer) return;
    const cv = specRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    const accentVar =
      getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#e040fb";
    let raf = 0,
      smoothLevel = 0;
    const sm = [],
      pk = [];
    const draw = () => {
      const cfg = cfgRef.current;
      const dpr = window.devicePixelRatio || 1;
      const w = cv.clientWidth,
        h = cv.clientHeight;
      if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
        cv.width = Math.round(w * dpr);
        cv.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const src = audioLevels.bands || [],
        srcN = src.length || 48;
      // In a narrow (split) pane the linear spectrum is only a fraction of the window width —
      // scale the bar count by that fraction so the per-bar spacing matches the full view
      // (and adapts as the split is resized) instead of cramming the bars together.
      let n = Math.max(8, cfg.barCount | 0 || 48);
      if (narrow && cfg.shape === "linear") {
        const frac = Math.min(1, w / (window.innerWidth || w));
        n = Math.max(8, Math.round(n * frac));
      }
      const resp = Math.max(0, Math.min(1, cfg.responsiveness != null ? cfg.responsiveness : 0.75));
      const rel = (1 - resp) * 0.95; // 0 = instant, 0.95 = very floaty
      const bandAt = (i) => {
        const f = (i / n) * srcN,
          lo = Math.floor(f),
          hi = Math.min(srcN - 1, lo + 1),
          t = f - lo;
        return (src[lo] || 0) * (1 - t) + (src[hi] || 0) * t;
      };
      // ── value pipeline: tilt → floor/ceiling → temporal smoothing → spatial blur ──
      const tilt = cfg.tilt || 0,
        fl = cfg.floor || 0,
        ce = cfg.ceiling != null ? cfg.ceiling : 1,
        rng = Math.max(0.02, ce - fl);
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
        for (let i = 0; i < n; i++) {
          let s = 0,
            wsum = 0;
          for (let k = -sbr; k <= sbr; k++) {
            const j = i + k;
            if (j < 0 || j >= n) continue;
            const wk = 1 - Math.abs(k) / (sbr + 1);
            s += (sm[j] || 0) * wk;
            wsum += wk;
          }
          vals[i] = s / wsum;
        }
      } else {
        for (let i = 0; i < n; i++) vals[i] = sm[i] || 0;
      }
      const peakOn = !!cfg.peakHold;
      if (peakOn) for (let i = 0; i < n; i++) pk[i] = Math.max(vals[i], (pk[i] || 0) * 0.94);

      const bv = (i) => vals[cfg.mirror ? Math.min(i, n - 1 - i) : i];
      const pkAt = (i) => pk[cfg.mirror ? Math.min(i, n - 1 - i) : i] || 0;

      const baseCol =
        cfg.color === "cover"
          ? coverColorRef.current || accentVar
          : cfg.color === "custom"
            ? cfg.customColor || accentVar
            : accentVar;
      const grad = !!cfg.gradient,
        topCol = cfg.gradColor || "#ffffff";
      const colAt = (v) => (grad ? vizLerp(baseCol, topCol, Math.min(1, v)) : baseCol);
      const maxLen = cfg.barLength,
        gap = cfg.gap,
        curve = cfg.render === "curve";
      ctx.lineCap = "round";
      ctx.lineWidth = cfg.barThickness;

      let bx = (w - 260) / 2,
        by = (h - 260) / 2,
        bw = 260,
        bh = 260;
      const cover = coverRef.current;
      if (cover) {
        const r = cover.getBoundingClientRect(),
          cr = cv.getBoundingClientRect();
        bx = r.left - cr.left;
        by = r.top - cr.top;
        bw = r.width;
        bh = r.height;
      }

      if (cfg.shape === "ring") {
        const cx = bx + bw / 2,
          cy = by + bh / 2,
          R0 = bw / 2 + gap;
        if (curve) {
          ctx.strokeStyle = grad ? topCol : baseCol;
          ctx.globalAlpha = 0.85;
          ctx.lineWidth = Math.max(1.5, cfg.barThickness);
          ctx.beginPath();
          for (let i = 0; i <= n; i++) {
            const ii = i % n,
              a = (ii / n) * Math.PI * 2 - Math.PI / 2,
              r = R0 + 4 + bv(ii) * maxLen,
              x = cx + Math.cos(a) * r,
              y = cy + Math.sin(a) * r;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.closePath();
          ctx.stroke();
        } else {
          for (let i = 0; i < n; i++) {
            const a = (i / n) * Math.PI * 2 - Math.PI / 2,
              v = bv(i),
              len = 4 + v * maxLen,
              ca = Math.cos(a),
              sa = Math.sin(a);
            ctx.strokeStyle = colAt(v);
            ctx.globalAlpha = 0.25 + v * 0.6;
            ctx.beginPath();
            ctx.moveTo(cx + ca * R0, cy + sa * R0);
            ctx.lineTo(cx + ca * (R0 + len), cy + sa * (R0 + len));
            ctx.stroke();
            if (peakOn) {
              const pl = R0 + 4 + pkAt(i) * maxLen;
              ctx.globalAlpha = 0.55;
              ctx.beginPath();
              ctx.moveTo(cx + ca * pl, cy + sa * pl);
              ctx.lineTo(cx + ca * (pl + 3), cy + sa * (pl + 3));
              ctx.stroke();
            }
          }
        }
      } else if (cfg.shape === "linear") {
        const pos = cfg.linearPos || "bottom",
          Wlin = w - 56,
          xs = (w - Wlin) / 2,
          step = Wlin / n,
          yb = pos === "center" ? by + bh / 2 : h - 40 - gap;
        if (curve) {
          // sign -1 = upward; when mirrored, also draw the reflected downward curve.
          const drawCurve = (sign) => {
            const pts = [];
            for (let i = 0; i < n; i++)
              pts.push([xs + i * step + step / 2, yb + sign * (3 + bv(i) * maxLen)]);
            let fillStyle = baseCol;
            if (grad) {
              const g = ctx.createLinearGradient(0, yb + sign * maxLen, 0, yb);
              g.addColorStop(0, topCol);
              g.addColorStop(1, baseCol);
              fillStyle = g;
            }
            ctx.globalAlpha = 0.5;
            ctx.fillStyle = fillStyle;
            ctx.beginPath();
            ctx.moveTo(pts[0][0], yb);
            ctx.lineTo(pts[0][0], pts[0][1]);
            for (let i = 1; i < pts.length; i++) {
              const [ppx, ppy] = pts[i - 1],
                [x, y] = pts[i],
                mx = (ppx + x) / 2,
                my = (ppy + y) / 2;
              ctx.quadraticCurveTo(ppx, ppy, mx, my);
            }
            ctx.lineTo(pts[pts.length - 1][0], yb);
            ctx.closePath();
            ctx.fill();
          };
          drawCurve(-1);
          if (cfg.mirror) drawCurve(1);
        } else {
          for (let i = 0; i < n; i++) {
            const v = bv(i),
              len = 3 + v * maxLen,
              x = xs + i * step + step / 2;
            ctx.strokeStyle = colAt(v);
            ctx.globalAlpha = 0.3 + v * 0.6;
            ctx.beginPath();
            if (cfg.mirror) {
              ctx.moveTo(x, yb - len);
              ctx.lineTo(x, yb + len);
            } else {
              ctx.moveTo(x, yb);
              ctx.lineTo(x, yb - len);
            }
            ctx.stroke();
            if (peakOn && !cfg.mirror) {
              const pl = 3 + pkAt(i) * maxLen;
              ctx.globalAlpha = 0.55;
              ctx.beginPath();
              ctx.moveTo(x - step * 0.32, yb - pl);
              ctx.lineTo(x + step * 0.32, yb - pl);
              ctx.stroke();
            }
          }
        }
      } else {
        const x0 = bx - gap,
          y0 = by - gap,
          x1 = bx + bw + gap,
          y1 = by + bh + gap,
          W2 = x1 - x0,
          H2 = y1 - y0,
          P = 2 * (W2 + H2);
        for (let i = 0; i < n; i++) {
          const v = bv(i),
            len = 4 + v * maxLen,
            d = ((i + 0.5) / n) * P;
          let px, py, nx, ny;
          if (d < W2) {
            px = x0 + d;
            py = y0;
            nx = 0;
            ny = -1;
          } else if (d < W2 + H2) {
            px = x1;
            py = y0 + (d - W2);
            nx = 1;
            ny = 0;
          } else if (d < 2 * W2 + H2) {
            px = x1 - (d - (W2 + H2));
            py = y1;
            nx = 0;
            ny = 1;
          } else {
            px = x0;
            py = y1 - (d - (2 * W2 + H2));
            nx = -1;
            ny = 0;
          }
          ctx.strokeStyle = colAt(v);
          ctx.globalAlpha = 0.25 + v * 0.6;
          ctx.beginPath();
          ctx.moveTo(px, py);
          ctx.lineTo(px + nx * len, py + ny * len);
          ctx.stroke();
          if (peakOn) {
            const pl = 4 + pkAt(i) * maxLen,
              ppx = px + nx * pl,
              ppy = py + ny * pl,
              ex = -ny,
              ey = nx;
            ctx.globalAlpha = 0.55;
            ctx.beginPath();
            ctx.moveTo(ppx - ex * 2.5, ppy - ey * 2.5);
            ctx.lineTo(ppx + ex * 2.5, ppy + ey * 2.5);
            ctx.stroke();
          }
        }
      }
      ctx.globalAlpha = 1;

      smoothLevel += ((audioLevels.level || 0) - smoothLevel) * 0.25;
      const base = playingRef.current ? 1.03 : 0.97;
      // Pulse amplitude: strength (0..1) scales up to a 0.20 cover-scale swing at full level.
      // Default 0.3 ≈ the previous fixed 0.06 factor.
      const pulseAmt = cfg.coverPulse ? smoothLevel * (cfg.coverPulseStrength ?? 0.3) * 0.2 : 0;
      if (coverRef.current) coverRef.current.style.transform = `scale(${base + pulseAmt})`;

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      if (coverRef.current) coverRef.current.style.transform = "";
    };
  }, [ambientVisualizer, narrow]);

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        overflow: "hidden",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {/* Ambient colour blobs — negative inset keeps edges outside the visible area */}
      {ambientVisualizer && vizConfig?.blobs !== false && (
        <>
          <div
            style={{
              position: "absolute",
              inset: "-30%",
              zIndex: 1,
              pointerEvents: "none",
              background:
                "radial-gradient(ellipse 38% 32% at 44% 42%, var(--accent) 0%, transparent 70%)",
              mixBlendMode: "screen",
              animation: "blobDrift1 18s ease-in-out infinite",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: "-30%",
              zIndex: 1,
              pointerEvents: "none",
              background:
                "radial-gradient(ellipse 32% 38% at 62% 60%, #7b2ff7 0%, transparent 68%)",
              mixBlendMode: "screen",
              animation: "blobDrift2 23s ease-in-out infinite",
            }}
          />
          <div
            style={{
              position: "absolute",
              inset: "-30%",
              zIndex: 1,
              pointerEvents: "none",
              background:
                "radial-gradient(ellipse 44% 36% at 52% 48%, #1565c0 0%, transparent 65%)",
              mixBlendMode: "screen",
              animation: "blobDrift3 29s ease-in-out infinite",
            }}
          />
        </>
      )}

      {/* Audio-reactive spectrum ring */}
      {ambientVisualizer && (
        <canvas
          ref={specRef}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            zIndex: 2,
            pointerEvents: "none",
          }}
        />
      )}

      {/* Content — shifted up when a bottom linear spectrum would otherwise overlap it */}
      <div
        style={{
          position: "relative",
          zIndex: 3,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: compact ? 32 : 64,
          marginBottom:
            ambientVisualizer &&
            vizConfig?.shape === "linear" &&
            (vizConfig?.linearPos || "bottom") === "bottom"
              ? compact
                ? 56
                : 96
              : 0,
          transition: "margin-bottom 0.3s ease",
        }}
      >
        {/* Album cover */}
        <div
          ref={coverRef}
          style={{
            width: coverSize,
            height: coverSize,
            borderRadius: compact ? 12 : 16,
            overflow: "hidden",
            boxShadow: "0 32px 80px rgba(0,0,0,0.6)",
            transform: isPlaying ? "scale(1.03)" : "scale(0.97)",
            transition: ambientVisualizer ? "none" : "transform 0.6s cubic-bezier(0.4,0,0.2,1)",
          }}
        >
          {hq ? (
            <img
              src={thumb(hq)}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                background: "linear-gradient(135deg,#2a1535,#1a0a25)",
              }}
            />
          )}
        </div>

        {/* Track info */}
        <div style={{ textAlign: "center", maxWidth: compact ? 360 : 520 }}>
          <div
            style={{
              fontSize: compact ? 17 : "var(--t22)",
              fontWeight: 700,
              color: "#fff",
              marginBottom: compact ? 3 : 6,
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              lineHeight: 1.3,
            }}
          >
            <span style={{ overflowWrap: "anywhere" }}>{track.title}</span>
            {track.isExplicit && <ExplicitBadge />}
          </div>
          <div
            style={{
              fontSize: compact ? 12 : "var(--t14)",
              color: "rgba(255,255,255,0.6)",
              overflowWrap: "anywhere",
            }}
          >
            {track.artists}
          </div>
        </div>
      </div>
    </div>
  );
}

// LyricsOverlay (+ word-timing/paint helpers and the Composer bridge) moved to
