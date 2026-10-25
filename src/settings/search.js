// Search over the settings (title bar search while they are open). The index of rows, sections
// and tabs is generated from the source (scripts/settings-index.mjs); the labels are translated
// here, so the search runs in the language the app is shown in.
import { SETTINGS_INDEX } from "./search-index.js";

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");

// t: key → text. Returns up to `limit` hits, best first: label starts with the query, then
// label contains it, then the description or the place it lives in does. tAlt, if given, is
// the English text: many know a setting by its English name ("crossfade") whatever the UI says.
export function searchSettings(q, t, { debugUnlocked = false, limit = 8, tAlt = null } = {}) {
  const query = norm(q.trim());
  if (!query) return [];
  const text = (e, key) => (e.lit ? key : (t(key) || key));
  const tabName = {}, secName = {};
  for (const e of SETTINGS_INDEX) {
    if (e.s === 2) tabName[e.tab] = text(e, e.k);
    else if (e.s === 1 && e.sec && !secName[e.sec]) secName[e.sec] = text(e, e.k);
  }
  const hits = [];
  for (const e of SETTINGS_INDEX) {
    if (e.tab === "debug" && !debugUnlocked) continue;
    const label = text(e, e.k);
    const desc = e.d ? t(e.d) : "";
    const place = [tabName[e.tab], e.sec && secName[e.sec] !== label ? secName[e.sec] : null].filter(Boolean);
    const l = norm(label);
    const alt = tAlt && !e.lit ? norm(tAlt(e.k)) : "";
    let score = 0;
    if (l.startsWith(query)) score = 4;
    else if (l.includes(query)) score = 3;
    else if (alt && alt.includes(query)) score = 3;
    else if (norm(desc).includes(query)) score = 2;
    else if (norm(place.join(" ")).includes(query)) score = 1;
    if (!score) continue;
    // A row beats the section or tab of the same name.
    hits.push({ e, label, sub: e.s === 2 ? "" : place.join(" › "), score: score * 10 - (e.s || 0) });
  }
  hits.sort((a, b) => b.score - a.score);
  const seen = new Set();
  return hits.filter((h) => {
    const id = `${h.label}|${h.e.tab}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  }).slice(0, limit);
}

// Draws the eye to the row that was looked for, once it is on screen. Matched by the start of
// its label: some labels carry a badge after the text ("Remote control Beta").
export function flashSetting(label) {
  const want = norm(label);
  const rows = [...document.querySelectorAll(".setting-row")];
  const row = rows.find((r) => norm(r.querySelector(".font-medium")?.textContent).startsWith(want));
  if (!row) return false;
  row.scrollIntoView({ behavior: "smooth", block: "center" });
  // Web Animations rather than a class: React re-renders the row as the tab settles and sets
  // its className back, which wiped an added class before it could show.
  row.animate([
    { background: "var(--accent-dim)", boxShadow: "inset 0 0 0 1px var(--accent)" },
    { background: "var(--accent-dim)", boxShadow: "inset 0 0 0 1px var(--accent)", offset: 0.3 },
    { background: "transparent", boxShadow: "inset 0 0 0 1px transparent" },
  ], { duration: 1600, easing: "ease-out" });
  return true;
}
