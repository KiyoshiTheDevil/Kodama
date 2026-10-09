// Liquid glass: an element whose backdrop is frosted and, at its rounded edges, bent like the rim
// of a thick lens. The bending is an SVG displacement map drawn for the element's exact shape and
// used as its backdrop-filter, which only Chromium supports; other browsers get plain frost.
// Adds a highlight that follows the pointer, a fine grain, and a wobble when pressed.
const NS = "http://www.w3.org/2000/svg";
const refracts = CSS.supports("backdrop-filter", "url(#x)") && /Chrome|Edg/.test(navigator.userAgent);
const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
let defs = null, n = 0;

// Each pixel of the map says where to look: within `band` of the edge it points outwards along the
// edge's normal, stronger the closer to the edge (R = x, G = y, 128 = stay). Per-corner radii.
function drawMap(w, h, [tl, tr, br, bl], band) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const ctx = c.getContext("2d"), img = ctx.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const r = x < w / 2 ? (y < h / 2 ? tl : bl) : (y < h / 2 ? tr : br);
      const cx = Math.min(Math.max(x, r), w - r), cy = Math.min(Math.max(y, r), h - r);
      let dx = x - cx, dy = y - cy, dist = Math.hypot(dx, dy), edge = r - dist;
      // Along the straight sides the normal is simply sideways or up/down.
      if (dist < 0.001) {
        const toEdge = Math.min(x, w - 1 - x, y, h - 1 - y);
        edge = toEdge;
        if (toEdge === x) { dx = -1; dy = 0; } else if (toEdge === w - 1 - x) { dx = 1; dy = 0; }
        else if (toEdge === y) { dx = 0; dy = -1; } else { dx = 0; dy = 1; }
        dist = 1;
      }
      const i = (y * w + x) * 4;
      let f = 0;
      if (edge >= 0 && edge < band) f = (1 - edge / band) ** 2;
      d[i] = 128 - (dx / dist) * f * 127;
      d[i + 1] = 128 - (dy / dist) * f * 127;
      d[i + 2] = 128; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c.toDataURL();
}

export function liquidGlass(el, { blur = 10, bend = 38, tint = "accent" } = {}) {
  if (el._glass) return;
  el._glass = true;
  el.classList.add("lglass");
  // Loose text (the AI notice's label) into an element of its own, so it can sit above the glass.
  for (const node of [...el.childNodes]) {
    if (node.nodeType === 3 && node.textContent.trim()) {
      const s = document.createElement("span"); node.replaceWith(s); s.appendChild(node);
    }
  }
  if (tint === "neutral") el.classList.add("lglass-neutral");
  for (const cls of ["lglass-tint", "lglass-grain", "lglass-hi"]) {
    const s = document.createElement("span"); s.className = cls; s.setAttribute("aria-hidden", "true");
    el.prepend(s);
  }
  if (!refracts) return;
  if (!defs) {
    const svg = document.createElementNS(NS, "svg");
    svg.setAttribute("width", "0"); svg.setAttribute("height", "0"); svg.setAttribute("aria-hidden", "true");
    svg.style.position = "absolute";
    defs = document.createElementNS(NS, "defs"); svg.appendChild(defs); document.body.appendChild(svg);
  }
  const id = `lglass-${++n}`;
  const f = document.createElementNS(NS, "filter");
  f.id = id;
  for (const [k, v] of Object.entries({ x: 0, y: 0, width: "100%", height: "100%", "color-interpolation-filters": "sRGB" })) f.setAttribute(k, v);
  defs.appendChild(f);
  let disp = null, size = "";
  // The map is drawn for the element's size and corners, so again whenever they change (the
  // download button's text is filled in after loading).
  const build = () => {
    const w = Math.round(el.offsetWidth), h = Math.round(el.offsetHeight);
    const cs = getComputedStyle(el), lim = Math.min(w, h) / 2;
    const radii = ["borderTopLeftRadius", "borderTopRightRadius", "borderBottomRightRadius", "borderBottomLeftRadius"].map((p) => Math.min(lim, parseFloat(cs[p]) || 0));
    // The corners count too: a group's links change them between wide and narrow screens.
    const key = `${w}x${h}:${radii.join(",")}`;
    if (!w || !h || key === size) return;
    size = key;
    f.innerHTML = `<feGaussianBlur in="SourceGraphic" stdDeviation="${blur}" result="b"/>`
      + `<feImage href="${drawMap(w, h, radii, Math.min(18, lim * 0.7))}" x="0" y="0" width="${w}" height="${h}" result="m"/>`
      + `<feDisplacementMap in="b" in2="m" scale="${bend}" xChannelSelector="R" yChannelSelector="G"/>`;
    disp = f.querySelector("feDisplacementMap");
    el.style.backdropFilter = el.style.webkitBackdropFilter = `url(#${id}) saturate(160%) brightness(1.1)`;
  };
  build();
  new ResizeObserver(build).observe(el);
  el.addEventListener("pointermove", (e) => {
    const r = el.getBoundingClientRect();
    el.style.setProperty("--hx", `${e.clientX - r.left}px`);
    el.style.setProperty("--hy", `${e.clientY - r.top}px`);
  });
  // Pressed: it squeezes like something soft and the bent rim ripples with it.
  if (!calm) el.addEventListener("pointerdown", () => {
    el.animate([{ transform: "scale(1,1)" }, { transform: "scale(1.06,.88)" }, { transform: "scale(.97,1.05)" }, { transform: "scale(1.015,.99)" }, { transform: "scale(1,1)" }],
      { duration: 620, easing: "cubic-bezier(.3,.7,.4,1)" });
    if (!disp) return;
    const t0 = performance.now();
    const wob = (t) => {
      const k = Math.min(1, (t - t0) / 650);
      disp.setAttribute("scale", String(bend + 46 * Math.sin(k * Math.PI * 3) * (1 - k)));
      if (k < 1) requestAnimationFrame(wob);
    };
    requestAnimationFrame(wob);
  });
}

// Every button of the site in glass: the main actions tinted with the accent, the rest clear.
const ACCENT = ".dl-main, .btn.primary, .rel.latest .rel-dl a.win";
const CLEAR = ".dl-gh, nav.links a, .ai-notice, .menu-btn, .btn.secondary, .rel-dl a";
export function glassAll(root = document) {
  for (const el of root.querySelectorAll(ACCENT)) liquidGlass(el);
  for (const el of root.querySelectorAll(CLEAR)) liquidGlass(el, { tint: "neutral" });
}
