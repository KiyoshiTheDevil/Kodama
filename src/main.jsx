import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import OverlayEditorApp from "./OverlayEditorApp.jsx";
// Big Picture mode — still early/WIP (see src/bigpicture/), reachable via F10 or the
// "Launch" button in Settings > Experimental. The gamepad test spike (GamepadTest.jsx)
// stays out — it was only ever a throwaway harness for verifying the Gamepad API, not
// a real entry point.
import { BigPicture } from "./bigpicture/BigPicture.jsx";
import { installErrorCapture } from "./bug-diagnostics.js";
import "./index.css";

installErrorCapture(); // capture frontend errors for the bug-report tool

// Suppress WebView2/WebKit's native right-click menu (Back/Refresh/Save as/Print) in
// packaged builds — it's a browser artifact that doesn't belong in a desktop app and has
// no use for end users. Left enabled in dev so right-click → Inspect still works there.
if (!import.meta.env.DEV) {
  window.addEventListener("contextmenu", (e) => e.preventDefault());
}

console.log("[boot] main.jsx executing at +" + (Date.now() - (window.__bootStart || Date.now())) + "ms");

const isOverlayEditor = new URLSearchParams(window.location.search).get("overlayEditor") === "1";

ReactDOM.createRoot(document.getElementById("root")).render(
  <>
    {isOverlayEditor ? <OverlayEditorApp /> : <App />}
    <BigPicture />
  </>
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
