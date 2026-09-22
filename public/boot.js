// Boot timing and early error logging, before the bundle loads.
//
// A file, not an inline <script> in index.html, and it has to stay that way. In a release build
// Tauri hashes every inline <script> of index.html into script-src and puts a nonce on every
// <style>. The moment script-src or style-src carries a hash or nonce, browsers ignore
// 'unsafe-inline' - for the main document AND for every srcdoc frame, which inherits its parent's
// policy. That silently broke all themes in alpha.38 (a runtime <style>) and would have stopped
// every sandboxed extension from running (inline script in a srcdoc frame), while the dev build,
// served by Vite without that processing, showed nothing wrong. With no inline script or style in
// index.html Tauri adds nothing, and the CSP in tauri.conf.json is the one that applies.
window.__bootStart = Date.now();
console.log("[boot] HTML parsed at " + new Date().toISOString());
window.addEventListener("error", e => console.error("[boot] global error:", e.message, e.filename, e.lineno));
window.addEventListener("unhandledrejection", e => console.error("[boot] unhandled promise:", e.reason));
