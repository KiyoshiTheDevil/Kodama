import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import OverlayEditorApp from "./OverlayEditorApp.jsx";
import { GamepadTest } from "./bigpicture/GamepadTest.jsx"; // TEMP: Big Picture gamepad spike (F9)
import { BigPicture } from "./bigpicture/BigPicture.jsx";     // Big Picture mode POC (F10)
import { installErrorCapture } from "./bug-diagnostics.js";
import "./index.css";

installErrorCapture(); // capture frontend errors for the bug-report tool

console.log("[boot] main.jsx executing at +" + (Date.now() - (window.__bootStart || Date.now())) + "ms");

const isOverlayEditor = new URLSearchParams(window.location.search).get("overlayEditor") === "1";

ReactDOM.createRoot(document.getElementById("root")).render(
  <>
    {isOverlayEditor ? <OverlayEditorApp /> : <App />}
    <GamepadTest />
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
