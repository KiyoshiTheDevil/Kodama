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

// ── Scrollbar ────────────────────────────────────────────────────────────
// The browser's own bar takes room from the page, and only on pages long enough to scroll, so
// going from one page to another (or the store filling in) pushed everything sideways. This one
// floats over the content instead. Only with a mouse: touch screens float theirs already.
if (matchMedia("(pointer: fine)").matches) {
  const root = document.documentElement;
  root.classList.add("own-scrollbar");
  const bar = document.createElement("div"); bar.className = "sbar"; bar.setAttribute("aria-hidden", "true");
  const thumb = document.createElement("div"); thumb.className = "sbar-thumb";
  bar.appendChild(thumb); document.body.appendChild(bar);
  let hideT = 0, dragging = false;
  const MIN = 36;
  function layout() {
    const view = innerHeight, full = root.scrollHeight;
    const scrollable = full > view + 1;
    bar.classList.toggle("off", !scrollable);
    if (!scrollable) return;
    const track = bar.clientHeight;
    const h = Math.max(MIN, (view / full) * track);
    const top = (scrollY / (full - view)) * (track - h);
    thumb.style.height = h + "px";
    thumb.style.transform = `translateY(${top}px)`;
  }
  function wake() {
    bar.classList.add("on");
    clearTimeout(hideT);
    hideT = setTimeout(() => { if (!dragging && !bar.matches(":hover")) bar.classList.remove("on"); }, 1100);
  }
  addEventListener("scroll", () => { layout(); wake(); }, { passive: true });
  addEventListener("resize", layout);
  new ResizeObserver(layout).observe(document.body);
  bar.addEventListener("pointerenter", () => bar.classList.add("on"));
  bar.addEventListener("pointerleave", wake);
  // Near the right edge counts as a wish to scroll: show the bar before it is reached.
  addEventListener("pointermove", (e) => { if (innerWidth - e.clientX < 24) wake(); }, { passive: true });
  thumb.addEventListener("pointerdown", (e) => {
    e.preventDefault(); e.stopPropagation();
    dragging = true; thumb.setPointerCapture(e.pointerId); bar.classList.add("drag");
    const startY = e.clientY, startScroll = scrollY;
    const track = bar.clientHeight - thumb.offsetHeight, range = root.scrollHeight - innerHeight;
    const move = (ev) => scrollTo({ top: startScroll + ((ev.clientY - startY) / track) * range, behavior: "instant" });
    const up = () => { dragging = false; bar.classList.remove("drag"); thumb.removeEventListener("pointermove", move); wake(); };
    thumb.addEventListener("pointermove", move);
    thumb.addEventListener("pointerup", up, { once: true });
    thumb.addEventListener("pointercancel", up, { once: true });
  });
  // A click on the track pages toward it, like the native bar.
  bar.addEventListener("pointerdown", (e) => {
    if (e.target !== bar) return;
    const r = thumb.getBoundingClientRect();
    scrollBy({ top: (e.clientY < r.top ? -1 : 1) * innerHeight * 0.85, behavior: "smooth" });
  });
  layout();
}
