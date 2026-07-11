// Gamepad → directional/action callbacks for Big Picture. Reads the first connected pad each
// frame (Standard Mapping, verified: 0=A 1=B 4=LB 5=RB 9=Menu 12/13/14/15=Dpad; ax0/ax1=L-stick).
// D-pad/buttons fire on press edge; the left stick fires once then auto-repeats while held.
import { useEffect } from "react";

export function useController({ active, onDirection, onEnter, onBack, onButton }) {
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const prev = [];
    let stickDir = null, stickNext = 0;
    const DEAD = 0.55, FIRST_MS = 380, REPEAT_MS = 140;

    const poll = () => {
      const pads = navigator.getGamepads ? navigator.getGamepads() : [];
      let g = null;
      for (const p of pads) { if (p) { g = p; break; } }
      if (g) {
        const down = (i) => !!(g.buttons[i] && g.buttons[i].pressed);
        const edge = (i) => down(i) && !prev[i];
        if (edge(0)) onEnter?.();
        if (edge(1)) onBack?.();
        if (edge(12)) onDirection?.("up");
        if (edge(13)) onDirection?.("down");
        if (edge(14)) onDirection?.("left");
        if (edge(15)) onDirection?.("right");
        if (edge(4)) onButton?.("lb");
        if (edge(5)) onButton?.("rb");
        if (edge(9)) onButton?.("menu");
        if (edge(10)) onButton?.("l3"); // left stick press

        // Left stick → a direction that fires once, then repeats while held.
        const ax = g.axes[0] || 0, ay = g.axes[1] || 0;
        let d = null;
        if (ay <= -DEAD) d = "up"; else if (ay >= DEAD) d = "down";
        else if (ax <= -DEAD) d = "left"; else if (ax >= DEAD) d = "right";
        const now = performance.now();
        if (d) {
          if (d !== stickDir) { onDirection?.(d); stickDir = d; stickNext = now + FIRST_MS; }
          else if (now >= stickNext) { onDirection?.(d); stickNext = now + REPEAT_MS; }
        } else {
          stickDir = null;
        }

        for (let i = 0; i < g.buttons.length; i++) prev[i] = down(i);
      }
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  }, [active, onDirection, onEnter, onBack, onButton]);
}
