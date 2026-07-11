// Big Picture UI sounds — synthesized on the fly with the Web Audio API (no asset files, no CSP
// worries). Short, subtle blips for navigation / select / back / menu, in the spirit of console
// and Steam Big Picture menus. Toggleable + persisted; the AudioContext is primed on open so the
// first blip isn't blocked by the browser's autoplay policy.
let ctx = null;
let enabled = (() => { try { return localStorage.getItem("kodama-bp-sounds") !== "false"; } catch { return true; } })();

export function soundsEnabled() { return enabled; }
export function setSoundsEnabled(v) {
  enabled = !!v;
  try { localStorage.setItem("kodama-bp-sounds", enabled ? "true" : "false"); } catch {}
}

function ac() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch { return null; }
  }
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

// Prime the context during a real user gesture (F10 open) so later gamepad-triggered blips play.
export function initSounds() { ac(); }

function blip({ freq = 600, to = null, type = "sine", dur = 0.05, gain = 0.09, delay = 0 }) {
  if (!enabled) return;
  const a = ac();
  if (!a) return;
  const t0 = a.currentTime + delay;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(a.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

export const playNav    = () => blip({ freq: 340, type: "sine", dur: 0.055, gain: 0.033 });
export const playSelect = () => blip({ freq: 440, to: 620, type: "sine", dur: 0.11, gain: 0.08 });
export const playBack   = () => blip({ freq: 340, to: 220, type: "sine", dur: 0.11, gain: 0.065 });
export const playOpen   = () => { blip({ freq: 330, type: "triangle", dur: 0.07, gain: 0.06 }); blip({ freq: 500, type: "sine", dur: 0.11, gain: 0.05, delay: 0.055 }); };
