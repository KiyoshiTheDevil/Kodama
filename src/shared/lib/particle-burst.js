// MIUI-style "disintegrate into particles" effect. Call particleBurst(element) right before
// removing a row/card and it dissolves into a dusty burst of little squares tinted from its
// own cover art (falls back to the app accent). Dependency-free: one shared fixed canvas + a
// single requestAnimationFrame loop that stops itself when the last particle dies.
//
// Performance notes (this app is jank-sensitive): the canvas is created once and reused, the
// loop only runs while particles are alive, particle count is capped, and everything is
// pointer-events:none so it never interferes with the UI underneath.

let canvas = null;
let ctx = null;
let particles = [];
let raf = 0;
let lastT = 0;

function ensureCanvas() {
  if (canvas) return;
  canvas = document.createElement("canvas");
  canvas.setAttribute("aria-hidden", "true");
  Object.assign(canvas.style, {
    position: "fixed",
    left: "0",
    top: "0",
    width: "100vw",
    height: "100vh",
    pointerEvents: "none",
    zIndex: "2147483000",
  });
  document.body.appendChild(canvas);
  ctx = canvas.getContext("2d");
}

function resizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// Sample a handful of representative colors from the element's cover <img>. Same-origin
// (thumbnails are proxied through the local server) so the canvas doesn't taint; still guarded.
function samplePalette(img) {
  if (!img || !img.complete || !img.naturalWidth) return null;
  try {
    const c = document.createElement("canvas");
    c.width = 8;
    c.height = 8;
    const cx = c.getContext("2d");
    cx.drawImage(img, 0, 0, 8, 8);
    const data = cx.getImageData(0, 0, 8, 8).data;
    const cols = [];
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 128) cols.push(`rgb(${data[i]},${data[i + 1]},${data[i + 2]})`);
    }
    return cols.length ? cols : null;
  } catch {
    return null;
  }
}

function accentPalette() {
  const accent =
    getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#e040fb";
  return [accent, accent, "#ffffff", "#c9c9c9"];
}

function tick(now) {
  raf = 0;
  const ms = lastT ? now - lastT : 16.667; // real time elapsed → particle lifetime
  const dt = Math.min(ms / 16.667, 3); // frames elapsed (clamped) → physics step
  lastT = now;
  ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  let alive = 0;
  for (const p of particles) {
    p.life += ms;
    p.vy += p.g * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    const k = p.life / p.ttl;
    if (k >= 1) continue;
    alive++;
    const alpha = k < 0.15 ? 1 : 1 - (k - 0.15) / 0.85; // brief hold, then fade
    const s = p.size * (1 - k * 0.55);
    ctx.globalAlpha = Math.max(0, alpha);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, s, s);
  }
  ctx.globalAlpha = 1;
  particles = alive ? particles.filter((p) => p.life < p.ttl) : [];
  if (particles.length) {
    raf = requestAnimationFrame(tick);
  } else {
    lastT = 0;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
  }
}

export function particleBurst(el, opts = {}) {
  if (!el || typeof window === "undefined") return;
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const rect = el.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return;
  // Off-screen? skip.
  if (rect.bottom < 0 || rect.top > window.innerHeight) return;

  ensureCanvas();
  resizeCanvas();

  const palette = samplePalette(el.querySelector("img")) || accentPalette();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  // Grid the element's area into cells → one particle per cell. Grow the cell size for big
  // elements so the total particle count stays bounded (~500 max).
  let cell = opts.cell || 6;
  while ((rect.width / cell) * (rect.height / cell) > 560) cell += 1;
  const cols = Math.max(1, Math.floor(rect.width / cell));
  const rows = Math.max(1, Math.floor(rect.height / cell));

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = rect.left + (c + 0.5) * (rect.width / cols);
      const y = rect.top + (r + 0.5) * (rect.height / rows);
      const ang = Math.atan2(y - cy, x - cx) + (Math.random() - 0.5) * 0.9;
      const spd = 0.6 + Math.random() * 2.2;
      particles.push({
        x,
        y,
        vx: Math.cos(ang) * spd + (x - cx) * 0.02,
        vy: Math.sin(ang) * spd - (0.6 + Math.random() * 1.4), // upward pop
        g: 0.1 + Math.random() * 0.06,
        size: cell * (0.28 + Math.random() * 0.34), // smaller, dustier grains

        color: palette[(Math.random() * palette.length) | 0],
        life: 0,
        ttl: 460 + Math.random() * 340,
      });
    }
  }
  if (particles.length > 4000) particles = particles.slice(-4000); // hard safety cap
  if (!raf) {
    lastT = 0;
    raf = requestAnimationFrame(tick);
  }
}

// Convenience: burst the element AND fade/shrink it out, then run `done` (e.g. the actual
// state removal) after the short fade so the element visibly dissolves into the particles.
export function dissolve(el, done, opts = {}) {
  const reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!el || reduce) {
    if (done) done();
    return;
  }
  particleBurst(el, opts);
  try {
    el.style.transition = "opacity 150ms ease, transform 150ms ease";
    el.style.opacity = "0";
    el.style.transform = "scale(0.96)";
  } catch {
    /* intentionally ignored */
  }
  if (done) setTimeout(done, 150);
}
