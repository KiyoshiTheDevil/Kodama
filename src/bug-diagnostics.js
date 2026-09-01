// Captures recent frontend errors (uncaught exceptions, promise rejections, console.error) into a
// small ring buffer so the bug-report tool can attach them — these never show up in the backend
// log. Install once at app start; read via getConsoleErrors().
const _errs = [];
function push(s) {
  try {
    _errs.push(`[${new Date().toLocaleTimeString()}] ${String(s).slice(0, 600)}`);
    if (_errs.length > 40) _errs.shift();
  } catch { /* ignore */ }
}

export function installErrorCapture() {
  if (window.__kodamaErrCap) return;
  window.__kodamaErrCap = true;
  window.addEventListener("error", (e) => {
    const err = e.error;
    const head = (err && (err.name || err.message))
      ? `${err.name || "Error"}: ${err.message || "(no message)"}`
      : `${e.message || "(no message)"} [thrown value: ${typeof err} ${String(err).slice(0, 80)}]`;
    const where = e.filename ? ` @ ${e.filename}:${e.lineno}:${e.colno}` : "";
    const stack = err && err.stack
      ? " | " + String(err.stack).split(/\r?\n/).slice(0, 4).join(" ⏎ ")
      : "";
    push(`error: ${head}${where}${stack}`);
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    push(`unhandledrejection: ${(r && (r.stack || r.message)) || r}`);
  });
  const orig = console.error;
  console.error = (...args) => {
    push("console.error: " + args.map(a => (a && a.stack) || (typeof a === "object" ? (() => { try { return JSON.stringify(a); } catch { return String(a); } })() : String(a))).join(" "));
    orig.apply(console, args);
  };
}

/**
 * Record a deliberate observation, not an error. Same ring buffer, so it travels with a bug
 * report — which is the only way to learn anything about a fault that only happens on someone
 * else's machine. Kept rare and one-shot at each call site: this buffer holds 40 lines, and a
 * chatty note would push out the errors it exists for.
 */
export function logDiag(msg) {
  push("diag: " + msg);
}

export function getConsoleErrors() {
  return _errs.slice();
}
