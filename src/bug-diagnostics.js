// Captures recent frontend errors (uncaught exceptions, promise rejections, console.error) into a
// small ring buffer so the bug-report tool can attach them — these never show up in the backend
// log. Install once at app start; read via getConsoleErrors().
const _errs = [];
function push(s) {
  try {
    _errs.push(`[${new Date().toISOString().slice(11, 19)}] ${String(s).slice(0, 600)}`);
    if (_errs.length > 40) _errs.shift();
  } catch {
    /* ignore */
  }
}

export function installErrorCapture() {
  if (window.__kodamaErrCap) return;
  window.__kodamaErrCap = true;
  window.addEventListener("error", (e) => {
    push(`error: ${e.message}` + (e.filename ? ` @ ${e.filename}:${e.lineno}:${e.colno}` : ""));
  });
  window.addEventListener("unhandledrejection", (e) => {
    const r = e.reason;
    push(`unhandledrejection: ${(r && (r.stack || r.message)) || r}`);
  });
  const orig = console.error;
  console.error = (...args) => {
    push(
      "console.error: " +
        args
          .map(
            (a) =>
              (a && a.stack) ||
              (typeof a === "object"
                ? (() => {
                    try {
                      return JSON.stringify(a);
                    } catch {
                      return String(a);
                    }
                  })()
                : String(a))
          )
          .join(" ")
    );
    orig.apply(console, args);
  };
  // The E2E bridge is injected before this module. Exposing a read-only snapshot
  // lets smoke tests fail on uncaught frontend errors without coupling them to
  // the bug-report UI.
  if (window.__kodamaE2e) window.__kodamaE2e.errors = () => _errs.slice();
}

export function getConsoleErrors() {
  return _errs.slice();
}
