import "@kodama/e2e-network-guard";
import "@kodama/e2e-bridge";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import OverlayEditorApp from "./OverlayEditorApp.jsx";
// Big Picture mode + its gamepad spike are intentionally NOT mounted yet — the
// feature is still WIP and kept out of releases (no F9/F10 entry point). The code
// lives in ./bigpicture/; re-enable the import + render below once it's ready.
// import { GamepadTest } from "./bigpicture/GamepadTest.jsx";
// import { BigPicture } from "./bigpicture/BigPicture.jsx";
import { installErrorCapture } from "./bug-diagnostics.js";
import "./index.css";

installErrorCapture(); // capture frontend errors for the bug-report tool

console.log(
  "[boot] main.jsx executing at +" + (Date.now() - (window.__bootStart || Date.now())) + "ms"
);

const isOverlayEditor = new URLSearchParams(window.location.search).get("overlayEditor") === "1";

ReactDOM.createRoot(document.getElementById("root")).render(
  <>{isOverlayEditor ? <OverlayEditorApp /> : <App />}</>
);

// Fade out the HTML boot splash now that React has taken over.
// Done in a microtask so React has had at least one paint cycle.
requestAnimationFrame(() =>
  requestAnimationFrame(() => {
    document.documentElement.classList.add("loaded");
    console.log(
      "[boot] React mounted at +" + (Date.now() - (window.__bootStart || Date.now())) + "ms"
    );
    setTimeout(() => {
      const s = document.getElementById("boot-splash");
      if (s) s.remove();
    }, 400);
  })
);
