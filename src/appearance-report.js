// What Kodama looks like right now, for a bug report.
//
// Since themes can be installed, a report that says "the text is unreadable" or "this button is in
// the wrong place" may not be about Kodama at all. Until now nothing in a report said which theme
// was on, so the first reply to every visual report would have to be a question.
//
// The theme is the reason this exists, but it is not the only switch that moves the picture: high
// contrast rewrites colours, sharp corners rewrites the whole radius scale, and the two size
// settings change what fits on a row. All of them are the usual suspects behind a screenshot that
// looks wrong, and asking about them one at a time is exactly the round trip this avoids.
import { readInstalledThemes } from "./themes.js";

const get = (key, fallback = null) => {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
};

/**
 * A flat, human-readable snapshot. Values rather than ids where the id would mean nothing to
 * whoever reads the report: "Nord 1.0.0 (store)" says more than "nord".
 */
export function appearanceSnapshot() {
  const theme = get("kiyoshi-theme", "dark");
  const installed = readInstalledThemes().find(t => t.id === theme);
  const zoom = parseFloat(get("kiyoshi-ui-zoom", "1")) || 1;
  const font = parseFloat(get("kiyoshi-font-scale", "1")) || 1;
  return {
    // "(store)" is the part that matters: it says the look is not Kodama's own, so a visual
    // report can be aimed at the theme before anyone goes looking through the app for it.
    theme: installed
      ? `${installed.label || theme} ${installed.version || "?"} (store)`
      : theme,
    themeId: theme,
    fromStore: !!installed,
    highContrast: get("kiyoshi-high-contrast") === "true",
    sharpCorners: get("kiyoshi-sharp-corners") === "true",
    rtl: get("kiyoshi-rtl-layout") === "true",
    uiZoom: zoom,
    fontScale: font,
  };
}

/** The same thing as short chips, for the line of tags under the report form. */
export function appearanceChips(snap = appearanceSnapshot()) {
  const c = [snap.theme];
  if (snap.highContrast) c.push("high contrast");
  if (snap.sharpCorners) c.push("sharp corners");
  if (snap.rtl) c.push("RTL");
  // Only when moved: every report carrying "zoom 100%" would be noise in the one place where a
  // chip is meant to stand out.
  if (snap.uiZoom !== 1) c.push(`zoom ${Math.round(snap.uiZoom * 100)}%`);
  if (snap.fontScale !== 1) c.push(`font ${Math.round(snap.fontScale * 100)}%`);
  return c;
}
