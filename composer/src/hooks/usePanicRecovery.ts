import { useEffect } from "react";
import { downloadRecoveryFile } from "@/lib/recovery";
import { findMatchingShortcut } from "@/utils/shortcut-matcher";

// -- Constants ----------------------------------------------------------------

const LOG_PREFIX = "[PanicRecovery]";
const SHORTCUT_ID = "global.panicRecovery";

// -- Hook ---------------------------------------------------------------------

// Registers a window-level keydown listener for the panic recovery shortcut.
// Reads the binding from the shortcut registry so users can remap it via
// Settings → Shortcuts. Bypasses the normal `useGlobalShortcuts` pipeline on
// purpose so it still fires when modals are open or the rest of the app is in
// a weird state. Does NOT help when the main thread is fully frozen; for that
// case the user must open /recover in a fresh tab. Documented in the help
// modal's Recovery section.
function usePanicRecovery(): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.repeat) return;
      const matched = findMatchingShortcut(event, "global");
      if (matched !== SHORTCUT_ID) return;
      event.preventDefault();
      downloadRecoveryFile().catch((err) => {
        console.error(LOG_PREFIX, "recovery download failed", err);
      });
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
}

// -- Exports ------------------------------------------------------------------

export { usePanicRecovery };
