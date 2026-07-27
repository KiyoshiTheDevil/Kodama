// TEMPORARY diagnostic — remove once the modal animation issue is understood.
//
// Watches every .modal__container that appears and reports what actually happens to it:
// which data-entering/data-exiting attributes react-aria sets, what the browser computes
// for animation-name/duration at that moment, whether the animation events fire, and when
// the element leaves the DOM. Between them those answer whether the animation is being
// skipped by react-aria, killed by CSS, or cut short by an early unmount.
//
// Dev only, and it never touches the elements it observes.

const TAG = "[modal-anim]";
let t0 = 0;
const now = () => {
  if (!t0) t0 = performance.now();
  return `+${Math.round(performance.now() - t0)}ms`;
};

function describe(el) {
  const cs = getComputedStyle(el);
  return {
    entering: el.getAttribute("data-entering"),
    exiting: el.getAttribute("data-exiting"),
    animationName: cs.animationName,
    animationDuration: cs.animationDuration,
    animationPlayState: cs.animationPlayState,
    opacity: cs.opacity,
    // the custom properties our index.css override sets — empty means it is not applying
    twDuration: cs.getPropertyValue("--tw-duration").trim() || "(unset)",
    twEnterScale: cs.getPropertyValue("--tw-enter-scale").trim() || "(unset)",
    twExitScale: cs.getPropertyValue("--tw-exit-scale").trim() || "(unset)",
    running: el.getAnimations ? el.getAnimations().length : "n/a",
  };
}

function watch(el) {
  if (el.__animProbe) return;
  el.__animProbe = true;
  console.log(`${TAG} ${now()} ADDED`, describe(el));

  new MutationObserver((records) => {
    for (const r of records) {
      console.log(`${TAG} ${now()} attr ${r.attributeName} ->`, el.getAttribute(r.attributeName), describe(el));
    }
  }).observe(el, { attributes: true, attributeFilter: ["data-entering", "data-exiting"] });

  for (const evt of ["animationstart", "animationend", "animationcancel"]) {
    el.addEventListener(evt, (e) => {
      if (e.target !== el) return;
      console.log(`${TAG} ${now()} ${evt} name=${e.animationName} elapsed=${Math.round(e.elapsedTime * 1000)}ms`);
    });
  }
}

export function installModalAnimProbe() {
  if (globalThis.__kodamaModalProbe) return;
  globalThis.__kodamaModalProbe = true;
  console.log(`${TAG} probe installed`);

  new MutationObserver((records) => {
    for (const r of records) {
      for (const n of r.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.classList?.contains("modal__container")) watch(n);
        n.querySelectorAll?.(".modal__container").forEach(watch);
      }
      for (const n of r.removedNodes) {
        if (n.nodeType !== 1) continue;
        const hit = n.classList?.contains("modal__container")
          ? n
          : n.querySelector?.(".modal__container");
        if (hit) console.log(`${TAG} ${now()} REMOVED from DOM`);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
}
