// The equaliser on a phone, as a page of the app (the desktop's is a window of its own, which
// Android cannot open). Presets first: a small curve over the list, and "Adjust" grows the curve
// to full height with a point per band to drag up and down. Same state and storage as the
// desktop window (presets.js); the sound goes through web-eq.js.
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLang, useZoom } from "../context.jsx";
import { ArrowLeft, Check, Trash } from "../icons.jsx";
import { Slider, Toggle } from "../ui/settings-controls.jsx";
import { haptic } from "../haptics.js";
import { BANDS, BUILTIN, RANGE_DB, applyToCore, isBuiltin, loadState, normalizePreset, saveState } from "./presets.js";

const SMALL_H = 76;
const LARGE_H = 250;
const PAD_X = 20;
const PAD_Y = 18;
const label = (f) => (f >= 1000 ? `${f / 1000}k` : String(f));
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// A curve through every point that carries the direction of its neighbours (Catmull-Rom as
// Béziers): it passes exactly through each setting without the flat shoulders a curve with
// level tangents has at every point.
function spline(p) {
  let d = `M${p[0][0]} ${p[0][1]}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6} ${p1[1] + (p2[1] - p0[1]) / 6},${p2[0] - (p3[0] - p1[0]) / 6} ${p2[1] - (p3[1] - p1[1]) / 6},${p2[0]} ${p2[1]}`;
  }
  return d;
}

function Curve({ gains, height, editable, onDrag, onDragEnd }) {
  const ref = useRef(null);
  const [w, setW] = useState(320);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const mid = height / 2;
  const span = Math.max(1, height / 2 - PAD_Y - (editable ? 10 : 0));
  const xs = (i) => PAD_X + i * ((w - PAD_X * 2) / (BANDS.length - 1));
  const ys = (g) => mid - (g / RANGE_DB) * span;
  const pts = gains.map((g, i) => [xs(i), ys(g)]);
  const d = spline(pts);
  const drag = useRef(null);

  // The nearest point takes the touch: ten points on a phone's width lie some thirty pixels
  // apart, and hitting one exactly would be a matter of luck.
  const valueAt = (e) => {
    const r = ref.current.getBoundingClientRect();
    const y = (e.clientY - r.top) * (height / r.height);
    return Math.max(-RANGE_DB, Math.min(RANGE_DB, Math.round(((mid - y) / span) * RANGE_DB * 2) / 2));
  };
  const down = (e) => {
    if (!editable) return;
    const r = ref.current.getBoundingClientRect();
    const x = (e.clientX - r.left) * (w / r.width);
    let best = 0;
    for (let i = 1; i < BANDS.length; i++) if (Math.abs(xs(i) - x) < Math.abs(xs(best) - x)) best = i;
    drag.current = best;
    e.currentTarget.setPointerCapture(e.pointerId);
    onDrag(best, valueAt(e));
  };
  const move = (e) => { if (drag.current !== null) onDrag(drag.current, valueAt(e)); };
  const up = () => { if (drag.current !== null) { drag.current = null; onDragEnd(); } };

  return (
    <svg ref={ref} width="100%" height={height} viewBox={`0 0 ${w} ${height}`}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      style={{ display: "block", borderRadius: 16, background: "var(--bg-elevated)", touchAction: editable ? "none" : "auto" }}>
      <path d={`M0 ${mid} H${w}`} stroke="var(--border)" />
      {editable && <path d={`M0 ${ys(6)} H${w} M0 ${ys(-6)} H${w}`} stroke="var(--border)" strokeDasharray="2 4" />}
      <path d={`${d} L${xs(BANDS.length - 1)} ${mid} L${xs(0)} ${mid} Z`} fill="var(--accent)" opacity="0.14" />
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
      {editable && pts.map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="9" fill="#fff" />
          <text x={x} y={height - 6} textAnchor="middle" fontSize="10" fill="var(--text-muted)">{label(BANDS[i])}</text>
        </g>
      ))}
    </svg>
  );
}

export default function PhoneEqualizer({ onClose }) {
  const t = useLang();
  const zoom = useZoom();
  const [state, setState] = useState(loadState);
  const [adjust, setAdjust] = useState(false);
  const [height, setHeight] = useState(SMALL_H);
  const [hint, setHint] = useState("");
  const [saveName, setSaveName] = useState(null); // null: no name being typed
  useEffect(() => { saveState(state); applyToCore(state); }, [state]);

  // The curve grows into the editor and shrinks back, by hand rather than by CSS: its points are
  // laid out from the height, so the height has to be a number on every frame.
  useEffect(() => {
    const from = height, to = adjust ? LARGE_H : SMALL_H;
    if (from === to) return;
    const t0 = performance.now();
    let raf;
    const step = (now) => {
      const k = Math.min(1, (now - t0) / 320);
      const e = 1 - Math.pow(1 - k, 3);
      setHeight(Math.round(from + (to - from) * e));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [adjust]); // eslint-disable-line react-hooks/exhaustive-deps

  // Back: out of the editor first, then off the page.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      if (saveName !== null) setSaveName(null);
      else if (adjust) setAdjust(false);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [adjust, saveName, onClose]);

  const presets = [...BUILTIN.filter((p) => p.id !== "default"), ...state.custom];
  const current = presets.find((p) => p.id === state.presetId) || null;
  const dirty = !!current && (!same(current.gains, state.gains) || current.preamp !== state.preamp);

  const pick = (p) => { haptic("tick"); setState((s) => ({ ...s, enabled: true, presetId: p.id, preamp: p.preamp, gains: [...p.gains] })); };
  const lastTick = useRef(null);
  const drag = (i, v) => {
    if (lastTick.current !== `${i}:${v}`) { lastTick.current = `${i}:${v}`; haptic("tick"); }
    setHint(`${label(BANDS[i])} Hz: ${v > 0 ? "+" : ""}${v} dB`);
    setState((s) => (s.gains[i] === v ? s : { ...s, enabled: true, gains: s.gains.map((g, j) => (j === i ? v : g)) }));
  };
  const reset = () => setState((s) => ({ ...s, presetId: "flat", preamp: 0, gains: BANDS.map(() => 0) }));
  const save = () => {
    const clean = (saveName || "").trim();
    if (!clean) return;
    const existing = state.custom.find((p) => p.name.toLowerCase() === clean.toLowerCase());
    const preset = normalizePreset({ id: existing?.id, name: clean, preamp: state.preamp, gains: state.gains }, clean);
    setState((s) => ({ ...s, presetId: preset.id, custom: existing ? s.custom.map((p) => (p.id === existing.id ? preset : p)) : [...s.custom, preset] }));
    setSaveName(null);
    haptic("confirm");
  };
  const remove = (p) => setState((s) => ({ ...s, custom: s.custom.filter((x) => x.id !== p.id), presetId: s.presetId === p.id ? "" : s.presetId }));

  // On <body>, above the title bar and the tabs but below the sheets (100500), and zoomed by
  // hand there, as the sheets are: the UI zoom sits on the app's shell, which this is not in.
  return createPortal(
    <div style={{ position: "fixed", inset: 0, zIndex: 100000, zoom, background: "var(--bg-base)", display: "flex", flexDirection: "column",
      paddingTop: "var(--safe-top, env(safe-area-inset-top))", animation: "fadeSlideIn 0.26s cubic-bezier(0.22,1,0.36,1)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, height: 56, padding: "0 12px 0 8px", flexShrink: 0 }}>
        <button type="button" aria-label={t("back")} onClick={() => (adjust ? setAdjust(false) : onClose())}
          style={{ width: 40, height: 40, borderRadius: "50%", border: 0, background: "transparent", color: "var(--text-primary)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <ArrowLeft size={18} />
        </button>
        <div style={{ flex: 1, minWidth: 0, fontSize: "var(--t17, 17px)", fontWeight: 700 }}>{t("eqTitle")}</div>
        {adjust && hint && <span style={{ fontSize: "var(--t12)", color: "var(--accent)", fontVariantNumeric: "tabular-nums" }}>{hint}</span>}
        {!adjust && <Toggle value={state.enabled} onChange={(v) => setState((s) => ({ ...s, enabled: v }))} aria-label={t(state.enabled ? "eqDisable" : "eqEnable")} />}
      </div>

      <div className="scrollable" style={{ flex: 1, overflowY: "auto", padding: "4px 16px calc(24px + var(--safe-bottom-z, 0px))" }}>
        <div style={{ opacity: state.enabled ? 1 : 0.45, transition: "opacity 0.2s" }}>
          <Curve gains={state.gains} height={height} editable={adjust} onDrag={drag} onDragEnd={() => { lastTick.current = null; }} />
        </div>

        {adjust ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 18 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ fontSize: "var(--t13)", color: "var(--text-secondary)", flexShrink: 0 }}>{t("eqPreamp")}</span>
              <div style={{ flex: 1 }}>
                <Slider min={-RANGE_DB} max={RANGE_DB} step={0.5} value={state.preamp} width="100%" aria-label={t("eqPreamp")}
                  onChange={(v) => setState((s) => ({ ...s, enabled: true, preamp: v }))} />
              </div>
              <span style={{ width: 52, textAlign: "end", fontSize: "var(--t12)", color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>{state.preamp > 0 ? "+" : ""}{state.preamp} dB</span>
            </div>
            {saveName === null ? (
              <div style={{ display: "flex", gap: 8 }}>
                <button type="button" className="sheet-row" onClick={reset}
                  style={{ flex: 1, height: 42, borderRadius: 999, border: 0, background: "var(--bg-elevated)", color: "var(--text-primary)", fontFamily: "var(--font)", fontSize: "var(--t13)" }}>{t("reset")}</button>
                <button type="button" className="sheet-row" onClick={() => setSaveName(current && !isBuiltin(current.id) ? current.name : "")}
                  style={{ flex: 1, height: 42, borderRadius: 999, border: 0, background: "var(--bg-elevated)", color: "var(--text-primary)", fontFamily: "var(--font)", fontSize: "var(--t13)" }}>{t("eqSave")}</button>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 8 }}>
                <input autoFocus value={saveName} onChange={(e) => setSaveName(e.target.value)} placeholder={t("eqPresetName")}
                  onKeyDown={(e) => { if (e.key === "Enter") save(); }}
                  style={{ flex: 1, minWidth: 0, height: 42, borderRadius: 999, border: "1px solid var(--border)", background: "var(--bg-elevated)", color: "var(--text-primary)", padding: "0 16px", fontFamily: "var(--font)", fontSize: "var(--t14)" }} />
                <button type="button" onClick={save} aria-label={t("eqSave")}
                  style={{ width: 42, height: 42, borderRadius: "50%", border: 0, background: "var(--accent)", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Check size={16} /></button>
              </div>
            )}
          </div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", marginTop: 12 }}>
              {presets.map((p) => {
                const on = p.id === state.presetId;
                return (
                  <div key={p.id} className="sheet-row" onClick={() => pick(p)}
                    style={{ display: "flex", alignItems: "center", gap: 10, minHeight: 48, padding: "0 6px", borderRadius: 12, color: on ? "var(--accent)" : "var(--text-primary)", fontSize: "var(--t14)" }}>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {p.name}{on && dirty && <span style={{ marginInlineStart: 8, fontSize: "var(--t12)", color: "var(--text-muted)" }}>{t("eqModified")}</span>}
                    </span>
                    {on && <Check size={15} />}
                    {!isBuiltin(p.id) && (
                      <button type="button" aria-label={t("eqDeletePreset")} onClick={(e) => { e.stopPropagation(); remove(p); }}
                        style={{ width: 36, height: 36, borderRadius: "50%", border: 0, background: "transparent", color: "var(--text-muted)", display: "inline-flex", alignItems: "center", justifyContent: "center" }}><Trash size={14} /></button>
                    )}
                  </div>
                );
              })}
            </div>
            <button type="button" className="sheet-row" onClick={() => { haptic("tick"); setAdjust(true); }}
              style={{ width: "100%", height: 46, marginTop: 14, borderRadius: 14, border: 0, background: "var(--bg-elevated)", color: "var(--text-primary)", fontFamily: "var(--font)", fontSize: "var(--t14)", fontWeight: 600 }}>{t("eqAdjust")}</button>
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
