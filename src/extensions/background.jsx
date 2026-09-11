// Running the "background" extensions: mounted out of sight in the main window, for as long as it
// is open.
//
// The main window because that is where the player is. What these extensions are for is reacting
// to playback, and the store the player feeds (bigpicture/playerBridge.js) only exists in this
// window's JavaScript; anywhere else would mean relaying every change over Tauri's event bus to
// learn what this window already knows.
//
// Each one gets the same sandboxed frame a panel gets, only never shown. Out of sight is not out
// of reach of the rules: the bridge, the permission checks and the error limit are the ones in
// host.js, unchanged.
import { useEffect, useRef } from "react";
import { mountExtension } from "./host.js";
import { hostImpl, nowPlaying, nowPlayingImpl, playbackImpl, netImpl } from "./impl.js";
import { installedExtensions, extensionCode, onExtensionsChanged } from "./registry.js";
import { getNowPlaying, subscribeNowPlaying, getAudio, sendPlayerCommand } from "../bigpicture/playerBridge.js";

/** Fired on window by the Settings page when it changes a value it drew for an extension. */
export const EXTENSION_SETTINGS_EVENT = "kodama-extension-setting";

// Through Tauri's HTTP plugin, see netImpl. Imported on first use so a window that never runs an
// extension never loads it.
const pluginFetch = async (url, init) => (await import("@tauri-apps/plugin-http")).fetch(url, init);

export default function BackgroundExtensions({ addToast }) {
  const hostRef = useRef(null);
  // A ref, so the effect below mounts once rather than tearing every extension down whenever the
  // App hands over a new toast function.
  const toastRef = useRef(addToast);
  useEffect(() => { toastRef.current = addToast; }, [addToast]);

  useEffect(() => {
    const container = hostRef.current;
    if (!container) return;
    const impl = {
      ...hostImpl({ addToast: (text, kind) => toastRef.current?.(text, kind) }),
      ...nowPlayingImpl(getNowPlaying, getAudio),
      ...playbackImpl(sendPlayerCommand, getNowPlaying),
      ...netImpl(pluginFetch),
    };
    const running = new Map();   // id -> { handle, version, box }

    const stopOne = (id) => {
      const r = running.get(id);
      if (!r) return;
      r.handle.destroy();
      r.box.remove();
      running.delete(id);
    };

    // Brought in line with what is installed: removed ones stopped, updated ones restarted, new
    // ones started. Called on mount and whenever any window installs or removes an extension.
    const sync = () => {
      const wanted = installedExtensions().filter(m => m.kind === "background");
      for (const [id, r] of running) {
        if (!wanted.some(m => m.id === id && m.version === r.version)) stopOne(id);
      }
      for (const m of wanted) {
        if (running.has(m.id)) continue;
        const code = extensionCode(m.id);
        if (!code) continue;   // installed by a build that did not keep code: reinstalling fixes it
        const box = document.createElement("div");
        container.appendChild(box);
        const handle = mountExtension({
          container: box, manifest: m, code, impl,
          // Into the console, which is what a bug report carries. A background extension has no
          // surface to show an error on, and toasting every one would make its failures Kodama's.
          onError: (msg) => console.warn(`[extension ${m.id}]`, msg),
        });
        running.set(m.id, { handle, version: m.version, box });
        // Where things stand right now, so it does not have to wait for the next change to know.
        const np = nowPlaying(getNowPlaying(), getAudio());
        box.firstChild?.addEventListener("load", () => handle.emit("player.changed", np), { once: true });
      }
    };

    sync();
    const offExtensions = onExtensionsChanged(sync);

    // The store changes on every progress tick. Only a different track or a start or stop is news.
    let last = "";
    const offPlayer = subscribeNowPlaying(() => {
      const np = nowPlaying(getNowPlaying(), getAudio());
      const sig = `${np?.videoId || ""}|${np?.isPlaying ? 1 : 0}`;
      if (sig === last) return;
      last = sig;
      for (const r of running.values()) r.handle.emit("player.changed", np);
    });

    const onSetting = (e) => {
      const r = running.get(e.detail?.id);
      r?.handle.emit("settings.changed", { key: String(e.detail?.key || "") });
    };
    window.addEventListener(EXTENSION_SETTINGS_EVENT, onSetting);

    return () => {
      offExtensions();
      offPlayer();
      window.removeEventListener(EXTENSION_SETTINGS_EVENT, onSetting);
      for (const id of [...running.keys()]) stopOne(id);
    };
  }, []);

  // Not display:none. A frame that is not rendered may be throttled or never load; this one is laid
  // out, at no size, where nobody can see or reach it.
  return (
    <div ref={hostRef} aria-hidden="true"
      style={{ position: "fixed", left: 0, top: 0, width: 0, height: 0, overflow: "hidden", pointerEvents: "none" }} />
  );
}
