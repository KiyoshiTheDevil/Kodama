// Kodama in a plain browser (Chromium in app mode), the way to Linux without WebKitGTK.
//
// Tauri injects __TAURI_INTERNALS__ before any page script runs; a browser has none, and every
// @tauri-apps import would throw on first use (window-chrome.jsx already does at load). This
// stands in for it, so the rest of the frontend runs unchanged:
//   - events work inside this one page (listen/emit), which is all a single window needs;
//   - window and webview calls succeed and do nothing, there is no native window to move;
//   - links open in a new tab;
//   - every Rust command fails, as it does on Android. IpcAudio's probe then falls back to
//     <audio>, which is the path the phone already plays through.
//
// Must be the first import of main.jsx: imports run in order, and the modules after it read
// __TAURI_INTERNALS__ while they load.

if (typeof window !== "undefined" && !window.__TAURI_INTERNALS__) {
  window.__KODAMA_BROWSER__ = true;

  const callbacks = new Map(); // id → function, what transformCallback hands out
  const listeners = new Map(); // event name → Map(eventId → callback id)
  let nextId = 1;

  const transformCallback = (cb, once = false) => {
    const id = nextId++;
    callbacks.set(id, (data) => { if (once) callbacks.delete(id); return cb?.(data); });
    return id;
  };

  const unregisterListener = (event, eventId) => {
    const forEvent = listeners.get(event);
    const handler = forEvent?.get(eventId);
    if (handler != null) callbacks.delete(handler);
    forEvent?.delete(eventId);
  };

  const dispatch = (event, payload) => {
    const forEvent = listeners.get(event);
    if (!forEvent) return;
    for (const [id, handler] of [...forEvent]) {
      // A handler that throws must not keep the others from hearing the event.
      try { callbacks.get(handler)?.({ event, id, payload }); } catch (e) { console.error(e); }
    }
  };

  const invoke = async (cmd, args = {}) => {
    if (cmd === "plugin:event|listen") {
      const eventId = nextId++;
      if (!listeners.has(args.event)) listeners.set(args.event, new Map());
      listeners.get(args.event).set(eventId, args.handler);
      return eventId;
    }
    if (cmd === "plugin:event|unlisten") { unregisterListener(args.event, args.eventId); return null; }
    if (cmd === "plugin:event|emit" || cmd === "plugin:event|emit_to") {
      // Later, not now: Tauri delivers events after the emitting call returns, and code that
      // emits to itself was written against that.
      setTimeout(() => dispatch(args.event, args.payload), 0);
      return null;
    }
    if (cmd === "plugin:opener|open_url") { window.open(args.url, "_blank", "noopener"); return null; }
    if (cmd.startsWith("plugin:window|") || cmd.startsWith("plugin:webview|")) return null;
    throw new Error(`${cmd}: not available in the browser`);
  };

  const label = "main";
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label }, currentWebview: { windowLabel: label, label } },
    invoke,
    transformCallback,
    unregisterCallback: (id) => callbacks.delete(id),
    convertFileSrc: (path) => path,
    plugins: {},
  };
  window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener };
}
