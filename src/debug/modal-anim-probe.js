// TEMPORARY diagnostic — remove once the modal animation issue is understood.
//
// Records three things on one shared timeline:
//   * the lifecycle of every .modal__container (react-aria's data-entering/data-exiting,
//     the computed animation, the animation events, removal from the DOM)
//   * long tasks (>50ms of blocked main thread) via PerformanceObserver
//   * frame gaps — a rAF ticker noting every frame that took longer than ~32ms
//
// The earlier recording showed animations reporting their full duration while far less wall
// time had passed, i.e. they were advancing through frames that never got painted. These two
// extra sources say *what* was occupying the main thread while that happened.
//
// It records into memory rather than console.log on purpose: having DevTools open is itself
// enough to make animations stutter in WebView2. Reproduce with DevTools closed, then:
//
//     __modalProbe.dump()      // prints the timeline and copies it to the clipboard
//     __modalProbe.clear()     // start a fresh recording
//
// Dev only, and it never touches the elements it observes.

const buf = [];
const MAX = 2000;
let t0 = 0;
const stamp = () => {
  if (!t0) t0 = performance.now();
  return Math.round(performance.now() - t0);
};
const rec = (event, data) => {
  if (buf.length < MAX) buf.push({ t: stamp(), event, ...data });
};

function snapshot(el) {
  const cs = getComputedStyle(el);
  return {
    entering: el.getAttribute("data-entering"),
    exiting: el.getAttribute("data-exiting"),
    animName: cs.animationName,
    animDur: cs.animationDuration,
    running: el.getAnimations ? el.getAnimations().length : "n/a",
  };
}

function watch(el) {
  if (el.__animProbe) return;
  el.__animProbe = true;
  rec("MODAL added", snapshot(el));

  new MutationObserver((records) => {
    for (const r of records) {
      rec(`MODAL attr:${r.attributeName}=${el.getAttribute(r.attributeName)}`, snapshot(el));
    }
  }).observe(el, { attributes: true, attributeFilter: ["data-entering", "data-exiting"] });

  for (const evt of ["animationstart", "animationend", "animationcancel"]) {
    el.addEventListener(evt, (e) => {
      if (e.target !== el) return;
      rec(`MODAL ${evt}`, { animName: e.animationName, elapsedMs: Math.round(e.elapsedTime * 1000) });
    });
  }
}

export function installModalAnimProbe() {
  if (globalThis.__modalProbe) return;

  // 1) modal lifecycle
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
        if (hit) rec("MODAL removed from DOM", {});
      }
    }
  }).observe(document.body, { childList: true, subtree: true });

  // 2) long tasks — anything blocking the main thread for >50ms
  try {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        const attr = (e.attribution || []).map(a => a.containerType || a.name).join(",");
        rec("LONGTASK", { ms: Math.round(e.duration), src: attr || e.name || "?" });
      }
    }).observe({ entryTypes: ["longtask"] });
  } catch { rec("LONGTASK unsupported", {}); }

  // 3) frame pacing — a dropped frame is the thing the user actually sees
  let last = performance.now();
  const tick = (now) => {
    const gap = now - last;
    last = now;
    if (gap > 32) rec("FRAME GAP", { ms: Math.round(gap) });
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  globalThis.__modalProbe = {
    get entries() { return buf; },
    clear() { buf.length = 0; t0 = 0; return "cleared"; },
    dump() {
      const text = buf.map(e => {
        const { t, event, ...rest } = e;
        const detail = Object.entries(rest).map(([k, v]) => `${k}=${v}`).join(" ");
        return `+${String(t).padStart(6)}ms  ${event}${detail ? "  " + detail : ""}`;
      }).join("\n") || "(nothing recorded)";
      try { navigator.clipboard.writeText(text); } catch { /* ignore */ }
      return text;
    },
  };
}
