// Captures all console.log/warn/error/info calls into a ring buffer so the Debug tab can
// show them even when DevTools is closed. Importing this module installs the interceptor,
// so it has to be imported once, early — App.jsx does that.
export const frontendLogs = [];
const MAX_FRONTEND_LOGS = 500;

(function setupDebugInterceptor() {
  const orig = { log: console.log, warn: console.warn, error: console.error, info: console.info };
  ["log", "warn", "error", "info"].forEach(level => {
    console[level] = (...args) => {
      orig[level](...args);
      const msg = args.map(a => {
        if (a instanceof Error) return a.stack || a.message;
        if (typeof a === "object" && a !== null) { try { return JSON.stringify(a); } catch { return String(a); } }
        return String(a);
      }).join(" ");
      frontendLogs.push({ ts: Date.now() / 1000, level: level.toUpperCase(), msg, source: "frontend" });
      if (frontendLogs.length > MAX_FRONTEND_LOGS) frontendLogs.shift();
    };
  });
})();
