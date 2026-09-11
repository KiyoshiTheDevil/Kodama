// What the host actually does when an extension calls.
//
// Assembled here and handed to the bridge, never imported by it. The bridge decides what MAY be
// called; this decides what happens, and keeping the two apart is what lets the rules be tested
// without an app around them.
//
// Every value that leaves is a copy, and every value is read at the moment it is asked for.
// Handing over a live object, or a value cached at mount, are the two ways a bridge stops being
// one: the first gives the extension a handle into Kodama, the second gives it a lie.
import { storageImpl, BridgeError } from "./bridge.js";
import { readTheme } from "../theme.js";

const SAFE_CSS = /^[#0-9a-zA-Z(),.%\s-]{1,60}$/;

/**
 * The current look, resolved rather than named.
 *
 * A theme id would tell an extension nothing: with themes installed from the store, the id is a
 * word it has never heard. Resolved values are the only answer that works for every theme,
 * including one published after the extension was written.
 */
export function appearanceImpl() {
  return {
    "appearance.get": () => {
      const root = document.documentElement;
      const cs = getComputedStyle(root);
      // Filtered on the way out. These are read from a stylesheet a theme can write, and they are
      // about to be set as CSS in another document: a value that is not a colour has no business
      // making that trip.
      const read = (name) => {
        const v = cs.getPropertyValue(name).trim();
        return SAFE_CSS.test(v) ? v : "";
      };
      return {
        theme: readTheme(),
        mode: root.getAttribute("data-mode") === "light" ? "light" : "dark",
        language: (() => { try { return localStorage.getItem("kiyoshi-lang") || "de"; } catch { return "de"; } })(),
        fontScale: (() => { try { return parseFloat(localStorage.getItem("kiyoshi-font-scale")) || 1; } catch { return 1; } })(),
        colors: {
          accent:        read("--accent"),
          bgBase:        read("--bg-base"),
          bgElevated:    read("--bg-elevated"),
          bgHover:       read("--bg-hover"),
          border:        read("--border"),
          textPrimary:   read("--text-primary"),
          textSecondary: read("--text-secondary"),
          textMuted:     read("--text-muted"),
        },
      };
    },
  };
}

/** Kodama's own toasts, for an extension that has asked to use them. */
export function toastImpl(addToast) {
  return {
    "ui.toast": ({ text, kind }, manifest) => {
      const s = String(text ?? "").slice(0, 200);
      if (!s) throw new BridgeError("empty", "nothing to show");
      // Signed with the extension's name. Kodama's toasts speak for Kodama, and one that came from
      // an extension, above all one running out of sight, must not borrow that voice.
      const who = manifest?.name ? `${manifest.name}: ` : "";
      addToast(who + s, kind === "error" || kind === "success" ? kind : "info");
      return true;
    },
  };
}

/**
 * What is playing, as a plain copy.
 *
 * Read from the store the player feeds, at the moment of asking, with the position taken from the
 * audio clock itself: the store rounds it to whole seconds, and a scrobbler deciding whether half
 * a song has passed should not be a second out.
 */
export function nowPlaying(snapshot, audio) {
  const tr = snapshot?.track;
  if (!snapshot?.hasTrack || !tr) return null;
  const album = typeof tr.album === "string" ? tr.album : (tr.album?.name || "");
  const pos = typeof audio?.currentTime === "number" ? audio.currentTime : snapshot.position;
  return {
    videoId: String(tr.videoId || ""),
    title: String(snapshot.title || ""),
    artists: String(snapshot.artists || ""),
    album: String(album || ""),
    duration: Number(snapshot.duration) || 0,
    position: Math.max(0, Math.round((Number(pos) || 0) * 10) / 10),
    isPlaying: !!snapshot.isPlaying,
  };
}

export function nowPlayingImpl(getSnapshot, getAudio) {
  return { "player.get": () => nowPlaying(getSnapshot(), getAudio?.()) };
}

/** Transport, through the same handlers Big Picture and the media keys use. */
export function playbackImpl(send, getSnapshot) {
  const ensure = (want) => {
    const s = getSnapshot();
    if (s?.hasTrack && !!s.isPlaying !== want) send("playpause");
    return true;
  };
  return {
    "player.play":     () => ensure(true),
    "player.pause":    () => ensure(false),
    "player.next":     () => { send("next"); return true; },
    "player.previous": () => { send("prev"); return true; },
  };
}

// ─── The network, for an extension that declared where it goes ────────────────
//
// Through Tauri's HTTP plugin, not the webview's fetch. Kodama's own CSP lists the handful of hosts
// Kodama talks to, and an extension's hosts are not among them, so a webview fetch would be refused
// before it left. The plugin makes the request from Rust, outside that policy. The rule about
// WHERE is still enforced, by the bridge, against the hosts the manifest declared; this only
// decides how a permitted request is made and what comes back.
const NET_METHODS = new Set(["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]);
// Headers that would let a request speak as someone else, or that the transport owns.
const NET_HEADERS_BLOCKED = new Set(["cookie", "host", "origin", "referer", "connection", "content-length", "proxy-authorization"]);
export const NET_BODY_MAX = 256 * 1024;
export const NET_RESPONSE_MAX = 1024 * 1024;
const NET_TIMEOUT_MS = 15000;

export function netImpl(doFetch) {
  return {
    "net.fetch": async ({ url, init }) => {
      const method = String(init?.method || "GET").toUpperCase();
      if (!NET_METHODS.has(method)) throw new BridgeError("bad_request", `method ${method} is not allowed`);
      const headers = {};
      for (const [k, v] of Object.entries(init?.headers && typeof init.headers === "object" ? init.headers : {}).slice(0, 20)) {
        const name = String(k).toLowerCase();
        if (NET_HEADERS_BLOCKED.has(name) || !/^[a-z0-9-]{1,64}$/.test(name)) continue;
        headers[name] = String(v).slice(0, 2048);
      }
      let body;
      if (init?.body !== undefined && init?.body !== null) {
        if (typeof init.body !== "string") throw new BridgeError("bad_request", "body must be a string");
        if (init.body.length > NET_BODY_MAX) throw new BridgeError("too_large", "request body is too large");
        body = init.body;
      }
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), NET_TIMEOUT_MS);
      try {
        // No redirects followed. A redirect is a second request to a host the bridge never saw,
        // and following it would turn the allowlist into a list of places to start from.
        const r = await doFetch(url, { method, headers, body, signal: ctrl.signal, maxRedirections: 0 });
        const text = method === "HEAD" ? "" : await r.text();
        if (text.length > NET_RESPONSE_MAX) throw new BridgeError("too_large", "response is too large");
        return { status: r.status, ok: r.ok, contentType: r.headers.get("content-type") || "", body: text };
      } catch (e) {
        if (e instanceof BridgeError) throw e;
        throw new BridgeError(ctrl.signal.aborted ? "timeout" : "network", ctrl.signal.aborted ? "the request timed out" : "the request failed");
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/**
 * The set a first-party extension gets.
 *
 * Assembled from the same pieces anyone would get. What makes it first-party is which permissions
 * the manifest was allowed to ask for, not a different set of implementations behind them.
 */
export function hostImpl({ addToast } = {}) {
  return {
    ...storageImpl(
      (k) => { try { return localStorage.getItem(k); } catch { return null; } },
      (k, v) => { try { localStorage.setItem(k, v); } catch { throw new BridgeError("storage", "storage is full"); } },
    ),
    ...appearanceImpl(),
    ...(addToast ? toastImpl(addToast) : {}),
  };
}
