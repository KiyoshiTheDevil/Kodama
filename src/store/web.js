// The store lives on the website now (kodama.kiyoshi.dev/store/, docs/store in this repo). The
// app keeps what is installed and the detail page an entry opens on; finding things is the
// website's job.
//
// The website links back with kodama://store/<kind>/<id>. Such a link carries nothing but an id:
// the store window looks it up in the official catalogue (CATALOGUE_URL), so a link can never
// bring in anything that is not published there.
import { openUrl } from "@tauri-apps/plugin-opener";

export const STORE_WEB_URL = "https://kodama.kiyoshi.dev/store/";
export const STORE_LINK_KINDS = ["themes", "visualizer", "equalizer", "widgets", "extensions"];

/** The store website, optionally at one category (one of STORE_LINK_KINDS). */
export function openStoreWeb(kind) {
  const url = kind ? `${STORE_WEB_URL}?c=${encodeURIComponent(kind)}` : STORE_WEB_URL;
  return openUrl(url).catch(() => {});
}

/** kodama://store/<kind>/<id> as { kind, id }, or null for anything else. */
export function parseStoreLink(url) {
  const m = /^kodama:\/\/store\/([a-z]+)\/([A-Za-z0-9][A-Za-z0-9._-]{0,79})\/?$/.exec(String(url || "").trim());
  if (!m || !STORE_LINK_KINDS.includes(m[1])) return null;
  return { kind: m[1], id: m[2] };
}

/** Sent to an open store window when a link arrives for it. */
export const STORE_OPEN_ENTRY = "kodama://store-open-entry";
