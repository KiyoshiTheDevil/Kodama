import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { installedExtension } from "./registry.js";

/** One window label for every extension, see the note in ExtensionApp. */
export const EXTENSION_LABEL = "extension";

/**
 * Open an extension in its own window, or focus the one that is already up.
 *
 * A second extension replaces the first rather than opening beside it, because the label is
 * shared. That is a limit worth naming: it is fine while these are heavyweight tools someone uses
 * one at a time, and it is the thing to revisit when that stops being true.
 *
 * NOTE: the label must appear in src-tauri/capabilities/default.json. Capabilities are matched per
 * label, and a window missing from that list gets no permissions at all, which shows up as a
 * window that cannot be dragged or closed. That has caught this project three times.
 */
export async function openExtensionWindow(id, context = null) {
  const manifest = installedExtension(id);
  if (!manifest) return;
  try {
    const existing = await WebviewWindow.getByLabel(EXTENSION_LABEL);
    if (existing) { await existing.setFocus(); return; }
    // The subject travels in the URL of Kodama's own window, and ExtensionApp hands it to the
    // frame. Not stored anywhere: it is true for this opening and nothing else.
    const track = context?.track ? `&track=${encodeURIComponent(context.track)}` : "";
    new WebviewWindow(EXTENSION_LABEL, {
      url: `/?extension=${encodeURIComponent(id)}${track}`,
      title: `${manifest.name} — Kodama`,
      width: 1280,
      height: 860,
      minWidth: 900,
      minHeight: 600,
      resizable: true,
      center: true,
      decorations: false,
    });
  } catch { /* not running in Tauri */ }
}
