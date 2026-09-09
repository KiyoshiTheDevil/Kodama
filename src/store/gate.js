// When the store is reachable.
//
// It is built now and opens at Beta. Shipping the code in an alpha while leaving the door shut is
// deliberate: the window, the catalogue and the install path all get real use and real bug reports
// from the people building it, without an unfinished shop being the first thing a listener finds.
//
// The gate is on the VERSION rather than on a setting, because a setting is something a listener
// can turn on by accident and then report a half-built shop as broken. Kodama's own version is the
// one fact that cannot be got wrong here.
import { APP_VERSION } from "../version.js";
import { compareVersions } from "../theme-catalogue.js";

/** The release that opens the store. compareVersions already ranks alpha below beta below none. */
export const STORE_OPENS_AT = "1.0.0-beta.1";

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
