// Draws the spectrum: one frame of the visualizer, from values that are already worked out.
//
// Shared by the cover view, which feeds it the live FFT, and the store's preset preview, which
// feeds it a fixed pattern. One function for both is what keeps the preview honest: it used to be a
// separate drawing of bars that knew no shapes, so a ring preset showed as a straight row.

function vizToRGB(c) {
  if (!c) return [255, 255, 255];
  if (c[0] === "#") { const h = c.slice(1); const x = h.length === 3 ? h.split("").map((d) => d + d).join("") : h; return [parseInt(x.slice(0, 2), 16), parseInt(x.slice(2, 4), 16), parseInt(x.slice(4, 6), 16)]; }
  const m = c.match(/(\d+)\D+(\d+)\D+(\d+)/); return m ? [+m[1], +m[2], +m[3]] : [255, 255, 255];
}
export function vizLerp(a, b, t) { const A = vizToRGB(a), B = vizToRGB(b); return `rgb(${Math.round(A[0] + (B[0] - A[0]) * t)},${Math.round(A[1] + (B[1] - A[1]) * t)},${Math.round(A[2] + (B[2] - A[2]) * t)})`; }

// A closed, smooth line through points: each segment is a quadratic curve to the midpoint of the
// next pair, which rounds every corner without overshooting.
function closedCurve(ctx, pts) {
  const m = pts.length;
  if (m < 3) return;
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const start = mid(pts[m - 1], pts[0]);
  ctx.beginPath();
  ctx.moveTo(start[0], start[1]);
  for (let i = 0; i < m; i++) {
    const p = pts[i], q = mid(pts[i], pts[(i + 1) % m]);
    ctx.quadraticCurveTo(p[0], p[1], q[0], q[1]);
  }
  ctx.closePath();
}

/**
 * ctx      a 2D context, already cleared and scaled to drawing units
 * w, h     the drawing area in those units
 * box      { x, y, w, h }, where the cover sits: ring and frame grow out of it, a centred linear
 *          spectrum sits on its middle
 * cfg      the visualizer config (VIZ_DEFAULTS merged with the user's)
 * n        how many bars
 * vals     n values, 0..1
 * peaks    n peak values, 0..1, or null when peak hold is off
 * baseCol  the bar colour
 * minWidth the thinnest a line may be drawn, for a scaled-down preview where a 1 px bar would vanish
 */
export function drawSpectrum(ctx, { w, h, box, cfg, n, vals, peaks = null, baseCol, minWidth = 0 }) {
  const bv = (i) => vals[cfg.mirror ? Math.min(i, n - 1 - i) : i] || 0;
  const peakOn = !!cfg.peakHold && !!peaks;
  const pkAt = (i) => (peaks && peaks[cfg.mirror ? Math.min(i, n - 1 - i) : i]) || 0;

  const grad = !!cfg.gradient, topCol = cfg.gradColor || "#ffffff";
  const colAt = (v) => grad ? vizLerp(baseCol, topCol, Math.min(1, v)) : baseCol;
  const maxLen = cfg.barLength, gap = cfg.gap, curve = cfg.render === "curve";
  const thickness = Math.max(minWidth, cfg.barThickness);
  ctx.lineCap = cfg.barCap === "square" ? "square" : "round"; ctx.lineWidth = thickness;

  const { x: bx, y: by, w: bw, h: bh } = box;

  if (cfg.shape === "ring") {
    const cx = bx + bw / 2, cy = by + bh / 2, R0 = bw / 2 + gap;
    if (curve) {
      ctx.strokeStyle = grad ? topCol : baseCol; ctx.globalAlpha = 0.85; ctx.lineWidth = Math.max(1.5, thickness);
      ctx.beginPath();
      for (let i = 0; i <= n; i++) { const ii = i % n, a = (ii / n) * Math.PI * 2 - Math.PI / 2, r = R0 + 4 + bv(ii) * maxLen, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
      ctx.closePath(); ctx.stroke();
    } else {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 - Math.PI / 2, v = bv(i), len = 4 + v * maxLen, ca = Math.cos(a), sa = Math.sin(a);
        ctx.strokeStyle = colAt(v); ctx.globalAlpha = 0.25 + v * 0.6;
        ctx.beginPath(); ctx.moveTo(cx + ca * R0, cy + sa * R0); ctx.lineTo(cx + ca * (R0 + len), cy + sa * (R0 + len)); ctx.stroke();
        if (peakOn) { const pl = R0 + 4 + pkAt(i) * maxLen; ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.moveTo(cx + ca * pl, cy + sa * pl); ctx.lineTo(cx + ca * (pl + 3), cy + sa * (pl + 3)); ctx.stroke(); }
      }
    }
  } else if (cfg.shape === "linear") {
    const pos = cfg.linearPos || "bottom", Wlin = w - 56, xs = (w - Wlin) / 2, step = Wlin / n, yb = pos === "center" ? (by + bh / 2) : (h - 40 - gap);
    if (curve) {
      // sign -1 = upward; when mirrored, also draw the reflected downward curve.
      const drawCurve = (sign) => {
        const pts = []; for (let i = 0; i < n; i++) pts.push([xs + i * step + step / 2, yb + sign * (3 + bv(i) * maxLen)]);
        let fillStyle = baseCol;
        if (grad) { const g = ctx.createLinearGradient(0, yb + sign * maxLen, 0, yb); g.addColorStop(0, topCol); g.addColorStop(1, baseCol); fillStyle = g; }
        ctx.globalAlpha = 0.5; ctx.fillStyle = fillStyle;
        ctx.beginPath(); ctx.moveTo(pts[0][0], yb); ctx.lineTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) { const [ppx, ppy] = pts[i - 1], [x, y] = pts[i], mx = (ppx + x) / 2, my = (ppy + y) / 2; ctx.quadraticCurveTo(ppx, ppy, mx, my); }
        ctx.lineTo(pts[pts.length - 1][0], yb); ctx.closePath(); ctx.fill();
      };
      drawCurve(-1);
      if (cfg.mirror) drawCurve(1);
    } else {
      for (let i = 0; i < n; i++) {
        const v = bv(i), len = 3 + v * maxLen, x = xs + i * step + step / 2;
        ctx.strokeStyle = colAt(v); ctx.globalAlpha = 0.3 + v * 0.6;
        ctx.beginPath();
        if (cfg.mirror) { ctx.moveTo(x, yb - len); ctx.lineTo(x, yb + len); } else { ctx.moveTo(x, yb); ctx.lineTo(x, yb - len); }
        ctx.stroke();
        if (peakOn && !cfg.mirror) { const pl = 3 + pkAt(i) * maxLen; ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.moveTo(x - step * 0.32, yb - pl); ctx.lineTo(x + step * 0.32, yb - pl); ctx.stroke(); }
      }
    }
  } else {
    // Frame: the bars stand on the edges of a rectangle around the cover.
    const x0 = bx - gap, y0 = by - gap, x1 = bx + bw + gap, y1 = by + bh + gap, W2 = x1 - x0, H2 = y1 - y0, P = 2 * (W2 + H2);
    const along = (i) => {
      const d = ((i + 0.5) / n) * P;
      if (d < W2) return [x0 + d, y0, 0, -1];
      if (d < W2 + H2) return [x1, y0 + (d - W2), 1, 0];
      if (d < 2 * W2 + H2) return [x1 - (d - (W2 + H2)), y1, 0, 1];
      return [x0, y1 - (d - (2 * W2 + H2)), -1, 0];
    };
    if (curve) {
      // The frame had no curve of its own: a preset asking for one (Soft Curve) drew bars. Like the
      // ring's, it is one closed line, here following the rectangle out by each value.
      const pts = [];
      for (let i = 0; i < n; i++) {
        const [px, py, nx, ny] = along(i), len = 4 + bv(i) * maxLen;
        pts.push([px + nx * len, py + ny * len]);
      }
      ctx.strokeStyle = grad ? topCol : baseCol; ctx.globalAlpha = 0.85; ctx.lineWidth = Math.max(1.5, thickness);
      ctx.lineJoin = "round";
      closedCurve(ctx, pts);
      ctx.stroke();
    } else {
      for (let i = 0; i < n; i++) {
        const [px, py, nx, ny] = along(i), v = bv(i), len = 4 + v * maxLen;
        ctx.strokeStyle = colAt(v); ctx.globalAlpha = 0.25 + v * 0.6;
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + nx * len, py + ny * len); ctx.stroke();
        if (peakOn) { const pl = 4 + pkAt(i) * maxLen, ppx = px + nx * pl, ppy = py + ny * pl, ex = -ny, ey = nx; ctx.globalAlpha = 0.55; ctx.beginPath(); ctx.moveTo(ppx - ex * 2.5, ppy - ey * 2.5); ctx.lineTo(ppx + ex * 2.5, ppy + ey * 2.5); ctx.stroke(); }
      }
    }
  }
  ctx.globalAlpha = 1;
}
