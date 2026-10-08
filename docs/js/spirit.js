// The Kodama mark as a little character: the speech-bubble ring of the logo, its two eyes doing
// the acting. <kodama-spirit pose="idle" size="96" follow></kodama-spirit>
//
// Poses: idle (breathes, blinks), listen (headphones, grooves), happy (hops, ^^ eyes),
// sleep (closed eyes, z's), search (eyes look around), sad (low eyes), peek (rises from below
// its box, for sitting behind a card), surprise (jumps, wide eyes, "!": see startle()).
// `follow` makes the eyes track the pointer.
// Respects prefers-reduced-motion: the poses stay, the motion stops.

const RING_OUTER = "M53.7854 1.08728C66.388 1.08752 76.6039 11.3469 76.6039 24.0004C76.603 37.4721 65.0822 48.036 51.7195 46.8168L46.8465 46.3716C44.7842 46.1832 42.7057 46.2948 40.675 46.7025C35.0252 47.8371 30.0422 42.8361 31.1713 37.1634C31.5775 35.1243 31.6886 33.0351 31.501 30.9642L31.0604 26.0746C29.8456 12.6573 40.3668 1.08728 53.7854 1.08728Z";
const RING_INNER = "M53.6949 7.08729C43.6016 7.08729 35.7467 15.8971 36.8613 25.9691L37.2727 29.6781C37.5942 32.5833 37.283 35.5242 36.3623 38.2971C35.7077 40.2708 37.58 42.1485 39.5458 41.4906C42.307 40.5666 45.2349 40.254 48.1274 40.5765L51.8246 40.9896C61.8555 42.108 70.6276 34.2246 70.6279 24.0912C70.6279 14.7011 63.0471 7.08801 53.6949 7.08729Z";

const CSS = `
:host{display:inline-block;line-height:0;color:var(--spirit,#eef8f1)}
svg{width:100%;height:100%;overflow:visible}
.body{transform-box:fill-box;transform-origin:50% 100%}
.blink{transform-box:fill-box;transform-origin:center;animation:blink 4.5s infinite}
.look{transition:transform .25s ease-out}
.idle .body{animation:breathe 3.6s ease-in-out infinite}
.listen .body{animation:groove 1.05s ease-in-out infinite}
.happy .body{animation:hop 1.1s cubic-bezier(.3,.7,.4,1) infinite}
.sleep .body{animation:breathe 3s ease-in-out infinite}
.sad .body{animation:breathe 4.5s ease-in-out infinite}
.search .look{animation:look 1.6s linear infinite;transition:none}
.peek .body{animation:peek 5s ease-in-out infinite}
.surprise .body{animation:jump .7s cubic-bezier(.2,.9,.3,1.4) both}
.bang{transform-box:fill-box;transform-origin:50% 100%;animation:pop .4s .08s cubic-bezier(.3,1.6,.5,1) both;font-family:system-ui,sans-serif}
.note{animation:note 2.1s linear infinite;font-family:system-ui,sans-serif}
.z{animation:zz 2.6s ease-out infinite;font-family:system-ui,sans-serif}
@keyframes blink{0%,93%,100%{transform:scaleY(1)}96%{transform:scaleY(.1)}}
@keyframes breathe{0%,100%{transform:scale(1,1)}50%{transform:scale(1.03,.97)}}
@keyframes groove{0%,100%{transform:translateY(0) rotate(0) scale(1,1)}25%{transform:translateY(-3px) rotate(-5deg) scale(.98,1.03)}50%{transform:scale(1.04,.96)}75%{transform:translateY(-3px) rotate(5deg) scale(.98,1.03)}}
@keyframes hop{0%,100%{transform:translateY(0) scale(1.06,.94)}40%,60%{transform:translateY(-14px) scale(.96,1.05)}}
@keyframes look{0%,100%{transform:translate(-2.5px,-1.5px)}25%{transform:translate(2.5px,-1.5px)}50%{transform:translate(2.5px,1.5px)}75%{transform:translate(-2.5px,1.5px)}}
@keyframes peek{0%,40%,100%{transform:translateY(60%)}52%,86%{transform:translateY(8%)}}
@keyframes note{0%{transform:translate(0,0);opacity:0}20%{opacity:1}100%{transform:translate(12px,-26px);opacity:0}}
@keyframes jump{0%{transform:translateY(0) scale(1.15,.85)}35%{transform:translateY(-12px) scale(.9,1.12)}70%{transform:translateY(0) scale(1.07,.93)}100%{transform:translateY(0) scale(1)}}
@keyframes pop{from{transform:scale(0)}to{transform:scale(1)}}
@keyframes zz{0%{transform:translate(0,0);opacity:0}30%{opacity:.9}100%{transform:translate(10px,-18px);opacity:0}}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
`;

function eyes(kind) {
  if (kind === "happy") return `<path d="M46.4 24.5l3.3-5 3.3 5M55.4 24.5l3.3-5 3.3 5" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/>`;
  if (kind === "sleep") return `<rect x="46.2" y="23" width="7" height="2.6" rx="1.3" fill="currentColor"/><rect x="55.2" y="23" width="7" height="2.6" rx="1.3" fill="currentColor"/>`;
  // Wide open: the usual eyes, taller and a little wider.
  if (kind === "wide") return `<rect x="46.1" y="13.9" width="7.2" height="15.4" rx="3.6" fill="currentColor"/><rect x="55.1" y="13.9" width="7.2" height="15.4" rx="3.6" fill="currentColor"/>`;
  if (kind === "sad") return `<rect x="46.7" y="21" width="6" height="8" rx="3" fill="currentColor"/><rect x="55.7" y="21" width="6" height="8" rx="3" fill="currentColor"/>`;
  return `<rect x="46.72" y="16.09" width="5.98" height="12" rx="2.99" fill="currentColor"/><rect x="55.69" y="16.09" width="5.98" height="12" rx="2.99" fill="currentColor"/>`;
}

const followers = new Set();
let listening = false;
function track(e) {
  for (const el of followers) el._aim(e.clientX, e.clientY);
}

class KodamaSpirit extends HTMLElement {
  static get observedAttributes() { return ["pose", "size"]; }
  connectedCallback() {
    if (!this.shadowRoot) this.attachShadow({ mode: "open" });
    this.render();
    if (this.hasAttribute("follow")) {
      followers.add(this);
      if (!listening) { listening = true; window.addEventListener("pointermove", track, { passive: true }); }
    }
  }
  disconnectedCallback() { followers.delete(this); }
  attributeChangedCallback() { if (this.shadowRoot) this.render(); }
  render() {
    const pose = this.getAttribute("pose") || "idle";
    const size = this.getAttribute("size");
    if (size) { this.style.width = size + "px"; this.style.height = size + "px"; }
    const eyeKind = pose === "happy" || pose === "sleep" || pose === "sad" ? pose : pose === "surprise" ? "wide" : "open";
    // A startled listener keeps its headphones on.
    const hp = pose === "listen" || (pose === "surprise" && this._from === "listen")
      ? `<path d="M30 24C30 -3 77.5 -3 77.5 24" fill="none" stroke="var(--spirit-accent,#9be36d)" stroke-width="3.2"/><rect x="26.8" y="18" width="7" height="13" rx="3.5" fill="var(--spirit-accent,#9be36d)"/><rect x="73.8" y="18" width="7" height="13" rx="3.5" fill="var(--spirit-accent,#9be36d)"/>`
      : "";
    const extra = pose === "listen"
      ? `<text class="note" x="76" y="4" font-size="9" fill="var(--spirit-accent,#9be36d)">♪</text><text class="note" x="80" y="12" font-size="7" fill="#0AFFFB" style="animation-delay:-1s">♫</text>`
      : pose === "sleep"
        ? `<text class="z" x="74" y="6" font-size="8" fill="currentColor" opacity=".7">z</text><text class="z" x="70" y="12" font-size="6" fill="currentColor" opacity=".7" style="animation-delay:-1.3s">z</text>`
        : pose === "surprise"
          ? `<text class="bang" x="78" y="2" font-size="13" font-weight="700" fill="var(--spirit-accent,#9be36d)">!</text>`
          : "";
    this.shadowRoot.innerHTML = `<style>${CSS}</style>
<svg viewBox="24 -8 60 60" class="${pose}" aria-hidden="true"><g class="body">
<path d="${RING_OUTER} ${RING_INNER}" fill="currentColor" fill-rule="evenodd"/>
<g class="look"><g class="${eyeKind === "open" ? "blink" : ""}">${eyes(eyeKind)}</g></g>${hp}</g>${extra}</svg>`;
    this._look = this.shadowRoot.querySelector(".look");
    // A new pose is a new drawing: keep looking where it looked.
    if (this._aimAt) this._aim(...this._aimAt);
  }
  /** A short happy hop, then back to whatever it was doing. Peeking and listening spirits stay put:
   *  a hop would leave the box one peeks from, and a listener is already moving. */
  cheer() {
    const pose = this.getAttribute("pose") || "idle";
    if (this._cheering || pose === "peek" || pose === "listen") return;
    this._cheering = true;
    this.setAttribute("pose", "happy");
    setTimeout(() => { this.setAttribute("pose", pose); this._cheering = false; }, 1100);
  }
  /** Startled while `on` (the hero spirit when the download button is hovered): a jump with wide
   *  eyes and a "!", then it stays wide-eyed; off, back to what it was doing. */
  startle(on) {
    if (on && !this._from) {
      this._from = this.getAttribute("pose") || "idle";
      this.setAttribute("pose", "surprise");
    } else if (!on && this._from) {
      const back = this._from;
      this._from = null;
      this.setAttribute("pose", back);
    }
  }
  _aim(x, y) {
    this._aimAt = [x, y];
    // Something to look at instead of the pointer, while it is set (a function giving [x, y]).
    if (this.gazeAt) [x, y] = this.gazeAt();
    if (!this._look) return;
    const r = this.getBoundingClientRect();
    const cx = r.left + r.width * 0.55, cy = r.top + r.height * 0.45;
    const dx = x - cx, dy = y - cy, d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 160);
    this._look.style.transform = `translate(${(dx / d) * 3.2 * k}px,${(dy / d) * 2.4 * k}px)`;
  }
}
if (!customElements.get("kodama-spirit")) customElements.define("kodama-spirit", KodamaSpirit);
