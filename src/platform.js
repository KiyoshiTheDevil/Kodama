// Which system Kodama runs on, for the few places that differ by it. Android is the Tauri
// mobile build (src-tauri/gen/android); its web view says so in the user agent.
export const IS_ANDROID = typeof navigator !== "undefined" && /Android/.test(navigator.userAgent || "");
