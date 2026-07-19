// Platform detection shared across the app shell.
// macOS uses a native titled window (traffic lights + native drag), so the custom
// titlebar/drag-region is Windows-only. (Borderless windows swallow clicks on macOS.)
export const IS_MAC = /Mac OS X|Macintosh/.test(navigator.userAgent || "");
