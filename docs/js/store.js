// The Kodama store on the web. Reads the published catalogue (the kodama-store repo) and the
// download counts and ratings from the stats Worker; everything else is drawn here.
//
// URL: store/            the categories
//      store/?c=themes   one category, as a grid with the selected entry beside it
//      store/?c=themes&id=grove, store/?id=grove, store/?q=dark
//
// "Add to Kodama" is a kodama://store/<kind>/<id> link. It carries nothing but the id: the app
// looks the entry up in the same official catalogue, so a link can never bring in anything that
// is not published there. Themes and presets install at once; an extension opens its page in the
// app first, so its permissions are seen before it is installed.
import { drawSpectrum } from "./vendor/viz-draw.js";
import { VIZ_DEFAULTS } from "./vendor/viz-defaults.js";

const CATALOGUE = "https://raw.githubusercontent.com/KiyoshiTheDevil/kodama-store/main/index.json";
const STATS = "https://kodama-stats.kiyoshidesign.workers.dev";
const MIN_RATINGS = 3;           // same as the app (src/store/ratings.js)
const NEEDS_APP = "1.0.0-alpha.42";  // the first Kodama that opens store links
const EQ_RANGE_DB = 12;          // src/equalizer/presets.js

const KINDS = [
  { key: "themes", title: "Themes", one: "Theme" },
  { key: "visualizer", title: "Visualizer presets", one: "Visualizer preset" },
  { key: "equalizer", title: "Equalizer presets", one: "Equalizer preset" },
  { key: "widgets", title: "Overlay designs", one: "Overlay design" },
  { key: "extensions", title: "Extensions", one: "Extension" },
];
const PERMISSIONS = {
  nowplaying: "Sees what is playing",
  storage: "Keeps its own settings",
  network: "Connects to the internet",
  notifications: "Shows notifications",
  files: "Opens and saves files you pick",
  appearance: "Follows Kodama's look",
  audio: "Plays audio",
};

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const app = $("#store");

let cat = null, counts = {}, ratings = {};

async function load() {
  try {
    const [c, n, r] = await Promise.all([
      fetch(CATALOGUE, { cache: "no-cache" }).then((x) => x.json()),
      fetch(STATS + "/store/counts").then((x) => x.json()).catch(() => ({})),
      fetch(STATS + "/store/ratings").then((x) => x.json()).catch(() => ({})),
    ]);
    cat = c; counts = n.counts || {}; ratings = r.ratings || {};
    for (const k of KINDS) for (const e of cat[k.key] || []) e._kind = k.key;
    render();
  } catch {
    app.innerHTML = `<div class="empty"><kodama-spirit pose="sad" size="80"></kodama-spirit>
      <p>The store could not be loaded. Try again in a moment.</p></div>`;
  }
}

const all = () => KINDS.flatMap((k) => cat[k.key] || []);
const params = () => new URLSearchParams(location.search);
function go(p, push = true) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v) q.set(k, v);
  const url = location.pathname + (q.toString() ? "?" + q : "");
  if (push) history.pushState(null, "", url); else history.replaceState(null, "", url);
  render();
}
window.addEventListener("popstate", render);

// ── Previews ────────────────────────────────────────────────────────────
function themePreview(e) {
  const p = e.preview || {}, t = e.tokens || {};
  const bg = p.bg || t["--bg-base"], side = p.surface || t["--bg-surface"], card = p.elevated || t["--bg-elevated"];
  const text = p.text || "#fff", acc = p.accent || t["--accent"] || "#9be36d";
  return `<div style="position:absolute;inset:0;background:${bg}">
    <div style="position:absolute;left:0;top:0;bottom:0;width:24%;background:${side}"></div>
    <div style="position:absolute;left:5%;top:14%;width:13%;height:5%;border-radius:4px;background:${text};opacity:.5"></div>
    <div style="position:absolute;left:5%;top:26%;width:11%;height:5%;border-radius:4px;background:${acc}"></div>
    <div style="position:absolute;left:5%;top:38%;width:12%;height:5%;border-radius:4px;background:${text};opacity:.3"></div>
    <div style="position:absolute;left:30%;top:14%;width:28%;height:44%;border-radius:10px;background:${card}"></div>
    <div style="position:absolute;left:63%;top:14%;width:28%;height:44%;border-radius:10px;background:${card}"></div>
    <div style="position:absolute;left:30%;top:66%;width:40%;height:6%;border-radius:4px;background:${text};opacity:.6"></div>
    <div style="position:absolute;left:30%;bottom:9%;width:61%;height:5%;border-radius:4px;background:${text};opacity:.15"></div>
    <div style="position:absolute;left:30%;bottom:9%;width:26%;height:5%;border-radius:4px;background:${acc}"></div>
  </div>`;
}
function eqPreview(e) {
  const g = (e.config && e.config.gains) || [];
  const bars = Array.from({ length: 10 }, (_, i) => {
    const v = Number(g[i]) || 0, h = Math.max(2, (Math.abs(v) / EQ_RANGE_DB) * 42);
    return `<div style="position:relative;flex:1"><div style="position:absolute;left:0;right:0;border-radius:3px;height:${h}%;${v >= 0 ? "bottom:50%" : "top:50%"};background:${v >= 0 ? "var(--accent)" : "var(--t3)"};opacity:${v === 0 ? 0.3 : 1}"></div></div>`;
  }).join("");
  return `<div style="position:absolute;inset:10% 8%;display:flex;gap:5%">${bars}</div>
    <div style="position:absolute;left:8%;right:8%;top:50%;height:1px;background:rgba(255,255,255,.12)"></div>`;
}
function extPreview(e) {
  const icon = e.icon ? `<img src="${esc(e.icon)}" alt="" style="width:46%;height:46%;object-fit:contain">`
    : `<span style="font-size:28px;font-weight:600">${esc((e.title || "?").slice(0, 2))}</span>`;
  return `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 40%,#22362a,#0a120d)">${icon}</div>`;
}
function widgetPreview() {
  return `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center"><kodama-spirit pose="idle" size="56"></kodama-spirit></div>`;
}
function previewHtml(e) {
  if (e._kind === "themes") return themePreview(e);
  if (e._kind === "equalizer") return eqPreview(e);
  if (e._kind === "extensions") return extPreview(e);
  if (e._kind === "widgets") return widgetPreview(e);
  return `<canvas data-viz="${esc(e.id)}" style="position:absolute;inset:0;width:100%;height:100%"></canvas>`;
}
// The visualizer draws itself from a fixed pattern, like the app's store preview
// (src/store/preset-views.jsx), so two presets can be compared.
function drawViz(cv, e) {
  const c = { ...VIZ_DEFAULTS, ...(e.config || {}) };
  const W = cv.clientWidth, H = cv.clientHeight, dpr = Math.min(2, devicePixelRatio || 1);
  if (!W || !H) return;
  cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  const ctx = cv.getContext("2d");
  const COVER = 200, reach = (Number(c.gap) || 0) + 4 + (Number(c.barLength) || 0) + 8;
  const linear = c.shape === "linear", centred = linear && (c.linearPos || "bottom") === "center";
  const needH = linear ? (centred ? Math.max(COVER, 2 * reach) + 16 : reach + 48) : COVER + 2 * reach;
  const needW = linear ? 0 : COVER + 2 * reach;
  const scale = Math.min(H / needH, needW ? W / needW : Infinity) * 0.92;
  const w = W / scale, h = H / scale;
  ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
  const box = { x: (w - COVER) / 2, y: (h - COVER) / 2, w: COVER, h: COVER };
  if (!linear || centred) {
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    ctx.beginPath();
    if (c.coverShape === "circle") ctx.arc(box.x + COVER / 2, box.y + COVER / 2, COVER / 2, 0, Math.PI * 2);
    else if (ctx.roundRect) ctx.roundRect(box.x, box.y, COVER, COVER, 14); else ctx.rect(box.x, box.y, COVER, COVER);
    ctx.fill();
  }
  const n = Math.max(8, Math.round(Number(c.barCount) || 48)), ring = c.shape === "ring";
  const fl = Number(c.floor) || 0, ce = c.ceiling != null ? Number(c.ceiling) : 1, rng = Math.max(0.02, ce - fl);
  const raw = Array.from({ length: n }, (_, i) => {
    const x = ring ? i / n : i / Math.max(1, n - 1);
    const v = Math.min(1, 0.22 + 0.5 * Math.abs(Math.sin(x * Math.PI * (ring ? 3 : 2.4))) + 0.2 * Math.abs(Math.sin(x * Math.PI * 9)));
    return Math.max(0, Math.min(1, (v - fl) / rng));
  });
  const sbr = Math.round((Number(c.smoothBands) || 0) * 8);
  const vals = sbr > 0 ? raw.map((_, i) => {
    let s = 0, ws = 0;
    for (let k = -sbr; k <= sbr; k++) { const j = i + k; if (j < 0 || j >= n) continue; const wk = 1 - Math.abs(k) / (sbr + 1); s += raw[j] * wk; ws += wk; }
    return s / ws;
  }) : raw;
  const peaks = c.peakHold ? vals.map((v) => Math.min(1, v + 0.12)) : null;
  const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#9be36d";
  drawSpectrum(ctx, { w, h, box, cfg: c, n, vals, peaks, baseCol: c.color === "custom" ? (c.customColor || accent) : accent, minWidth: 1 / scale });
}
function paintCanvases() {
  for (const cv of app.querySelectorAll("canvas[data-viz]")) {
    const e = all().find((x) => x.id === cv.dataset.viz);
    if (e) drawViz(cv, e);
  }
}
window.addEventListener("resize", () => cat && paintCanvases());

// ── Numbers ─────────────────────────────────────────────────────────────
const rating = (id) => { const r = ratings[id]; return r && r.count >= MIN_RATINGS ? r : null; };
const fmtAvg = (r) => r.avg.toFixed(1).replace(/\.0$/, "");

// ── Views ───────────────────────────────────────────────────────────────
function home() {
  const n = (k) => (cat[k] || []).length;
  const tile = (k, cls, art) => {
    const K = KINDS.find((x) => x.key === k);
    return `<a class="cat ${cls}" href="?c=${k}" data-c="${k}"><h3>${K.title}</h3>
      <span class="n">${n(k) ? n(k) + (n(k) === 1 ? " entry" : " entries") : "Coming soon"}</span>${art}</a>`;
  };
  const themes = (cat.themes || []).slice(0, 4).map((e) => `<div style="position:relative;height:62px;border-radius:12px;overflow:hidden">${themePreview(e)}</div>`).join("");
  const firstEq = (cat.equalizer || [])[0], firstViz = (cat.visualizer || [])[0];
  const exts = (cat.extensions || []).slice(0, 3).map((e) => `<div style="position:relative;width:46px;height:46px;border-radius:14px;overflow:hidden">${extPreview(e)}</div>`).join("");
  app.innerHTML = `
    <div class="cats">
      ${tile("themes", "tall", `<div class="art" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${themes}</div>`)}
      ${tile("visualizer", "", firstViz ? `<div class="art" style="height:86px;position:relative"><canvas data-viz="${esc(firstViz.id)}" style="position:absolute;inset:0;width:100%;height:100%"></canvas></div>` : "")}
      ${tile("equalizer", "", firstEq ? `<div class="art" style="height:70px;position:relative">${eqPreview(firstEq)}</div>` : "")}
      ${tile("widgets", "", n("widgets") ? "" : `<kodama-spirit pose="sleep" size="64"></kodama-spirit>`)}
      ${tile("extensions", "", `<div class="art" style="display:flex;gap:8px">${exts}</div>`)}
    </div>`;
  app.querySelectorAll(".cat").forEach((a, i) => {
    a.classList.add("enter"); a.style.animationDelay = `${i * 0.05}s`;
    a.addEventListener("click", (ev) => { ev.preventDefault(); go({ c: a.dataset.c }); });
  });
  paintCanvases();
}

function card(e, on) {
  const r = rating(e.id);
  return `<button class="card${on ? " on" : ""}" data-id="${esc(e.id)}">
    <div class="pv">${previewHtml(e)}</div>
    <div class="t"><span>${esc(e.title)}</span>${r ? `<span class="r">★ ${fmtAvg(r)}</span>` : ""}</div>
    <div class="d">${esc(KINDS.find((k) => k.key === e._kind).one)}${(e.creators || []).length ? " · " + esc(e.creators.join(", ")) : ""}</div>
  </button>`;
}

function detail(e) {
  const K = KINDS.find((k) => k.key === e._kind);
  const r = rating(e.id), n = counts[e.id];
  const perms = e._kind === "extensions" && (e.permissions || []).length
    ? `<div class="perm"><h4>What it can do</h4><ul>${e.permissions.map((p) => `<li>${esc(PERMISSIONS[p] || p)}</li>`).join("")}
       ${(e.hosts || []).map((h) => `<li>Talks to ${esc(h)}</li>`).join("")}</ul></div>` : "";
  return `<div class="detail">
    <span class="peekbox"><kodama-spirit pose="peek" size="58"></kodama-spirit></span>
    <div class="big">${previewHtml(e)}</div>
    <div class="row">
      <div><h2>${esc(e.title)}</h2><div class="by">${esc(K.one)}${(e.creators || []).length ? " by " + esc(e.creators.join(", ")) : ""}</div></div>
      <a class="btn primary small" id="open" href="kodama://store/${e._kind}/${encodeURIComponent(e.id)}">Add to Kodama</a>
    </div>
    ${e.description ? `<p class="desc">${esc(e.description)}</p>` : ""}
    ${(e.tags || []).length ? `<div class="tags">${e.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>` : ""}
    <div class="facts">
      <div class="fact"><small>Version</small><b>${esc(e.version || "–")}</b></div>
      <div class="fact"><small>Rating</small><b>${r ? `★ ${fmtAvg(r)} <span class="muted" style="font-weight:400">(${r.count})</span>` : "Not enough yet"}</b></div>
      <div class="fact"><small>Downloads</small><b>${n != null ? n : "–"}</b></div>
    </div>
    ${perms}
    <p class="hint" id="hint" hidden>Nothing happened? Store links need Kodama ${esc(NEEDS_APP)} or newer${e.minVersion ? `, this one ${esc(e.minVersion)} at least` : ""}. <a href="../">Get Kodama</a></p>
  </div>`;
}

function browse(kind, id, q) {
  let list = kind ? (cat[kind] || []) : all();
  if (q) {
    const s = q.toLowerCase();
    list = list.filter((e) => [e.title, e.description, ...(e.tags || []), ...(e.creators || [])].join(" ").toLowerCase().includes(s));
  }
  const sel = list.find((e) => e.id === id) || list[0];
  const chips = `<div class="chips"><button class="chip${!kind ? " on" : ""}" data-c="all">All</button>${KINDS.map((k) =>
    `<button class="chip${kind === k.key ? " on" : ""}" data-c="${k.key}">${k.title}</button>`).join("")}</div>`;
  const body = !list.length
    ? `<div class="empty">${q
        ? `<kodama-spirit pose="search" size="76"></kodama-spirit><p>Nothing matches “${esc(q)}”.</p>`
        : `<kodama-spirit pose="sleep" size="76"></kodama-spirit><p>Nothing here yet.</p>`}</div>`
    : `<div class="browse"><div class="grid">${list.map((e) => card(e, e === sel)).join("")}</div>${detail(sel)}</div>`;
  app.innerHTML = `<a class="back" href="./">← All categories</a>${chips}${body}`;
  // The cards come in one after another.
  app.querySelectorAll(".card").forEach((c, i) => { c.classList.add("enter"); c.style.animationDelay = `${Math.min(i, 12) * 0.045}s`; });
  $(".back", app).addEventListener("click", (ev) => { ev.preventDefault(); go({}); });
  app.querySelectorAll(".chip").forEach((b) => b.addEventListener("click", () => go({ c: b.dataset.c, q })));
  app.querySelectorAll(".card").forEach((b) => b.addEventListener("click", () => {
    select(b.dataset.id, kind, q);
    if (innerWidth < 900) $(".detail", app).scrollIntoView({ behavior: "smooth", block: "start" });
  }));
  wireOpen();
  paintCanvases();
}

// Picking another card swaps only the detail, which fades in; the grid stays as it is.
function select(id, kind, q) {
  const e = all().find((x) => x.id === id);
  const old = $(".detail", app);
  if (!e || !old) return;
  const p = new URLSearchParams();
  if (kind) p.set("c", kind); if (q) p.set("q", q); p.set("id", id);
  history.replaceState(null, "", location.pathname + "?" + p);
  app.querySelectorAll(".card").forEach((c) => c.classList.toggle("on", c.dataset.id === id));
  const tmp = document.createElement("div");
  tmp.innerHTML = detail(e);
  const nd = tmp.firstElementChild;
  nd.classList.add("swap-in");
  old.replaceWith(nd);
  wireOpen();
  paintCanvases();
}

function wireOpen() {
  const open = $("#open", app);
  if (open) open.addEventListener("click", () => {
    // A registered app takes the focus away from the page. If the page keeps it, there is most
    // likely no Kodama (or too old a one) to take the link.
    let left = false;
    const onBlur = () => { left = true; };
    window.addEventListener("blur", onBlur, { once: true });
    setTimeout(() => { window.removeEventListener("blur", onBlur); if (!left) $("#hint", app).hidden = false; }, 1600);
  });
}

function render() {
  if (!cat) return;
  const p = params(), q = p.get("q") || "", id = p.get("id");
  let c = p.get("c");
  if (id && !c) c = (all().find((e) => e.id === id) || {})._kind;
  const box = $("#q");
  if (box && box.value !== q) box.value = q;
  if (!c && !q && !id) home(); else browse(c === "all" ? null : c, id, q);
}

const box = $("#q");
let t = 0;
box.addEventListener("input", () => {
  clearTimeout(t);
  t = setTimeout(() => go({ c: params().get("c"), q: box.value.trim() }, false), 180);
});
load();
