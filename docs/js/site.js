// Motion shared by every page: things slide in as they come into view, and a spirit sitting
// in a tile or card cheers when the pointer comes over it. Page-to-page transitions are CSS only
// (@view-transition in style.css). Nothing here runs with prefers-reduced-motion.
const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;

// ── Reveal on scroll ─────────────────────────────────────────────────────
// Only what starts out below the visible part of the page slides in. What is on screen when the
// page appears is simply there: hiding it until a script showed it again made every page change
// flash empty, and the view transition captured that empty page.
const REVEAL = ".section > h2, .section > .sub, .showcase, .song-credit, .tile, .store-teaser, .rel, .legal, .vhead";
const io = calm ? null : new IntersectionObserver((entries) => {
  const coming = entries.filter((e) => e.isIntersecting).map((e) => e.target);
  coming.forEach((el, i) => {
    io.unobserve(el);
    el.style.setProperty("--d", `${Math.min(i, 6) * 0.07}s`);
    el.classList.add("in");
    // Once in, hand transform and transition back to the element's own rules (hover lifts).
    setTimeout(() => { el.classList.remove("pre", "in"); el.style.removeProperty("--d"); }, 900);
  });
}, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
function watch(root = document) {
  if (!io) return;
  root.querySelectorAll(REVEAL).forEach((el) => {
    if (el._watched) return;
    el._watched = true;
    if (el.getBoundingClientRect().top < innerHeight * 0.92) return;
    el.classList.add("pre");
    io.observe(el);
  });
}
watch();
// Pages that draw part of their content after loading (the changelog) add more to watch.
new MutationObserver(() => watch()).observe(document.body, { childList: true, subtree: true });

// ── Spirits cheer on hover ───────────────────────────────────────────────
if (!calm) document.addEventListener("pointerover", (e) => {
  const host = e.target.closest(".tile, .cat, .card, .store-teaser");
  if (!host || host.contains(e.relatedTarget)) return;
  for (const s of host.querySelectorAll("kodama-spirit")) if (s.cheer) s.cheer();
});
