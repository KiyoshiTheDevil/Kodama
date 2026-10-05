// Motion shared by every page: things slide in as they come into view, and a spirit sitting
// in a tile or card cheers when the pointer comes over it. Page-to-page transitions are CSS only
// (@view-transition in style.css). Nothing here runs with prefers-reduced-motion.
window.__siteMotion = true;
const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ── Reveal on scroll ─────────────────────────────────────────────────────
// Hidden by CSS until marked .in (only once html.js is set, so the page never depends on this
// script to be readable). Elements that come in together are staggered by their order.
const REVEAL = ".section > h2, .section > .sub, .showcase, .song-credit, .tile, .store-teaser, .rel, .legal, .vhead, .cat";
const done = (el) => {
  el.classList.add("in");
  // Once in, hand transform and transition back to the element's own rules (hover lifts).
  setTimeout(() => { el.classList.add("settled"); el.style.removeProperty("--d"); }, 900);
};
const io = calm ? null : new IntersectionObserver((entries) => {
  const coming = entries.filter((e) => e.isIntersecting).map((e) => e.target);
  coming.forEach((el, i) => { el.style.setProperty("--d", `${Math.min(i, 6) * 0.07}s`); done(el); io.unobserve(el); });
}, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
function watch(root = document) {
  root.querySelectorAll(REVEAL).forEach((el) => {
    if (el.classList.contains("in") || el._watched) return;
    el._watched = true;
    if (io) io.observe(el); else done(el);
  });
}
watch();
// The store draws its content after loading; pick up what it adds.
new MutationObserver(() => watch()).observe(document.body, { childList: true, subtree: true });

// ── Spirits cheer on hover ───────────────────────────────────────────────
if (!calm) document.addEventListener("pointerover", (e) => {
  const host = e.target.closest(".tile, .cat, .card, .store-teaser");
  if (!host || host.contains(e.relatedTarget)) return;
  for (const s of host.querySelectorAll("kodama-spirit")) if (s.cheer) s.cheer();
});
