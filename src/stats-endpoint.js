// The anonymous statistics Worker (Cloudflare, see analytics/). One address for every window that
// talks to it: the main window's daily heartbeat and the store's download counts.
// NOTE: this host is in CSP connect-src in index.html + tauri.conf.json; change both with it.
export const STATS_URL = "https://kodama-stats.kiyoshidesign.workers.dev";

/** The listener's own switch for all of it. Off means nothing is sent, from anywhere. */
export function anonStatsAllowed() {
  try {
    return localStorage.getItem("kodama-anon-stats") !== "false";
  } catch {
    return false;
  }
}
