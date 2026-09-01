import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import OverlayEditorApp from "./OverlayEditorApp.jsx";
import MiniPlayerApp from "./miniplayer/MiniPlayerApp.jsx";
import EqualizerApp from "./equalizer/EqualizerApp.jsx";
// Big Picture mode — still early/WIP (see src/bigpicture/), reachable via F10 or the
// "Launch" button in Settings > Experimental. The gamepad test spike (GamepadTest.jsx)
// stays out — it was only ever a throwaway harness for verifying the Gamepad API, not
// a real entry point.
import { BigPicture } from "./bigpicture/BigPicture.jsx";
import { installErrorCapture } from "./bug-diagnostics.js";
import { pruneLyricsCache } from "./lyrics/cache.js";
import "./index.css";

installErrorCapture(); // capture frontend errors for the bug-report tool
// Installs from before the lyrics cache had a ceiling carry hundreds of untracked entries.
// Measuring them means reading every one, so it waits until the app is idle rather than
// adding megabytes of string reads to startup.
(window.requestIdleCallback || ((fn) => setTimeout(fn, 3000)))(() => pruneLyricsCache());

// Suppress WebView2/WebKit's native right-click menu (Back/Refresh/Save as/Print) in
// packaged builds — it's a browser artifact that doesn't belong in a desktop app and has
// no use for end users. Left enabled in dev so right-click → Inspect still works there.
if (!import.meta.env.DEV) {
  window.addEventListener("contextmenu", (e) => e.preventDefault());
}

console.log("[boot] main.jsx executing at +" + (Date.now() - (window.__bootStart || Date.now())) + "ms");

const params = new URLSearchParams(window.location.search);
const isOverlayEditor = params.get("overlayEditor") === "1";
// The mini player is its own small window and shares nothing with the main tree — render it
// alone, without App or Big Picture (a second App would start a second audio pipeline).
const isMiniPlayer = params.get("miniPlayer") === "1";
// Same reasoning as the mini player: its own small window, and a second App here would start
// a second audio pipeline against the one the equaliser is meant to be filtering.
const isEqualizer = params.get("equalizer") === "1";

ReactDOM.createRoot(document.getElementById("root")).render(
  isMiniPlayer ? (
    <MiniPlayerApp />
  ) : isEqualizer ? (
    <EqualizerApp />
  ) : (
    <>
      {isOverlayEditor ? <OverlayEditorApp /> : <App />}
      <BigPicture />
    </>
  )
);

// Fade out the HTML boot splash now that React has taken over.
// Done in a microtask so React has had at least one paint cycle.
requestAnimationFrame(() => requestAnimationFrame(() => {
  document.documentElement.classList.add("loaded");
  console.log("[boot] React mounted at +" + (Date.now() - (window.__bootStart || Date.now())) + "ms");
  setTimeout(() => {
    const s = document.getElementById("boot-splash");
    if (s) s.remove();
  }, 400);
}));
