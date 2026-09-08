// The themes, as data.
//
// A theme used to be three pieces of code: a block in index.css, an entry in a hardcoded array
// and a translation key. None of those can be delivered by anything but a new build, which is
// the whole reason this file exists - Grove turned out to be thirteen values, and thirteen
// values are data, not code. That puts a theme on the same side of the line as a visualizer or
// equalizer preset: something the app reads and applies, with no way to execute anything.
//
// Each entry lists only what it CHANGES. :root in index.css is the ground everything stands on,
// which is why "dark" is empty - dark IS :root - and why Grove needs thirteen lines rather than
// eighty-two. The strokes, the fill states and the text ladder are white at fixed opacities and
// sit correctly on any ground of roughly the same darkness, so a theme that does not mention
// them inherits them and stays short.
//
// `mode` says light or dark, and it has to be said rather than guessed from the name. HeroUI
// ships its own token set scoped to `.dark` / `[data-theme=dark]` and falls back to its LIGHT
// set for any other name, which has already produced white text on a white card once. A theme
// arriving from outside has a name nobody can pattern-match, so it declares which it is.

export const BUILTIN_THEMES = [
  // Dark is the ground itself: everything it would set is already in :root.
  { id: "dark",  mode: "dark",  tokens: {} },

  {
    id: "oled", mode: "dark", tokens: {
      "--bg-base":        "#000000",
      "--bg-surface":     "#080808",
      "--bg-elevated":    "#0f0f0f",
      "--bg-hover":       "#141414",
      "--surface-1":      "#0f0f0f",
      "--surface-2":      "#181818",
      "--surface-3":      "#212121",
      "--acrylic":        "rgba(0, 0, 0, 0.88)",
      "--stroke":         "rgba(255,255,255,0.060)",
      "--stroke-dim":     "rgba(255,255,255,0.036)",
      "--stroke-med":     "rgba(255,255,255,0.110)",
      "--border":         "var(--stroke)",
      "--t1":             "rgba(255,255,255,1.000)",
      "--t2":             "rgba(255,255,255,0.500)",
      "--t3":             "rgba(255,255,255,0.330)",
      "--t4":             "rgba(255,255,255,0.160)",
      "--text-primary":   "var(--t1)",
      "--text-secondary": "var(--t2)",
      "--text-muted":     "var(--t3)",
      "--slider-track":   "#282828",
    },
  },

  {
    id: "light", mode: "light", tokens: {
      "--bg-base":            "#f0f0f0",
      "--bg-surface":         "#ffffff",
      "--bg-elevated":        "#e8e8e8",
      "--bg-hover":           "#dcdcdc",
      "--surface-1":          "#f7f7f7",
      "--surface-2":          "#ededed",
      "--surface-3":          "#e2e2e2",
      "--acrylic":            "rgba(240, 240, 240, 0.88)",
      "--stroke":             "rgba(0,0,0,0.09)",
      "--stroke-dim":         "rgba(0,0,0,0.055)",
      "--stroke-med":         "rgba(0,0,0,0.150)",
      "--border":             "var(--stroke)",
      "--fill-subtle":        "rgba(0,0,0,0.040)",
      "--fill-mod":           "rgba(0,0,0,0.070)",
      "--fill-strong":        "rgba(0,0,0,0.110)",
      "--t1":                 "rgba(0,0,0,0.900)",
      "--t2":                 "rgba(0,0,0,0.560)",
      "--t3":                 "rgba(0,0,0,0.380)",
      "--t4":                 "rgba(0,0,0,0.200)",
      "--text-primary":       "var(--t1)",
      "--text-secondary":     "var(--t2)",
      "--text-muted":         "var(--t3)",
      "--slider-track":       "#b8b8b8",
      "--status-danger":      "#d32f2f",
      "--status-success":     "#2e7d32",
      "--status-warning":     "#b26a00",
      "--status-info":        "#1565c0",
      "--elevation-1":        "0 2px 8px rgba(0,0,0,0.10)",
      "--elevation-2":        "0 4px 14px rgba(0,0,0,0.14)",
      "--elevation-3":        "0 10px 24px rgba(0,0,0,0.20)",
      "--elevation-4":        "0 18px 48px rgba(0,0,0,0.26)",
      "--elevation-5":        "0 28px 70px rgba(0,0,0,0.32)",
      "--scroll-thumb":       "#bbbbbb",
      "--scroll-thumb-dim":   "#d4d4d4",
      "--scroll-thumb-hover": "#888888",
    },
  },

  {
    id: "grove", mode: "dark", tokens: {
      "--bg-base":            "#0e1410",
      "--bg-surface":         "#141c17",
      "--bg-elevated":        "#1b241e",
      "--bg-hover":           "#222d25",
      "--surface-1":          "#1b241e",
      "--surface-2":          "#2a352d",
      "--surface-3":          "#35423a",
      "--acrylic":            "rgba(14, 20, 16, 0.84)",
      "--slider-track":       "#2a352d",
      "--scroll-thumb":       "#2f3b33",
      "--scroll-thumb-dim":   "#232e27",
      "--scroll-thumb-hover": "#5d6f64",
      "--accent":             "#d8a657",
    },
  },

];

// ─── Themes from outside the build ───────────────────────────────────────────
//
// Nothing installs one yet; the format is here so that when something does, it arrives through
// a gate rather than being invented at that moment.
//
// The gate is on the VALUE. A custom property cannot execute anything by itself, so the risk is
// not the name - an unknown one is simply read by nobody - but what a value can smuggle: a `}`
// ends the rule and lets the rest of the string become selectors of its own, `url()` fetches
// from wherever it likes, and `@import` pulls in a whole stylesheet. A theme is a list of
// colours and lengths; none of those need any of it.
const NAME_OK = /^--[a-z0-9-]+$/;
const VALUE_BAD = /[{};@]|url\s*\(|expression\s*\(/i;

export function sanitizeTokens(tokens) {
  const out = {};
  if (!tokens || typeof tokens !== "object") return out;
  for (const [name, value] of Object.entries(tokens)) {
    if (!NAME_OK.test(name)) continue;
    if (typeof value !== "string" || !value.trim()) continue;
    if (value.length > 200 || VALUE_BAD.test(value)) continue;
    out[name] = value.trim();
  }
  return out;
}

const INSTALLED_KEY = "kodama-installed-themes";

/** Themes installed at runtime. Sanitised on the way out, never on trust. */
export function readInstalledThemes() {
  try {
    const raw = JSON.parse(localStorage.getItem(INSTALLED_KEY) || "[]");
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(t => t && typeof t.id === "string" && /^[\w-]{1,64}$/.test(t.id))
      .map(t => ({
        id: t.id,
        label: typeof t.label === "string" ? t.label.slice(0, 40) : t.id,
        mode: t.mode === "light" ? "light" : "dark",
        // Kept so the catalogue can tell an installed copy from a newer published one.
        version: typeof t.version === "string" ? t.version.slice(0, 24) : "",
        tokens: sanitizeTokens(t.tokens),
      }));
  } catch { return []; }
}

/**
 * Replace the installed set. Written through the same shape the reader expects, so a value that
 * would not survive being read back never gets stored in the first place.
 */
export function writeInstalledThemes(list) {
  try {
    const safe = (Array.isArray(list) ? list : [])
      .filter(t => t && typeof t.id === "string" && /^[\w-]{1,64}$/.test(t.id))
      .map(t => ({
        id: t.id,
        label: typeof t.label === "string" ? t.label.slice(0, 40) : t.id,
        mode: t.mode === "light" ? "light" : "dark",
        version: typeof t.version === "string" ? t.version.slice(0, 24) : "",
        tokens: sanitizeTokens(t.tokens),
      }));
    localStorage.setItem(INSTALLED_KEY, JSON.stringify(safe));
    return true;
  } catch {
    return false;
  }
}

/**
 * Every theme that can be chosen right now, built in or installed, each id appearing once.
 *
 * An installed copy REPLACES a built-in one of the same id rather than sitting beside it. That
 * is not only tidiness: it is how a theme gets fixed without a release. If a shipped theme turns
 * out to have a bad value, the catalogue can publish a higher version of it and the app takes
 * that one. The built-in order is kept so the picker does not reshuffle itself, and installed
 * themes with no built-in counterpart follow at the end.
 */
export function allThemes() {
  const installed = readInstalledThemes();
  const byId = new Map(installed.map(t => [t.id, t]));
  const merged = BUILTIN_THEMES.map(b => byId.get(b.id) || b);
  const builtinIds = new Set(BUILTIN_THEMES.map(b => b.id));
  return [...merged, ...installed.filter(t => !builtinIds.has(t.id))];
}

export function findTheme(id) {
  return allThemes().find(t => t.id === id) || BUILTIN_THEMES[0];
}

/** The declarations for one theme, as the body of a CSS rule. */
export function tokensToCss(tokens) {
  return Object.entries(tokens).map(([k, v]) => `${k}:${v}`).join(";");
}
