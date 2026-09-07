// Applying the colour theme to a document.
//
// Setting `data-theme` alone is not enough. HeroUI ships its own token set and scopes it like
// this:
//
//   light: :root, .light, .default, [data-theme=light], [data-theme=default]
//   dark:  .dark, [data-theme=dark]
//
// Every theme of ours whose name is not literally "dark" therefore misses the dark selector and
// falls through to `:root` — which is HeroUI's LIGHT set. Kodama's own --surface-* tokens are
// correct in that state, so anything styled with those looks right and only the components that
// use HeroUI's own tokens turn white: in the OLED theme the Unison identity card (a CardRoot
// with no bg- class of its own) rendered as a white block with white text on it.
//
// The `dark` class is what HeroUI actually looks for, so we set it for every theme except the
// light one. That also covers any theme added later without anyone having to remember this.
//
// Kept as a shared helper because the theme is applied from several places — the main window on
// mount and on change, and each of the separate windows, which have their own documents.
export function applyTheme(theme) {
  const t = theme || "dark";
  const root = document.documentElement;
  root.setAttribute("data-theme", t);
  root.classList.toggle("dark", t !== "light");
  // Applied from here so it reaches every window without a second thing to remember, the way
  // the `dark` class above does. The corner shape is deliberately not a theme name: it has to
  // combine with whichever colours are in use, or it could not be tested in them.
  applyShape();
  return t;
}

/** Whether corners are squared off. An experiment, see the block in index.css. */
export function readShape() {
  try {
    return localStorage.getItem("kiyoshi-sharp-corners") === "true" ? "sharp" : "round";
  } catch {
    return "round";
  }
}

export function applyShape(shape) {
  const s = shape || readShape();
  document.documentElement.setAttribute("data-shape", s);
  return s;
}

/** The stored theme, for windows that only read it. */
export function readTheme() {
  try {
    return localStorage.getItem("kiyoshi-theme") || "dark";
  } catch {
    return "dark";
  }
}
