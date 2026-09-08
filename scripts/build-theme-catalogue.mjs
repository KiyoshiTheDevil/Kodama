// Writes updates/themes.json from the themes the app actually ships.
//
// Generated rather than hand-kept, because the two would drift the first time someone edited a
// colour in one and not the other - and the failure would be silent: the store would offer a
// Grove that no longer looks like the Grove in the app.
//
// Descriptions and tags live here, not in themes.js. They are catalogue copy, not part of what
// a theme IS, and the app never reads them for a built-in theme.
//
//   node scripts/build-theme-catalogue.mjs
import { writeFileSync } from "node:fs";
import { BUILTIN_THEMES } from "../src/themes.js";

// The build in which a theme first became installable. Written out rather than read from
// tauri.conf.json: that file holds the version being WORKED ON, and using it would stamp every
// theme with whatever release happened to be current when the file was regenerated. An older
// build has no installer to receive a theme, and saying otherwise would offer it an Install
// button that does nothing. Raise this only if the format changes in a way an older build
// cannot read.
const THEMES_AS_DATA_SINCE = "1.0.0-alpha.38";

const COPY = {
  dark:  { description: "Kodama's own dark grey.", tags: ["dark", "default"] },
  oled:  { description: "True black, for panels that switch a pixel off.", tags: ["dark", "oled"] },
  light: { description: "For a bright room.", tags: ["light"] },
  grove: { description: "Moss instead of neutral grey, and warm gold against it.", tags: ["dark", "green"] },
};

const catalogue = {
  schema: 1,
  generated: new Date().toISOString().slice(0, 10),
  // dark is left out: it is :root itself, so there is nothing to install and its entry
  // would carry an empty token map that every consumer would have to special-case.
  themes: BUILTIN_THEMES.filter(t => t.id !== "dark").map(t => ({
    id: t.id,
    title: t.id.charAt(0).toUpperCase() + t.id.slice(1),
    description: COPY[t.id]?.description || "",
    creators: ["KiyoshiTheDevil"],
    version: "1.0.0",
    minVersion: THEMES_AS_DATA_SINCE,
    mode: t.mode,
    tags: COPY[t.id]?.tags || [],
    // The preview swatches, so the store can draw a card without fetching anything else. Taken
    // from the theme's own values, with the dark defaults standing in for whatever it leaves to
    // :root - which is exactly what the running app would show.
    preview: {
      bg:       t.tokens["--bg-base"]     || "#0d0d0d",
      surface:  t.tokens["--bg-surface"]  || "#141414",
      elevated: t.tokens["--bg-elevated"] || "#1c1c1c",
      text:     t.tokens["--t1"]          || "rgba(255,255,255,0.886)",
      accent:   t.tokens["--accent"]      || "#e040fb",
    },
    tokens: t.tokens,
  })),
};

const out = new URL("../updates/themes.json", import.meta.url);
writeFileSync(out, JSON.stringify(catalogue, null, 2) + "\n", "utf8");
console.log(`updates/themes.json: ${catalogue.themes.length} themes, minVersion ${THEMES_AS_DATA_SINCE}`);
