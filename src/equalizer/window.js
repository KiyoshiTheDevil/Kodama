import { WebviewWindow } from "@tauri-apps/api/webviewWindow";

/**
 * Open the equaliser window, or focus it if it is already up. Shared by the player dropdown
 * and the playback settings, so the two cannot drift into opening it with different sizes.
 *
 * NOTE: the label must also appear in src-tauri/capabilities/default.json. Capabilities are
 * matched per window label, and a window missing from that list gets no permissions at all —
 * which looks like a window that simply cannot be dragged.
 */
export async function openEqualizerWindow() {
  try {
    const existing = await WebviewWindow.getByLabel("equalizer");
    if (existing) { await existing.setFocus(); return; }
    new WebviewWindow("equalizer", {
      url: "/?equalizer=1",
      title: "Equalizer — Kodama",
      width: 1100,
      height: 620,
      minWidth: 900,
      minHeight: 560,
      resizable: true,
      center: true,
      decorations: false,
    });
  } catch { /* not running in Tauri */ }
}
