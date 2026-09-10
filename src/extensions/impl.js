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

/**
 * Moving the window the extension is framed in.
 *
 * Handed over as an ACTION rather than as the window object, like everything else here. The
 * extension says "the listener began dragging my header" and Kodama decides what that means; it
 * never holds anything it could call setPosition or close on.
 */
export function windowImpl() {
  return {
    "window.drag": async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().startDragging();
      return true;
    },
  };
}

/** Kodama's own toasts, for an extension that has asked to use them. */
export function toastImpl(addToast) {
  return {
    "ui.toast": ({ text, kind }) => {
      const s = String(text ?? "").slice(0, 200);
      if (!s) throw new BridgeError("empty", "nothing to show");
      addToast(s, kind === "error" || kind === "success" ? kind : "info");
      return true;
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
    ...windowImpl(),
    ...(addToast ? toastImpl(addToast) : {}),
  };
}
