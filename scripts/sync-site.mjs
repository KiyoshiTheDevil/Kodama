// Copies the app code the website reuses into docs/js/vendor/, so the store's previews are drawn
// by the same code as in the app. Run after changing those files:  node scripts/sync-site.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const FILES = [
  ["src/visualizer/draw.js", "docs/js/vendor/viz-draw.js"],
  ["src/visualizer/defaults.js", "docs/js/vendor/viz-defaults.js"],
];
mkdirSync("docs/js/vendor", { recursive: true });
for (const [from, to] of FILES) {
  const src = readFileSync(from, "utf8");
  if (/^\s*import\s/m.test(src)) throw new Error(`${from} imports other modules; the website cannot load it as is`);
  writeFileSync(to, `// Copied from ${from} by scripts/sync-site.mjs. Do not edit here.\n\n` + src);
  console.log(`${from} -> ${to}`);
}
