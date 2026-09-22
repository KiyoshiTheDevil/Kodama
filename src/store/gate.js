// When the store is reachable.
//
// Built in alpha.38 behind a closed door, so the window, the catalogue and the install path got
// real use from the people building it first. Opened in alpha.40 rather than waiting for Beta:
// the store is one component with its own BETA badge, the way the overlay editor carries one in
// an alpha app, and the Composer, taken out of Kodama in alpha.38, only comes back through it.
//
// The gate is on the VERSION rather than on a setting, because a setting is something a listener
// can turn on by accident and then report a half-built shop as broken. Kodama's own version is the
// one fact that cannot be got wrong here.
import { APP_VERSION } from "../version.js";
import { compareVersions } from "./catalogue.js";

/** The release that opens the store. compareVersions already ranks alpha below beta below none. */
export const STORE_OPENS_AT = "1.0.0-alpha.40";

/**
 * Two doors stay open before that: a dev build, and a build where the debug tools were unlocked
 * by hand. Both take a deliberate act, neither ships open, and without them the store could not
 * be tested in the alpha that carries it.
 */
export function storeIsOpen() {
  if (import.meta.env.DEV) return true;
  try {
    if (localStorage.getItem("kiyoshi-debug-unlocked") === "true") return true;
  } catch { /* storage unavailable: fall through to the version */ }
  return compareVersions(APP_VERSION, STORE_OPENS_AT) >= 0;
}
