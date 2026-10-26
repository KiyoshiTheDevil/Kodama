// The compact player's Cover / Lyrics / Video switch: one pill that slides to the chosen tab
// instead of the background jumping from button to button.
import { useLayoutEffect, useRef, useState } from "react";
import { useAnimations } from "../context.jsx";

const EASE = "cubic-bezier(0.22,1,0.36,1)";

export function SegmentedTabs({ items, value, onChange }) {
  const animations = useAnimations();
  const refs = useRef({});
  const [pill, setPill] = useState(null);
  const labels = items.map(([id, label]) => id + label).join("|");

  useLayoutEffect(() => {
    const measure = () => {
      const el = refs.current[value];
      if (el) setPill((p) => ({ x: el.offsetLeft, w: el.offsetWidth, placed: !!p }));
    };
    measure();
    // The labels change width once the app font has loaded.
    document.fonts?.ready.then(measure);
  }, [value, labels]);

  return (
    <div role="tablist" style={{ position: "relative", display: "flex", padding: 3, borderRadius: "var(--r-full)", background: "rgba(0,0,0,0.25)" }}>
      {pill && (
        <div aria-hidden="true" style={{
          position: "absolute", top: 3, bottom: 3, left: 0, width: pill.w,
          transform: `translateX(${pill.x}px)`, borderRadius: "var(--r-full)", background: "rgba(255,255,255,0.14)",
          // Not on the first placement, or it would slide in from the left edge.
          transition: animations && pill.placed ? `transform 0.32s ${EASE}, width 0.32s ${EASE}` : "none",
        }} />
      )}
      {items.map(([id, label]) => (
        <button key={id} ref={(el) => { refs.current[id] = el; }} type="button" role="tab" aria-selected={value === id} onClick={() => onChange(id)}
          style={{
            position: "relative", border: 0, cursor: "default", padding: "6px 14px", borderRadius: "var(--r-full)",
            fontSize: "var(--t12)", fontWeight: 600, fontFamily: "var(--font)", background: "transparent",
            color: value === id ? "#fff" : "rgba(255,255,255,0.65)", transition: "color 0.2s ease",
          }}>
          {label}
        </button>
      ))}
    </div>
  );
}
