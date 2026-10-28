// Which system Kodama runs on, for the few places that differ by it. Android is the Tauri
// mobile build (src-tauri/gen/android); its web view says so in the user agent.
export const IS_ANDROID = typeof navigator !== "undefined" && /Android/.test(navigator.userAgent || "");

// A plain browser rather than a Tauri window: the Linux route through Chromium in app mode.
// browser-shim.js sets the mark before anything else loads.
export const IS_BROWSER = typeof window !== "undefined" && !!window.__KODAMA_BROWSER__;
