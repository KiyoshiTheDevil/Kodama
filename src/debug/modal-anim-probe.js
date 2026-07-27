// TEMPORARY diagnostic — remove once the modal animation issue is understood.
//
// Watches every .modal__container that appears and records what actually happens to it:
// the data-entering/data-exiting attributes react-aria sets, what the browser computes for
// animation-name/duration at that moment, whether the animation events fire, and when the
// element leaves the DOM.
//
// It records into an in-memory buffer instead of console.log ON PURPOSE: having DevTools
// open is itself enough to make animations stutter in WebView2, so logging per event would
// measure the measurement. Reproduce with DevTools closed, then open them once and run:
//
//     __modalProbe.dump()      // prints the timeline and copies it to the clipboard
//     __modalProbe.clear()     // start a fresh recording
//
// Dev only, and it never touches the elements it observes.

const buf = [];
let t0 = 0;
const stamp = () => {
  if (!t0) t0 = performance.now();
  return Math.round(performance.now() - t0);
};
const rec = (event, data) => { buf.push({ t: stamp(), event, ...data }); };

function snapshot(el) {
  const cs = getComputedStyle(el);
  return {
    entering: el.getAttribute("data-entering"),
    exiting: el.getAttribute("data-exiting"),
    animName: cs.animationName,
    animDur: cs.animationDuration,
    playState: cs.animationPlayState,
    opacity: cs.opacity,
    // our index.css override — "(unset)" would mean it is not reaching the element
    twDur: cs.getPropertyValue("--tw-duration").trim() || "(unset)",
    twEnterScale: cs.getPropertyValue("--tw-enter-scale").trim() || "(unset)",
    twExitScale: cs.getPropertyValue("--tw-exit-scale").trim() || "(unset)",
    running: el.getAnimations ? el.getAnimations().length : "n/a",
  };
}

function watch(el) {
  if (el.__animProbe) return;
  el.__animProbe = true;
  rec("ADDED", snapshot(el));

  new MutationObserver((records) => {
    for (const r of records) {
      rec(`attr:${r.attributeName}=${el.getAttribute(r.attributeName)}`, snapshot(el));
    }
  }).observe(el, { attributes: true, attributeFilter: ["data-entering", "data-exiting"] });

  for (const evt of ["animationstart", "animationend", "animationcancel"]) {
    el.addEventListener(evt, (e) => {
      if (e.target !== el) return;
      rec(evt, { animName: e.animationName, elapsedMs: Math.round(e.elapsedTime * 1000) });
    });
  }
}

export function installModalAnimProbe() {
  if (globalThis.__modalProbe) return;

  new MutationObserver((records) => {
    for (const r of records) {
      for (const n of r.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.classList?.contains("modal__container")) watch(n);
        n.querySelectorAll?.(".modal__container").forEach(watch);
      }
      for (const n of r.removedNodes) {
        if (n.nodeType !== 1) continue;
        const hit = n.classList?.contains("modal__container") ? n : n.querySelector?.(".modal__container");
        if (hit) rec("REMOVED from DOM", {});
      }
    }
  }).observe(document.body, { childList: true, subtree: true });

  globalThis.__modalProbe = {
    get entries() { return buf; },
    clear() { buf.length = 0; t0 = 0; return "cleared"; },
    dump() {
      const text = buf.map(e => {
        const { t, event, ...rest } = e;
        const detail = Object.entries(rest).map(([k, v]) => `${k}=${v}`).join(" ");
        return `+${String(t).padStart(5)}ms  ${event}${detail ? "  " + detail : ""}`;
      }).join("\n") || "(nothing recorded)";
      try { navigator.clipboard.writeText(text); } catch { /* ignore */ }
      return text;
    },
  };
}
