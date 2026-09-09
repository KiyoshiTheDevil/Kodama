import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

/**
 * Open the store, or focus it if it is already up.
 *
 * NOTE: the label must also appear in src-tauri/capabilities/default.json. Capabilities are
 * matched per window label, and a window missing from that list gets no permissions at all,
 * which shows up as a window that cannot be dragged or closed. That has caught this project
 * twice already.
 */
export async function openStoreWindow() {
  try {
    const existing = await WebviewWindow.getByLabel("store");
    if (existing) { await existing.setFocus(); return; }
    new WebviewWindow("store", {
      url: "/?store=1",
      title: "Store — Kodama",
      width: 1000,
      height: 680,
      minWidth: 820,
      minHeight: 540,
      resizable: true,
      center: true,
      decorations: false,
    });
  } catch { /* not running in Tauri */ }
}
