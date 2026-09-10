/**
 * A window that hosts one extension.
 *
 * Kodama draws the chrome and the extension fills the rest. That division is the reason the
 * Composer needed no fork: the custom titlebar it used to carry, with its own Tauri window
 * controls and the capability file that granted them, exists here instead, once, for every
 * extension that will ever be framed.
 *
 * One window label rather than one per extension, because Tauri capabilities are matched on the
 * label and are static: a label per extension would mean editing capabilities/default.json every
 * time one is added, and forgetting would produce a window that cannot be dragged.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { IconContext } from "../icons.jsx";
import { translate } from "../i18n.js";
import { applyFontScale, readFontScale } from "../settings/scale.js";
import { applyTheme, readTheme } from "../theme.js";
import { WindowControls } from "../ui/window-chrome.jsx";
import { builtinExtension } from "./builtin.js";
import { mountExtension } from "./host.js";
import { hostImpl } from "./impl.js";

export default function ExtensionApp({ id }) {
  // Own window, own document: the type scale every var(--tNN) reads is written at runtime by
  // whichever entry point mounts, and App does not mount here. The theme is the same story.
  applyFontScale(readFontScale());
  applyTheme(readTheme());

  const manifest = builtinExtension(id);
  const host = useRef(null);
  const [problem, setProblem] = useState(null);
  const [language] = useState(() => { try { return localStorage.getItem("kiyoshi-lang") || "de"; } catch { return "de"; } });
  const t = useCallback((key, vars) => translate(language, key, vars), [language]);

  useEffect(() => {
    import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke("remove_window_border_for", { label: "extension" }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!manifest || !host.current) return;
    const mounted = mountExtension({
      container: host.current,
      manifest,
      impl: hostImpl(),
      onError: (msg) => setProblem(String(msg)),
    });
    // Torn down on unmount rather than left running. A frame that is merely hidden goes on
    // working, which this app has measured the cost of once already.
    return () => mounted.destroy();
  }, [manifest]);

  return (
    <IconContext.Provider value={{ weight: "bold" }}>
      <div className="relative flex h-screen flex-col overflow-hidden" style={{ background: "var(--bg-base)" }}>
        {/* No bar of Kodama's own. The extension already draws one, and two stacked headers is
            what a framed app looks like when the host insists on its own chrome.
            
            The window buttons float over the extension's header instead, in space the extension
            reserves for them: the bootstrap sets a padding on its <header>, which is why they do
            not land on top of anything.
            
            Dragging cannot work the same way. A Tauri drag region belongs to a webview and a
            frame is not one, so the extension forwards the gesture over the bridge instead. That
            is what window:drag is, and it is why the permission exists. */}
        <div className="absolute right-0 top-0 z-10 flex items-center pr-3"
          style={{ height: 52 }} data-tauri-drag-region>
          <WindowControls />
        </div>

        {manifest ? (
          <div ref={host} className="min-h-0 flex-1" />
        ) : (
          // An id nothing answers to. Said plainly rather than left as an empty window: this is
          // reachable only from Kodama's own code, so it means a mistake in Kodama.
          <div className="flex flex-1 items-center justify-center text-[length:var(--t12)] text-muted"
            data-tauri-drag-region>
            {t("extensionUnknown", { id })}
          </div>
        )}

        {problem && (
          <div className="shrink-0 border-t border-border px-4 py-2 text-[length:var(--t11)] text-muted">
            {problem}
          </div>
        )}
      </div>
    </IconContext.Provider>
  );
}
