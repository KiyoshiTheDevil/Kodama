// Stepped values for the zoom and font-size sliders
export const ZOOM_STEPS      = [0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5];
export const ZOOM_LABELS     = ["80%", "90%", "100%", "110%", "120%", "130%", "140%", "150%"];
export const FONT_STEPS      = [0.85, 0.93, 1.0, 1.10, 1.20, 1.35, 1.50];
export const FONT_LABELS     = FONT_STEPS.map(s => `${Math.round(13 * s)}px`);

// The type scale is not in the stylesheet: because the app has a font-size setting, --t10 …
// --t22 are written onto the document at runtime, and every text-t* utility reads them.
//
// That makes them per-document, and Kodama has more than one. The overlay editor and the mini
// player are separate windows where App never mounts, so none of the variables existed there
// and every text-t* class silently fell back to the inherited size -- the editor's whole
// typography was effectively one size, and changing a text-t13 to text-t18 did nothing at all.
// Each window entry point calls this for itself.
//
// Tailwind's OWN scale (text-xs ... text-2xl) is scaled too, in index.css, via --font-scale
// below. HeroUI sizes all of its text with those, so without it every dropdown, modal and
// button in the app ignored the font-size setting entirely.
export const CSS_FONT_SIZES = [10, 11, 12, 13, 14, 15, 16, 18, 20, 22];

export function readFontScale() {
  const saved = parseFloat(localStorage.getItem("kiyoshi-font-scale"));
  return FONT_STEPS.includes(saved) ? saved : 1.0;
}

export function applyFontScale(scale = 1) {
  CSS_FONT_SIZES.forEach((n) => {
    document.documentElement.style.setProperty(`--t${n}`, `${Math.round(n * scale)}px`);
  });
  // The factor itself, for Tailwind's own scale. Those sizes have to stay expressed in the rem
  // values Tailwind ships and be multiplied — mapping them onto --tNN instead looks equivalent
  // but is not, because the root font size here is 14px, so Tailwind's text-sm is 12.25px and
  // not the nominal 14. Pointing it at --t14 quietly made every dropdown and modal 14% bigger.
  document.documentElement.style.setProperty("--font-scale", String(scale));
  return scale;
}
