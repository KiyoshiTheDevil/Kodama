import { useCallback, useEffect, useRef, useState } from "react";

import { API } from "../../shared/api/client.js";
import { compareVersions } from "../../shared/lib/version.js";

const APP_VERSION = __APP_VERSION__;

// Published news feed (edit + commit updates/news.json in the public Kodama repo).
const NEWS_URL =
  "https://raw.githubusercontent.com/KiyoshiTheDevil/Kodama/master/updates/news.json";

// Anonymous active-user heartbeat endpoint (Cloudflare Worker, see analytics/).
// Leave "" until the Worker is deployed — the heartbeat no-ops while empty.
// NOTE: when set, add this host to CSP connect-src in index.html + tauri.conf.json.
const STATS_URL = "https://kodama-stats.kiyoshidesign.workers.dev";

async function _sha256Hex(str) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Anonymous, opt-out active-user heartbeat. Fires at most once per UTC day per
// install. The raw install id never leaves the device — only a daily/monthly
// rotating SHA-256 token is sent, so the server can count unique actives without
// being able to reverse the token or link a device across days. See analytics/.
async function sendHeartbeat() {
  try {
    if (!STATS_URL) return; // not configured yet
    if (localStorage.getItem("kodama-anon-stats") === "false") return; // opted out
    const day = new Date().toISOString().slice(0, 10);
    const month = day.slice(0, 7);
    if (localStorage.getItem("kodama-hb-day") === day) return; // already pinged today
    let id = localStorage.getItem("kodama-install-id");
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem("kodama-install-id", id);
    }
    const [d, m] = await Promise.all([_sha256Hex(`${id}:${day}`), _sha256Hex(`${id}:${month}`)]);
    await fetch(`${STATS_URL}/ping`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ d, m, v: APP_VERSION }),
    });
    localStorage.setItem("kodama-hb-day", day); // only mark sent on success
  } catch {
    /* analytics is best-effort — never disturb the app */
  }
}

/**
 * News feed + anonymous heartbeat. Owns the remote/backend feed fetch with
 * version filtering, the 15-minute refresh + focus re-check timers, seen-state
 * persistence, and the important-news auto-open. Returns explicit state/actions;
 * the App renders NewsModal and the sidebar badge against them unchanged.
 */
export function useNews() {
  const [newsItems, setNewsItems] = useState([]);
  const [newsSeenIds, setNewsSeenIds] = useState(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem("kiyoshi-news-seen") || "[]"));
    } catch {
      return new Set();
    }
  });
  const [newsOpen, setNewsOpen] = useState(false);
  const [newsUnreadSnapshot, setNewsUnreadSnapshot] = useState(() => new Set());

  const lastNewsLoadRef = useRef(0);
  const loadNews = useCallback(async () => {
    lastNewsLoadRef.current = Date.now();
    // Prefer the remote feed (live publishing); fall back to the backend's bundled copy
    // (dev/offline) so news still shows when the remote isn't reachable.
    let items = null;
    try {
      const r = await fetch(NEWS_URL, { cache: "no-cache" });
      if (r.ok) items = await r.json();
    } catch { /* intentionally ignored */ }
    if (!Array.isArray(items) || items.length === 0) {
      try {
        const r2 = await fetch(`${API}/news`);
        if (r2.ok) items = await r2.json();
      } catch { /* intentionally ignored */ }
    }
    if (!Array.isArray(items)) return;
    // Keep only entries whose version range covers this build (min_version / max_version).
    setNewsItems(
      items.filter(
        (n) =>
          n &&
          n.id &&
          (!n.min_version || compareVersions(APP_VERSION, n.min_version) >= 0) &&
          (!n.max_version || compareVersions(APP_VERSION, n.max_version) <= 0)
      )
    );
  }, []);

  useEffect(() => {
    loadNews();
    sendHeartbeat(); // anonymous, opt-out, at most once/day — see analytics/
    // Re-check periodically + when the window regains focus, so newly published news shows up
    // without restarting the app (the raw GitHub feed is CDN-cached ~5 min anyway).
    const interval = setInterval(loadNews, 15 * 60 * 1000);
    const onFocus = () => {
      if (Date.now() - lastNewsLoadRef.current > 5 * 60 * 1000) loadNews();
    };
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [loadNews]);

  const newsUnreadCount = newsItems.reduce((n, it) => n + (newsSeenIds.has(it.id) ? 0 : 1), 0);

  const openNews = useCallback(() => {
    setNewsUnreadSnapshot(
      new Set(newsItems.filter((it) => !newsSeenIds.has(it.id)).map((it) => it.id))
    );
    setNewsOpen(true);
    const allIds = newsItems.map((it) => it.id);
    setNewsSeenIds(new Set(allIds));
    localStorage.setItem("kiyoshi-news-seen", JSON.stringify(allIds));
  }, [newsItems, newsSeenIds]);

  // Auto-open once on startup if there's an unread entry flagged important.
  const newsAutoOpenedRef = useRef(false);
  useEffect(() => {
    if (newsAutoOpenedRef.current || !newsItems.length) return;
    const importantUnread = newsItems.some((it) => it.important && !newsSeenIds.has(it.id));
    if (importantUnread) {
      newsAutoOpenedRef.current = true;
      openNews();
    }
  }, [newsItems]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    newsItems,
    newsOpen,
    setNewsOpen,
    newsUnreadSnapshot,
    newsUnreadCount,
    loadNews,
    openNews,
  };
}
