// The three big features on the landing page, each as a little animated scene (GSAP, loaded
// from cdnjs in index.html). A scene only runs while it is on screen: its timelines and its
// per-frame drawing are paused as soon as it scrolls away.
const NS = "http://www.w3.org/2000/svg";
const RING = "M53.79 1.09C66.39 1.09 76.6 11.35 76.6 24C76.6 37.47 65.08 48.04 51.72 46.82L46.85 46.37C44.78 46.18 42.71 46.29 40.68 46.7C35.03 47.84 30.04 42.84 31.17 37.16C31.58 35.12 31.69 33.04 31.5 30.96L31.06 26.07C29.85 12.66 40.37 1.09 53.79 1.09Z M53.69 7.09C43.6 7.09 35.75 15.9 36.86 25.97L37.27 29.68C37.59 32.58 37.28 35.52 36.36 38.3C35.71 40.27 37.58 42.15 39.55 41.49C42.31 40.57 45.23 40.25 48.13 40.58L51.82 40.99C61.86 42.11 70.63 34.22 70.63 24.09C70.63 14.7 63.05 7.09 53.69 7.09Z";
const gsap = window.gsap;
// Without GSAP (blocked, offline) every scene shows its finished picture, as with reduced motion.
const still = !gsap || matchMedia("(prefers-reduced-motion: reduce)").matches;

const add = (parent, html) => { const g = document.createElementNS(NS, "g"); g.innerHTML = html; parent.appendChild(g); return g; };
const set = (el, a) => { for (const k in a) el.setAttribute(k, a[k]); };
const spiritSvg = (x, y, s, accent, phones = true) => `<g transform="translate(${x} ${y}) scale(${s}) translate(-54 -48)"><g class="bd">
  <path d="${RING}" fill="#eef8f1" fill-rule="evenodd"/>
  <g class="eyes"><rect x="46.7" y="16.1" width="6" height="12" rx="3" fill="#eef8f1"/><rect x="55.7" y="16.1" width="6" height="12" rx="3" fill="#eef8f1"/></g>
  ${phones ? `<path d="M30 24C30 -3 77.5 -3 77.5 24" fill="none" stroke="${accent}" stroke-width="3.2"/><rect x="26.8" y="18" width="7" height="13" rx="3.5" fill="${accent}"/><rect x="73.8" y="18" width="7" height="13" rx="3.5" fill="${accent}"/>` : ""}
</g></g>`;

// Runs a scene while it is visible. `ctx.tl` registers a timeline or tween, `ctx.tick` a
// per-frame drawing function (gets the time in seconds).
function scene(svg, build) {
  const tls = [], ticks = [];
  const ctx = { tl: (t) => (tls.push(t), t), tick: (f) => ticks.push(f) };
  build(svg, ctx);
  if (still) { ticks.forEach((f) => f(1)); return; }
  const frame = (t) => ticks.forEach((f) => f(t));
  let on = false;
  const run = (v) => {
    if (v === on) return;
    on = v;
    tls.forEach((t) => (v ? t.resume() : t.pause()));
    if (v) gsap.ticker.add(frame); else gsap.ticker.remove(frame);
  };
  tls.forEach((t) => t.pause());
  ticks.forEach((f) => f(0));
  new IntersectionObserver(([e]) => run(e.isIntersecting), { rootMargin: "60px 0px" }).observe(svg);
}

const beat = 0.52;
const bob = (el) => gsap.to(el, { y: -5, scaleY: 1.04, scaleX: 0.97, duration: beat / 2, ease: "sine.inOut", yoyo: true, repeat: -1, transformOrigin: "50% 100%" });
const blink = (el) => gsap.timeline({ repeat: -1, repeatDelay: 3.4 }).to(el, { scaleY: 0.1, duration: 0.07, transformOrigin: "50% 50%" }).to(el, { scaleY: 1, duration: 0.09 });
// Little notes floating up from a spirit.
const notes = (svg, x, y, color, every = 0.9) => gsap.timeline({ repeat: -1 }).call(() => {
  const t = document.createElementNS(NS, "text");
  t.textContent = Math.random() > 0.5 ? "♪" : "♫";
  set(t, { x, y, "font-size": 11 + Math.random() * 5, fill: Math.random() > 0.5 ? color : "#0AFFFB" });
  svg.appendChild(t);
  gsap.fromTo(t, { opacity: 0 }, { keyframes: [{ opacity: 1, duration: 0.3 }, { opacity: 0, duration: 1.4, delay: 0.5 }] });
  gsap.to(t, { x: 10 + Math.random() * 18, y: -50, rotation: (Math.random() - 0.5) * 30, duration: 2.2, ease: "sine.out", onComplete: () => t.remove() });
}).to({}, { duration: every });

// ── Synced lyrics: lines light up word by word and scroll on ───────────────
function lyrics(s, ctx) {
  const LINES = ["somewhere in the evening", "walking home with the lights", "still on in the window", "humming what you played", "the night before"];
  add(s, `<defs><linearGradient id="ly-fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".3" stop-color="#fff"/><stop offset=".7" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <mask id="ly-mask"><rect x="130" y="0" width="300" height="210" fill="url(#ly-fade)"/></mask>
    ${LINES.map((_, i) => `<clipPath id="ly-wp${i}"><rect class="wr" x="150" y="${76 + i * 38}" width="0" height="34"/></clipPath>`).join("")}</defs>`);
  const lines = add(s, `<g mask="url(#ly-mask)"><g class="ln">${LINES.map((l, i) => `
    <text x="150" y="${104 + i * 38}" font-size="19" font-weight="600" fill="#3f5c49">${l}</text>
    <text class="br" x="150" y="${104 + i * 38}" font-size="19" font-weight="600" fill="#eaf5ec" clip-path="url(#ly-wp${i})">${l}</text>`).join("")}</g></g>`);
  const sp = add(s, spiritSvg(78, 172, 1.35, "#9be36d"));
  const wr = s.querySelectorAll(".wr");
  if (still) { set(wr[0], { width: 400 }); return; }
  ctx.tl(notes(s, 92, 98, "#9be36d"));
  ctx.tl(bob(sp.querySelector(".bd"))); ctx.tl(blink(sp.querySelector(".eyes")));
  const ln = lines.querySelector(".ln");
  const widths = [...lines.querySelectorAll(".br")].map((t) => t.getComputedTextLength() + 4);
  const tl = ctx.tl(gsap.timeline({ repeat: -1 }));
  LINES.slice(0, -1).forEach((_, i) => {
    tl.to(wr[i], { attr: { width: widths[i] }, duration: beat * 4, ease: "none" })
      .to(ln, { y: -(i + 1) * 38, duration: 0.8, ease: "power3.inOut" }, "-=0.15");
  });
  tl.to(ln, { opacity: 0, duration: 0.4 }).set(ln, { y: 0 }).set(wr, { attr: { width: 0 } }).to(ln, { opacity: 1, duration: 0.4 });
}

// ── Overlay editor: a now-playing widget built from layers, then put on stream ──
function overlay(s, ctx) {
  const BLUE = "#4c9cff";
  const C = { x: 112, y: 86, w: 220, h: 92, r: 18 };     // the widget
  const COV = { x: C.x + 14, y: C.y + 14, s: 64 };       // the cover's final spot
  const TX = C.x + 92;                                   // the text column

  const stream = add(s, `<g opacity="0"><defs><clipPath id="ov-stc"><rect x="30" y="18" width="360" height="212" rx="20"/></clipPath>
    <linearGradient id="ov-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#16261d"/><stop offset="1" stop-color="#0b130f"/></linearGradient></defs>
    <rect x="30" y="18" width="360" height="212" rx="20" fill="url(#ov-sky)"/>
    <g clip-path="url(#ov-stc)"><circle cx="300" cy="84" r="26" fill="#22382a"/>
      <path d="M30 230 L30 168 Q100 132 170 156 T300 146 T390 160 L390 230 Z" fill="#14231a"/>
      <path d="M30 230 L30 196 Q130 176 230 192 T390 188 L390 230 Z" fill="#101c15"/></g>
    <g class="live"><rect x="46" y="32" width="34" height="14" rx="4" fill="#e24b4a"/><text x="53.5" y="42.5" font-size="8.5" font-weight="700" fill="#fff">LIVE</text></g></g>`).firstChild;

  // The widget's layers, in one group so it can move as a whole.
  const ovl = add(s, `<defs>
      <clipPath id="ov-cardc"><rect class="cc" x="${C.x}" y="${C.y}" width="0" height="0" rx="${C.r}"/></clipPath>
      <clipPath id="ov-covc"><rect class="covr" width="${COV.s}" height="${COV.s}" rx="3"/></clipPath>
      <filter id="ov-bl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>
      <linearGradient id="ov-cg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f2a3bb"/><stop offset="1" stop-color="#8a3cf0"/></linearGradient></defs>
    <rect class="card" x="${C.x}" y="${C.y}" width="0" height="0" rx="${C.r}" fill="#1d3a28"/>
    <g clip-path="url(#ov-cardc)"><g class="sh" opacity="0"><g filter="url(#ov-bl)" opacity=".9">
      <circle class="b1" r="40" fill="#3a5bd0"/><circle class="b2" r="42" fill="#7a48e0"/><circle class="b3" r="30" fill="#d65a86"/><circle class="b4" r="26" fill="#2fc9c4"/></g>
      <rect x="${C.x}" y="${C.y}" width="${C.w}" height="${C.h}" fill="#0b130f" opacity=".22"/></g></g>
    <g class="cvp"><g class="cv" opacity="0"><g clip-path="url(#ov-covc)"><rect width="64" height="64" fill="url(#ov-cg)"/>
      <circle cx="20" cy="22" r="8" fill="#ffe3ec" opacity=".8"/><path d="M0 64 L0 46 L22 30 L40 44 L64 28 L64 64 Z" fill="#5b2a8f" opacity=".7"/></g></g></g>
    <text class="ti" x="${TX}" y="${C.y + 36}" font-size="15" font-weight="400" fill="#f4fbf6"></text>
    <text class="ar" x="${TX}" y="${C.y + 52}" font-size="10" fill="#d9e9de" opacity="0">tuki.</text>
    <g class="vz" opacity="0">${Array.from({ length: 12 }, () => `<rect class="lv" width="4" rx="2"/>`).join("")}</g>`);
  const card = ovl.querySelector(".card"), shader = ovl.querySelector(".sh"), cover = ovl.querySelector(".cv"), coverPos = ovl.querySelector(".cvp"),
    covR = ovl.querySelector(".covr"), title = ovl.querySelector(".ti"), artist = ovl.querySelector(".ar"),
    bars = ovl.querySelector(".vz"), lv = bars.querySelectorAll(".lv"), cardClip = ovl.querySelector(".cc");

  // Editor chrome.
  const chrome = add(s, `<rect class="sb" fill="none" stroke="${BLUE}" stroke-width="1.3" opacity="0"/>
    <g class="dm" opacity="0"><rect x="-26" width="52" height="14" rx="4" fill="${BLUE}"/><text class="dt" y="10" font-size="7.5" fill="#fff" text-anchor="middle"></text></g>
    <g class="ms" opacity="0"><line class="m1" stroke="#ff5c5c"/><line class="m2" stroke="#ff5c5c"/>
      <g class="ml1"><rect x="-10" y="-6" width="20" height="11" rx="3" fill="#ff5c5c"/><text y="2.5" font-size="7" fill="#fff" text-anchor="middle"></text></g>
      <g class="ml2"><rect x="-10" y="-6" width="20" height="11" rx="3" fill="#ff5c5c"/><text y="2.5" font-size="7" fill="#fff" text-anchor="middle"></text></g></g>
    <g class="rd" opacity="0"><circle r="3.2" fill="#fff" stroke="${BLUE}" stroke-width="1.4"/></g>
    <g class="rl" opacity="0"><rect x="-26" width="52" height="14" rx="4" fill="${BLUE}"/><text class="rt" y="10" font-size="7.5" fill="#fff" text-anchor="middle"></text></g>`);
  const selBox = chrome.querySelector(".sb"), dims = chrome.querySelector(".dm"), meas = chrome.querySelector(".ms"),
    rDot = chrome.querySelector(".rd"), rLab = chrome.querySelector(".rl");

  const TOOLS = ["select", "rect", "image", "text", "levels", "shader", "picker"];
  const TBW = TOOLS.length * 26 + 8, TBX = (440 - TBW) / 2, TBY = 16;
  const ICON = {
    select: `<path d="M8 6 L8 16 L10.6 13.6 L12.3 17.4 L14 16.7 L12.4 13 L15.5 13 Z" fill="#cfe3d5"/>`,
    rect: `<rect x="6" y="7" width="10" height="8" rx="2" fill="none" stroke="#cfe3d5" stroke-width="1.6"/>`,
    image: `<rect x="5.5" y="6.5" width="11" height="9" rx="2" fill="none" stroke="#cfe3d5" stroke-width="1.5"/><path d="M6.5 14.5 L9.5 11 L11.5 13 L13.5 11 L15.5 14" fill="none" stroke="#cfe3d5" stroke-width="1.3"/>`,
    text: `<text x="11" y="15.5" font-size="11" font-weight="700" fill="#cfe3d5" text-anchor="middle">T</text>`,
    levels: `<rect x="6" y="10" width="2.4" height="6" rx="1.2" fill="#cfe3d5"/><rect x="9.8" y="6" width="2.4" height="10" rx="1.2" fill="#cfe3d5"/><rect x="13.6" y="8.5" width="2.4" height="7.5" rx="1.2" fill="#cfe3d5"/>`,
    shader: `<path d="M11 5 L12.3 9.7 L17 11 L12.3 12.3 L11 17 L9.7 12.3 L5 11 L9.7 9.7 Z" fill="#cfe3d5"/>`,
    picker: `<path d="M14.5 6.5 L16 8 L10 14 L8 14.5 L8.5 12.5 Z" fill="none" stroke="#cfe3d5" stroke-width="1.5" stroke-linejoin="round"/>`,
  };
  const toolbar = add(s, `<rect width="${TBW}" height="30" rx="15" fill="#1b2b22"/>
    ${TOOLS.map((t, i) => `<g transform="translate(${8 + i * 26} 4)"><rect class="tbg t-${t}" width="22" height="22" rx="11" fill="${BLUE}" fill-opacity="0"/>${ICON[t]}</g>`).join("")}`);
  const layersP = add(s, `<rect width="88" height="136" rx="12" fill="#1b2b22"/><text x="10" y="16" font-size="7.5" fill="#7f9c89">Layers</text><g class="rows"></g>`);
  const rows = layersP.querySelector(".rows");
  const SH = [["#3a5bd0", "#7a48e0"], ["#d65a86", "#fac775"], ["#1d9e75", "#0AFFFB"], ["#0b130f", "#4c5a52"]];
  const strip = add(s, `<rect width="40" height="128" rx="12" fill="#1b2b22"/>${SH.map((c, i) => `
    <defs><linearGradient id="ov-sg${i}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c[0]}"/><stop offset="1" stop-color="${c[1]}"/></linearGradient></defs>
    <rect class="th th${i}" x="7" y="${8 + i * 30}" width="26" height="24" rx="7" fill="url(#ov-sg${i})" stroke="${BLUE}" stroke-width="0"/>`).join("")}`);
  const chip = add(s, `<rect width="78" height="18" rx="9" fill="#1b2b22"/><text class="fn" x="10" y="12.3" font-size="7.5" fill="#eaf5ec">MiSans · Regular</text>`);
  const swatch = add(s, `<circle r="9" fill="#1b2b22"/><circle class="swc" r="6" fill="#9be36d"/>`);
  const fx = add(s, "");
  // The pointer changes with the tool, like in the editor: an arrow, a crosshair for drawing,
  // a text beam and a pipette. Its hot spot is always at 0,0. Outlines are drawn twice (dark
  // under light) so they read on any background.
  const line2 = (d) => `<path d="${d}" fill="none" stroke="#0b130f" stroke-width="3.6" stroke-linecap="round"/><path d="${d}" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round"/>`;
  const cursor = add(s, `<defs><filter id="ov-csh" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="1.6" stdDeviation="1.4" flood-color="#000" flood-opacity=".45"/></filter></defs>
    <g class="cin" filter="url(#ov-csh)">
      <g class="c-arrow"><path d="M0 0 L0 15.6 L3.9 12 L6.5 18 L9.2 16.9 L6.7 11 L11.8 11 Z" fill="#fff" stroke="#0b130f" stroke-width="1.3" stroke-linejoin="round"/></g>
      <g class="c-cross" opacity="0">${line2("M0 -7 V7 M-7 0 H7")}</g>
      <g class="c-beam" opacity="0">${line2("M-3.2 -8.5 Q0 -8.5 0 -6 V6 Q0 8.5 -3.2 8.5 M3.2 -8.5 Q0 -8.5 0 -6 M3.2 8.5 Q0 8.5 0 6")}</g>
      <g class="c-pick" opacity="0"><path d="M0.4 -0.4 L1.6 -4.6 L8.6 -11.6 L11.6 -8.6 L4.6 -1.6 Z" fill="#fff" stroke="#0b130f" stroke-width="1.3" stroke-linejoin="round"/><circle cx="11.6" cy="-11.6" r="3" fill="#fff" stroke="#0b130f" stroke-width="1.3"/></g>
    </g>`);
  const cin = cursor.querySelector(".cin");
  const SHAPES = ["arrow", "cross", "beam", "pick"];
  const shape = (name) => SHAPES.forEach((k) => cursor.querySelector(".c-" + k).setAttribute("opacity", k === name ? 1 : 0));
  const TOOL_CURSOR = { rect: "cross", image: "cross", levels: "cross", text: "beam", picker: "pick" };
  // The arrow leans into its movement a little and settles when it stops.
  const lean = { a: 0, px: 0 };

  // The spirit: .look follows the cursor, .eyes blinks inside it.
  const SP = { x: 406, y: 240 };
  const spirit = add(s, `<g transform="translate(${SP.x} ${SP.y}) scale(.82) translate(-54 -48)"><g class="bd"><path d="${RING}" fill="#eef8f1" fill-rule="evenodd"/>
    <g class="look"><g class="eyes"><rect x="46.7" y="16.1" width="6" height="12" rx="3" fill="#eef8f1"/><rect x="55.7" y="16.1" width="6" height="12" rx="3" fill="#eef8f1"/></g>
    <path class="happy" d="M46.4 24.5l3.3-5 3.3 5M55.4 24.5l3.3-5 3.3 5" fill="none" stroke="#eef8f1" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round" opacity="0"/></g></g></g>`);
  const look = spirit.querySelector(".look"), eyes = spirit.querySelector(".eyes"), happy = spirit.querySelector(".happy"), body = spirit.querySelector(".bd");

  const state = { accent: "#9be36d", gx: C.x + C.w / 2, gy: C.y + C.h / 2 };
  const prop = (el, k, fallback) => (gsap ? +gsap.getProperty(el, k) : fallback);
  ctx.tick((t) => {
    const cx = C.x + C.w / 2, cy = C.y + C.h / 2, b = (k) => shader.querySelector(".b" + k);
    set(b(1), { cx: cx - 60 + Math.sin(t * 0.8) * 26, cy: cy + Math.cos(t * 1.1) * 16 });
    set(b(2), { cx: cx + 50 + Math.cos(t * 0.7) * 28, cy: cy + Math.sin(t * 0.9) * 18 });
    set(b(3), { cx: cx + Math.sin(t * 1.2) * 40, cy: cy - 18 + Math.cos(t * 0.6) * 12 });
    set(b(4), { cx: cx + 20 + Math.cos(t * 1.5) * 34, cy: cy + 24 + Math.sin(t * 0.7) * 10 });
    lv.forEach((r, i) => {
      const h = 3 + 14 * Math.abs(Math.sin(t * (3.4 + i * 0.37) + i * 0.9) * 0.6 + Math.sin(t * 2.1 + i * 1.3) * 0.4);
      set(r, { x: TX + i * 8, y: C.y + C.h - 14 - h, height: h, fill: state.accent });
    });
    const cxNow = prop(cursor, "x", 0);
    const want = Math.max(-16, Math.min(16, (cxNow - lean.px) * 2.2));
    lean.px = cxNow; lean.a += (want - lean.a) * 0.18;
    cin.setAttribute("transform", `rotate(${lean.a.toFixed(2)})`);
    const vis = prop(cursor, "opacity", 0) > 0.5;
    const tx = vis ? prop(cursor, "x") : state.gx, ty = vis ? prop(cursor, "y") : state.gy;
    const dx = tx - SP.x, dy = ty - (SP.y - 20), d = Math.hypot(dx, dy) || 1;
    look.setAttribute("transform", `translate(${(dx / d) * 3.4} ${(dy / d) * 2.6})`);
  });

  if (still) {
    set(card, { width: C.w, height: C.h }); set(cardClip, { width: C.w, height: C.h }); set(covR, { rx: 12 });
    coverPos.setAttribute("transform", `translate(${COV.x} ${COV.y})`);
    [shader, cover, artist, bars].forEach((e) => e.setAttribute("opacity", 1));
    title.textContent = "最低界隈"; title.setAttribute("font-weight", 700); state.accent = "#f2a3bb";
    [toolbar, layersP, strip, chip, swatch, cursor].forEach((e) => e.setAttribute("opacity", 0));
    return;
  }
  ctx.tl(blink(eyes));
  ctx.tl(gsap.to(body, { y: -3, scaleY: 1.03, scaleX: 0.98, duration: 0.9, yoyo: true, repeat: -1, ease: "sine.inOut", transformOrigin: "50% 100%" }));

  // Menus stay calm, the widget gets the bounce.
  const toolPos = (t) => ({ x: TBX + 8 + TOOLS.indexOf(t) * 26 + 11, y: TBY + 15 });
  // A hand moves in arcs, not straight lines: the path bends to one side, with a little
  // wind-up at the start and a small overshoot before it stops.
  let bend = 1;
  const move = (x, y, d = 0.55) => {
    const p = { t: 0 }; let sx = 0, sy = 0, kx = 0, ky = 0;
    return gsap.to(p, {
      t: 1, duration: d, ease: "back.inOut(1.15)",
      onStart: () => {
        sx = +gsap.getProperty(cursor, "x"); sy = +gsap.getProperty(cursor, "y");
        const dx = x - sx, dy = y - sy; bend = -bend;
        kx = (sx + x) / 2 - dy * 0.22 * bend; ky = (sy + y) / 2 + dx * 0.22 * bend;
      },
      onUpdate: () => {
        const t = p.t, u = 1 - t;
        gsap.set(cursor, { x: u * u * sx + 2 * u * t * kx + t * t * x, y: u * u * sy + 2 * u * t * ky + t * t * y });
      },
    });
  };
  const ripple = () => {
    const r = document.createElementNS(NS, "circle");
    set(r, { cx: +gsap.getProperty(cursor, "x"), cy: +gsap.getProperty(cursor, "y"), r: 2, fill: "none", stroke: "#fff", "stroke-width": 1.4 });
    fx.appendChild(r);
    gsap.to(r, { attr: { r: 13 }, opacity: 0, duration: 0.45, ease: "power2.out", onComplete: () => r.remove() });
  };
  const press = () => gsap.timeline()
    .to(cursor, { scale: 0.8, duration: 0.08, transformOrigin: "0 0", ease: "power2.in" }).call(ripple)
    .to(cursor, { scale: 1, duration: 0.4, ease: "elastic.out(1.4, 0.4)" });
  const pop = (el, origin) => gsap.fromTo(el, { opacity: 0, scale: 0.94, transformOrigin: origin }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(1.5)" });
  const hide = (el) => gsap.to(el, { opacity: 0, scale: 0.96, duration: 0.2, ease: "power2.in" });
  const pickTool = (t) => gsap.timeline()
    .call(() => shape("arrow"))
    .add(move(toolPos(t).x - 2, toolPos(t).y - 2, 0.5)).add(press())
    .call(() => shape(TOOL_CURSOR[t] || "arrow"), null, "-=0.3")
    .to(toolbar.querySelectorAll(".tbg"), { attr: { "fill-opacity": 0 }, duration: 0.12 }, "<")
    .to(toolbar.querySelector(".t-" + t), { attr: { "fill-opacity": 1 }, duration: 0.12 }, "<");
  let rowN = 0;
  const addRow = (label, color) => {
    const r = add(rows, `<g transform="translate(6 ${24 + rowN++ * 20})"><rect width="76" height="17" rx="6" fill="#22362a"/><rect x="6" y="4.5" width="8" height="8" rx="2" fill="${color}"/><text x="19" y="11.5" font-size="7.5" fill="#cfe3d5">${label}</text></g>`);
    gsap.from(r, { x: -8, opacity: 0, duration: 0.35, ease: "power2.out" });
  };
  const squash = (el, amt = 0.08) => gsap.timeline()
    .to(el, { scaleX: 1 + amt, scaleY: 1 - amt, duration: 0.09, transformOrigin: "50% 50%" })
    .to(el, { scaleX: 1, scaleY: 1, duration: 0.7, ease: "elastic.out(1.2, 0.35)" });
  const sparkle = (cx, cy, n = 10) => {
    const cols = ["#e0567e", "#9be36d", "#0AFFFB", "#fac775", BLUE];
    for (let i = 0; i < n; i++) {
      const st = document.createElementNS(NS, "path");
      set(st, { d: "M0 -4 L1 -1 L4 0 L1 1 L0 4 L-1 1 L-4 0 L-1 -1 Z", fill: cols[i % 5] }); fx.appendChild(st);
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.5, d = 50 + Math.random() * 30;
      gsap.fromTo(st, { x: cx, y: cy, scale: 0.2, opacity: 1 }, { x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d * 0.6, scale: 1 + Math.random() * 0.5, rotation: 160, duration: 0.8, ease: "power3.out" });
      gsap.to(st, { opacity: 0, duration: 0.35, delay: 0.5, onComplete: () => st.remove() });
    }
  };
  const sel = (x, y, w, h, rx) => set(selBox, { x: x - 2, y: y - 2, width: w + 4, height: h + 4, rx: rx + 2 });

  // The rectangle, drawn out.
  const cs = { w: 0, h: 0 };
  const updCard = () => {
    set(card, { width: cs.w, height: cs.h }); set(cardClip, { width: cs.w, height: cs.h }); sel(C.x, C.y, cs.w, cs.h, C.r);
    dims.setAttribute("transform", `translate(${C.x + cs.w / 2} ${C.y + cs.h + 8})`);
    dims.querySelector(".dt").textContent = `${Math.round(cs.w * 2)} × ${Math.round(cs.h * 2)}`;
  };
  // The cover, dragged into place with measuring lines.
  const cp = { x: 0, y: 0 };
  const updCover = () => {
    // The position sits on a wrapper: the pop-in tween on the cover itself would otherwise
    // write its own (stale) position back on every frame.
    coverPos.setAttribute("transform", `translate(${cp.x} ${cp.y})`); sel(cp.x, cp.y, COV.s, COV.s, +covR.getAttribute("rx"));
    const m1 = meas.querySelector(".m1"), m2 = meas.querySelector(".m2"), my = cp.y + COV.s / 2, mx = cp.x + COV.s / 2;
    set(m1, { x1: C.x, y1: my, x2: cp.x, y2: my }); set(m2, { x1: mx, y1: C.y, x2: mx, y2: cp.y });
    const l1 = meas.querySelector(".ml1"), l2 = meas.querySelector(".ml2");
    l1.setAttribute("transform", `translate(${(C.x + cp.x) / 2} ${my - 9})`); l1.querySelector("text").textContent = Math.round((cp.x - C.x) * 2);
    l2.setAttribute("transform", `translate(${mx + 14} ${(C.y + cp.y) / 2})`); l2.querySelector("text").textContent = Math.round((cp.y - C.y) * 2);
  };
  // Its corners, rounded with the radius handle.
  const rr = { r: 3 };
  const updRadius = () => {
    set(covR, { rx: rr.r }); sel(COV.x, COV.y, COV.s, COV.s, rr.r);
    const o = Math.max(rr.r, 6) * 0.7;
    rDot.setAttribute("transform", `translate(${COV.x + o} ${COV.y + o})`);
    rLab.setAttribute("transform", `translate(${COV.x + COV.s / 2} ${COV.y + COV.s + 8})`);
    rLab.querySelector(".rt").textContent = `Radius ${Math.round(rr.r * 2)}`;
  };
  const typed = { n: 0 }, TITLE = "最低界隈";

  function reset() {
    rows.innerHTML = ""; rowN = 0; cs.w = cs.h = 0; updCard(); rr.r = 3; set(covR, { rx: 3 });
    state.accent = "#9be36d"; state.gx = C.x + C.w / 2; state.gy = C.y + C.h / 2; typed.n = 0; title.textContent = "";
    title.setAttribute("font-weight", 400); chip.querySelector(".fn").textContent = "MiSans · Regular";
    gsap.set([shader, cover, artist, bars, selBox, dims, meas, rDot, rLab, strip, chip, swatch, toolbar, layersP, stream], { opacity: 0 });
    gsap.set(ovl, { x: 0, y: 0, scale: 1, opacity: 1 });
    gsap.set(cursor, { x: 230, y: 268, opacity: 1, scale: 1 }); shape("arrow"); lean.px = 230; lean.a = 0;
    gsap.set(toolbar, { x: TBX, y: TBY }); gsap.set(layersP, { x: 10, y: 64 }); gsap.set(strip, { x: 346, y: 64 });
    gsap.set(chip, { x: TX, y: C.y - 24 }); swatch.querySelector(".swc").setAttribute("fill", "#9be36d");
    strip.querySelectorAll(".th").forEach((r) => r.setAttribute("stroke-width", 0));
    toolbar.querySelectorAll(".tbg").forEach((b) => b.setAttribute("fill-opacity", 0));
    eyes.setAttribute("opacity", 1); happy.setAttribute("opacity", 0);
  }
  reset();

  ctx.tl(gsap.timeline({ repeat: -1, repeatDelay: 0.4, onRepeat: reset }))
    // the editor opens
    .add(pop(toolbar, "50% 0%")).add(pop(layersP, "0% 0%"), "<0.08")
    // a rectangle
    .add(pickTool("rect"))
    .add(move(C.x, C.y))
    .add(press()).set([dims, selBox], { opacity: 1 })
    .to(cursor, { x: C.x + C.w, y: C.y + C.h, duration: 0.9, ease: "power2.inOut" })
    .to(cs, { w: C.w, h: C.h, duration: 0.9, ease: "power2.inOut", onUpdate: updCard }, "<")
    .call(() => addRow("Background", "#1d3a28"))
    .add(squash(card, 0.05))
    .to(dims, { opacity: 0, duration: 0.2 }, "+=0.15")
    // a shader as its fill
    .add(pickTool("shader"))
    .add(pop(strip, "0% 50%"), "<0.2")
    .add(move(346 + 22, 64 + 8 + 12))   // onto the first preset (its colours are the shader shown)
    .add(press()).set(strip.querySelector(".th0"), { attr: { "stroke-width": 2 } })
    .to(shader, { opacity: 1, duration: 0.6 }, "<").add(squash(card, 0.07), "<")
    .add(hide(strip), "+=0.35")
    // the cover, placed and dragged into place
    .add(pickTool("image"))
    .add(move(COV.x + 64, COV.y + 38))
    .add(press())
    .call(() => { cp.x = COV.x + 34; cp.y = COV.y + 8; updCover(); })
    .fromTo(cover, { opacity: 0, scale: 0.4, transformOrigin: "50% 50%" }, { opacity: 1, scale: 1, duration: 0.75, ease: "elastic.out(1.1, 0.45)" }, "<")
    .call(() => addRow("Cover", "#f2a3bb"))
    .add(pickTool("select"))
    .add(move(COV.x + 34 + 32, COV.y + 8 + 32))
    .add(press()).set([selBox, meas], { opacity: 1 })
    .to(cp, { x: COV.x, y: COV.y, duration: 0.8, ease: "power2.inOut", onUpdate: updCover })
    .to(cursor, { x: COV.x + 32, y: COV.y + 32, duration: 0.8, ease: "power2.inOut" }, "<")
    .to(meas, { opacity: 0, duration: 0.2 }, "+=0.25")
    // rounded corners
    .call(updRadius).to(rDot, { opacity: 1, duration: 0.2 })
    .add(move(COV.x + 4.2, COV.y + 4.2, 0.4))
    .add(press()).to(rLab, { opacity: 1, duration: 0.15 }, "<")
    .to(rr, { r: 12, duration: 0.7, ease: "power2.inOut", onUpdate: updRadius })
    .to(cursor, { x: COV.x + 8.4, y: COV.y + 8.4, duration: 0.7, ease: "power2.inOut" }, "<")
    .to([rDot, rLab, selBox], { opacity: 0, duration: 0.2 }, "+=0.3")
    // the title, typed, then made bold
    .add(pickTool("text"))
    .add(move(TX + 2, C.y + 24))
    .add(press()).call(() => addRow("Title", "#eaf5ec"))
    .to(typed, { n: TITLE.length, duration: 0.7, ease: "steps(4)", onUpdate: () => (title.textContent = TITLE.slice(0, Math.round(typed.n))) })
    .to(artist, { opacity: 1, duration: 0.3 }).call(() => addRow("Artist", "#d9e9de"), null, "<")
    .add(pop(chip, "0% 100%")).call(() => shape("arrow"))
    .add(move(TX + 40, C.y - 16, 0.45))
    .add(press()).call(() => { chip.querySelector(".fn").textContent = "MiSans · Bold"; title.setAttribute("font-weight", 700); })
    .fromTo(title, { scale: 1.08, transformOrigin: "0% 50%" }, { scale: 1, duration: 0.6, ease: "elastic.out(1.1, 0.4)" }, "<")
    .add(hide(chip), "+=0.35")
    // live audio levels
    .add(pickTool("levels"))
    .add(move(TX + 40, C.y + C.h - 20))
    .add(press())
    .fromTo(bars, { opacity: 0, scaleY: 0.2, transformOrigin: "50% 100%" }, { opacity: 1, scaleY: 1, duration: 0.7, ease: "elastic.out(1.1, 0.4)" }, "<")
    .call(() => addRow("Levels", "#9be36d"))
    // a colour from the cover
    .add(pickTool("picker"))
    .add(move(COV.x + 18, COV.y + 18))
    .set(swatch, { x: COV.x + 34, y: COV.y + 4 }).to(swatch, { opacity: 1, duration: 0.15 })
    .to(swatch.querySelector(".swc"), { attr: { fill: "#f2a3bb" }, duration: 0.25 })
    .add(press())
    .to(state, { accent: "#f2a3bb", duration: 0.45 }, "<")
    .to(swatch, { opacity: 0, duration: 0.25 }, "+=0.2")
    // done: the tools leave, the widget moves into the corner of the stream
    .to(toolbar.querySelectorAll(".tbg"), { attr: { "fill-opacity": 0 }, duration: 0.1 })
    .add(hide([toolbar, layersP]), "+=0.3").call(() => shape("arrow"), null, "<")
    .to(cursor, { x: 240, y: 285, opacity: 0, duration: 0.45, ease: "power2.in" }, "<")
    .fromTo(stream, { opacity: 0 }, { opacity: 1, duration: 0.5 })
    .to(ovl, { x: 46 - C.x, y: 150 - C.y, scale: 0.72, svgOrigin: `${C.x} ${C.y}`, duration: 0.9, ease: "back.out(1.4)" }, "<0.1")
    .to(state, { gx: 46 + 80, gy: 150 + 33, duration: 0.9 }, "<")
    .from(stream.querySelector(".live"), { scale: 0, transformOrigin: "50% 50%", duration: 0.5, ease: "back.out(2)" }, "-=0.3")
    .call(() => sparkle(46 + 80, 150 + 33, 10))
    .set(eyes, { opacity: 0 }, "<").set(happy, { opacity: 1 }, "<")
    .to(body, { keyframes: { y: [0, -14, 0, -7, 0], scaleY: [1, 1.07, 0.94, 1.03, 1] }, duration: 0.9, ease: "none", transformOrigin: "50% 100%" }, "<")
    .to({}, { duration: 2.4 })
    .to([ovl, stream], { opacity: 0, duration: 0.5 });
}

// ── Listen together: friends on a bench, one more hops in ───────────────────
function together(s, ctx) {
  // Bushes behind the bench: one gradient across the whole scene (not per circle), fading out
  // at the sides and the bottom, cut off where the scene ends.
  add(s, `<defs><linearGradient id="lt-trees" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="420" y2="0"><stop offset="0" stop-color="#132719" stop-opacity="0"/><stop offset=".2" stop-color="#132719"/><stop offset=".8" stop-color="#132719"/><stop offset="1" stop-color="#132719" stop-opacity="0"/></linearGradient>
    <linearGradient id="lt-down" gradientUnits="userSpaceOnUse" x1="0" y1="200" x2="0" y2="240"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <mask id="lt-mask"><rect x="-20" y="0" width="460" height="240" fill="url(#lt-down)"/></mask></defs>
    <g fill="url(#lt-trees)" mask="url(#lt-mask)"><circle cx="40" cy="250" r="52"/><circle cx="120" cy="262" r="40"/><circle cx="300" cy="258" r="44"/><circle cx="390" cy="246" r="56"/></g>
    <rect x="68" y="180" width="284" height="9" rx="4.5" fill="#2a4433"/><rect x="90" y="189" width="7" height="22" rx="3" fill="#22382a"/><rect x="323" y="189" width="7" height="22" rx="3" fill="#22382a"/>`);
  const wave = add(s, `<path class="wv" fill="none" stroke="#9be36d" stroke-width="2" stroke-linecap="round" opacity=".5"/>`).querySelector(".wv");
  const a = add(s, spiritSvg(128, 180, 1.05, "#9be36d")), b = add(s, spiritSvg(208, 180, 1.05, "#0AFFFB"));
  const cWrap = add(s, `<g class="cw">${spiritSvg(288, 180, 1.05, "#f2a3bb")}</g>`).querySelector(".cw");
  const linkChip = add(s, `<g class="lk" opacity="0"><rect width="86" height="22" rx="11" fill="#1d3a28"/><text x="12" y="15" font-size="9" fill="#a9c4b2">invite link</text></g>`).querySelector(".lk");
  const addCard = add(s, `<g class="ac" opacity="0"><rect width="118" height="26" rx="13" fill="#22362a"/><circle cx="13" cy="13" r="7" fill="#f2a3bb"/><text x="25" y="16.5" font-size="9" fill="#eaf5ec">Yuki added a song</text></g>`).querySelector(".ac");
  ctx.tick((time) => {
    let d = "M80 124";
    for (let x = 80; x <= 340; x += 6) d += ` L${x} ${124 + Math.sin((x / 30) - time * (Math.PI / beat)) * 5 * Math.sin(((x - 80) / 260) * Math.PI)}`;
    wave.setAttribute("d", d);
  });
  if (still) return;
  ctx.tl(notes(s, 140, 136, "#9be36d", 1.1)); ctx.tl(notes(s, 220, 136, "#0AFFFB", 1.3));
  [a, b].forEach((g) => { ctx.tl(bob(g.querySelector(".bd"))); ctx.tl(blink(g.querySelector(".eyes"))); });
  const cBody = cWrap.querySelector(".bd"); ctx.tl(blink(cWrap.querySelector(".eyes")));
  // The newcomer grooves along once seated; this tween is restarted on every round.
  let cBob = null;
  ctx.tl(gsap.timeline({ repeat: -1, repeatDelay: 1 }))
    .set(cWrap, { x: 190, opacity: 0 }).set(linkChip, { x: 80, y: 74, opacity: 0, scale: 0.6, transformOrigin: "50% 50%" })
    .to(linkChip, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(2)" })
    .to(linkChip, { x: 380, y: 50, duration: 1.2, ease: "power2.in" }, "+=0.4")
    .to(linkChip, { opacity: 0, duration: 0.5 }, "-=0.5")
    .set(cWrap, { opacity: 1 })
    .to(cWrap, { x: 0, duration: 1.4, ease: "power1.inOut" })
    .to(cWrap, { keyframes: { y: [0, -22, 0, -16, 0, -9, 0] }, duration: 1.4, ease: "none" }, "<")
    .call(() => { cBob = bob(cBody); })
    .set(addCard, { x: 246, y: 112, opacity: 0, scale: 0.7, transformOrigin: "50% 50%" }, "+=1")
    .to(addCard, { opacity: 1, scale: 1, y: 100, duration: 0.45, ease: "back.out(2)" })
    .to(addCard, { x: 150, y: 52, duration: 1, ease: "power3.inOut" }, "+=1.2")
    .to(addCard, { opacity: 0, duration: 0.3 }, "+=0.8")
    .to({}, { duration: 2.5 })
    .call(() => { if (cBob) cBob.kill(); gsap.set(cBody, { y: 0, scaleX: 1, scaleY: 1 }); })
    .to(cWrap, { opacity: 0, duration: 0.4 });
}

const SCENES = { lyrics, overlay, together };
document.querySelectorAll("svg[data-scene]").forEach((svg) => {
  const build = SCENES[svg.dataset.scene];
  if (build) scene(svg, build);
});
