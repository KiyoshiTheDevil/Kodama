/**
 * Mini player ↔ main window plumbing.
 *
 * The mini player is a real Tauri window, so it gets its own JS context — the in-process
 * store in bigpicture/playerBridge.js cannot reach it (that one only works because Big
 * Picture is rendered inside the main window's React root).
 *
 * State goes out as a broadcast event. Commands come back on "media-control", the very
 * channel the OS media keys already use (src-tauri/src/media.rs → App.jsx), so the main
 * window needs no extra transport logic for the mini player at all.
 *
 * Position is sent as a timestamped anchor rather than a stream: the receiver knows the
 * position, when it was measured, and whether the clock is running, and interpolates the
 * rest locally. That keeps this at roughly one message per second instead of one per
 * progress tick.
 */

export const MINI_LABEL = "mini-player";
export const EV_NOW_PLAYING = "kodama-now-playing";
export const EV_HELLO = "kodama-mini-hello";
export const EV_SHOW_MAIN = "kodama-show-main";

// Square by design: the cover art is the window, controls only surface on hover. The window
// is resizable but stays 1:1 — Tauri has no aspect-ratio lock, so MiniPlayerApp corrects the
// odd dimension on every resize. MIN/MAX are what the hover layout still reads well at.
const SIZE = 240;
export const MINI_MIN = 180;
export const MINI_MAX = 460;
export const MINI_SIZE_KEY = "kodama-mini-size";

export async function emitNowPlaying(payload) {
  try {
    const { emit } = await import("@tauri-apps/api/event");
    await emit(EV_NOW_PLAYING, payload);
  } catch {}
}

/** Ask the main window to re-send the current state (used when the mini player mounts). */
export async function sayHello() {
  try {
    const { emitTo } = await import("@tauri-apps/api/event");
    await emitTo("main", EV_HELLO, {});
  } catch {}
}

/** Drive playback from the mini player. Rides the existing OS-media-key channel. */
export async function sendToMain(action, extra = {}) {
  try {
    const { emitTo } = await import("@tauri-apps/api/event");
    await emitTo("main", "media-control", { action, ...extra });
  } catch {}
}

/**
 * Bring the main window back out of the tray. Asking it to show itself is deliberate —
 * a window may only be revealed from its own context here, and it keeps the mini player
 * free of any window-management permissions beyond closing itself.
 */
export async function requestShowMain() {
  try {
    const { emitTo } = await import("@tauri-apps/api/event");
    await emitTo("main", EV_SHOW_MAIN, {});
  } catch {}
}

export async function openMiniPlayer() {
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const existing = await WebviewWindow.getByLabel(MINI_LABEL);
  if (existing) {
    await existing.setFocus();
    return existing;
  }

  // Reopen at whatever size it was left at.
  const saved = parseInt(localStorage.getItem(MINI_SIZE_KEY) || "", 10);
  const size = Number.isFinite(saved) ? Math.min(MINI_MAX, Math.max(MINI_MIN, saved)) : SIZE;

  // Park it in the lower-right corner of the monitor the app is on. Best-effort — if the
  // monitor query fails we simply let Tauri place the window.
  let pos = {};
  try {
    const { currentMonitor } = await import("@tauri-apps/api/window");
    const m = await currentMonitor();
    if (m) {
      const s = m.scaleFactor || 1;
      pos = {
        x: Math.round(m.position.x / s + m.size.width / s - size - 24),
        y: Math.round(m.position.y / s + m.size.height / s - size - 72),
      };
    }
  } catch {}

  const win = new WebviewWindow(MINI_LABEL, {
    url: "/?miniPlayer=1",
    title: "Kodama",
    width: size,
    height: size,
    minWidth: MINI_MIN,
    minHeight: MINI_MIN,
    maxWidth: MINI_MAX,
    maxHeight: MINI_MAX,
    resizable: true,
    decorations: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    ...pos,
  });

  // The mini player takes over for the main window, so send that one to the tray. Wait for
  // the window to actually exist first — hiding before it appears leaves nothing on screen
  // if creation fails. Playback is unaffected: hide() only removes the window, the webview
  // (and with it the audio pipeline) keeps running, same as the close-to-tray path.
  win.once("tauri://created", async () => {
    try {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      await getCurrentWindow().hide();
    } catch {}
  });

  return win;
}
