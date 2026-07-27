// Captures all console.log/warn/error/info calls into a ring buffer so the Debug tab can
// show them even when DevTools is closed. Importing this module installs the interceptor,
// so it has to be imported once, early — App.jsx does that.
//
// Both the buffer and the "already patched" flag live on globalThis rather than in module
// scope, because Vite re-evaluates this module on every hot reload. Without that guard each
// reload captured the *already wrapped* console as its original and wrapped it again, so
// after a few edits every console call ran through a stack of wrappers, each re-doing the
// argument serialisation — which showed up as the whole UI getting progressively jankier
// during a dev session. It also meant the buffer the Debug tab read was no longer the one
// the older wrappers were writing to.
const MAX_FRONTEND_LOGS = 500;
const KEY = "__kodamaConsoleCapture";

const store = globalThis[KEY] || (globalThis[KEY] = { logs: [], patched: false });

export const frontendLogs = store.logs;

if (!store.patched) {
  store.patched = true;
  const orig = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  ["log", "warn", "error", "info"].forEach(level => {
    console[level] = (...args) => {
      orig[level](...args);
      const msg = args.map(a => {
        if (a instanceof Error) return a.stack || a.message;
        if (typeof a === "object" && a !== null) { try { return JSON.stringify(a); } catch { return String(a); } }
        return String(a);
      }).join(" ");
      store.logs.push({ ts: Date.now() / 1000, level: level.toUpperCase(), msg, source: "frontend" });
      if (store.logs.length > MAX_FRONTEND_LOGS) store.logs.shift();
    };
  });
}
