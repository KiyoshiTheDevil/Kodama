/**
 * Standalone entry point for the store window. Loaded when ?store=1, so it never starts the full
 * App: a second App in another window would start a second audio pipeline.
 *
 * Unlike the Overlay Editor and the equaliser, this one does NOT take the tool accent. Those are
 * design surfaces where the listener's own colour would hide the selection inside their artwork.
 * A shop for colours is the opposite case: a fixed blue sitting among the swatches would read as
 * one more theme rather than as chrome.
 */
import { useCallback, useEffect, useState } from "react";
import { IconContext } from "../icons.jsx";
import { translate } from "../i18n.js";
import { applyFontScale, readFontScale } from "../settings/scale.js";
import { applyTheme, readTheme } from "../theme.js";
import Store from "./Store.jsx";

export default function StoreApp() {
  // Own window, own document: the type scale that every var(--tNN) reads is written at runtime by
  // whichever entry point mounts, and App does not mount here. The theme is the same story, and a
  // window that sets none at all leaves HeroUI on its light token set.
  applyFontScale(readFontScale());
  applyTheme(readTheme());

  // Strip the Windows 11 accent border from this borderless window.
  useEffect(() => {
    import("@tauri-apps/api/core")
      .then(({ invoke }) => invoke("remove_window_border_for", { label: "store" }))
      .catch(() => {});
  }, []);

  const [language] = useState(() => localStorage.getItem("kiyoshi-lang") || "de");
  const t = useCallback((key, vars) => translate(language, key, vars), [language]);

  return (
    <IconContext.Provider value={{ weight: "bold" }}>
      <Store t={t} />
    </IconContext.Provider>
  );
}
