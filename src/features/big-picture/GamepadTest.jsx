// TEMPORARY gamepad spike for the Big Picture mode plan. Verifies that the Gamepad API
// actually delivers controller input inside the Tauri WebView2. Toggle with F9.
// If pressing buttons here lights them up, the browser-side input path works and we can build
// Big Picture's input layer in JS. If NOT, we'll need a Rust-side gamepad reader (gilrs) → IPC.
// Mounted in main.jsx next to <App/> so it doesn't touch App.jsx. Remove once validated.
import { useEffect, useRef, useState } from "react";

export function GamepadTest() {
  const [visible, setVisible] = useState(false);
  const [pads, setPads] = useState([]); // snapshot of connected gamepads' live state
  const [events, setEvents] = useState([]); // recent connect/disconnect log
  const rafRef = useRef(0);

  // F9 toggles the overlay.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "F9") {
        e.preventDefault();
        setVisible((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const log = (msg) =>
      setEvents((ev) => [`${new Date().toLocaleTimeString()}  ${msg}`, ...ev].slice(0, 8));
    const onConn = (e) => log(`connected: [${e.gamepad.index}] ${e.gamepad.id}`);
    const onDisc = (e) => log(`disconnected: [${e.gamepad.index}] ${e.gamepad.id}`);
    window.addEventListener("gamepadconnected", onConn);
    window.addEventListener("gamepaddisconnected", onDisc);
    return () => {
      window.removeEventListener("gamepadconnected", onConn);
      window.removeEventListener("gamepaddisconnected", onDisc);
    };
  }, []);

  // Poll the Gamepad API while the overlay is visible.
  useEffect(() => {
    if (!visible) return;
    const poll = () => {
      const gp = navigator.getGamepads ? navigator.getGamepads() : [];
      const snap = [];
      for (const g of gp) {
        if (!g) continue;
        snap.push({
          index: g.index,
          id: g.id,
          mapping: g.mapping,
          buttons: g.buttons.map((b) => ({ pressed: b.pressed, value: b.value })),
          axes: g.axes.map((a) => a),
        });
      }
      setPads(snap);
      rafRef.current = requestAnimationFrame(poll);
    };
    rafRef.current = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(rafRef.current);
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 2147483000,
        background: "rgba(6,6,10,0.96)",
        color: "#eee",
        font: "13px/1.5 ui-monospace, monospace",
        padding: 24,
        overflow: "auto",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        <span style={{ fontSize: 20, fontWeight: 700, color: "#e040fb" }}>🎮 Gamepad Spike</span>
        <span style={{ opacity: 0.6 }}>Gamepad API in WebView2 — press F9 to close</span>
      </div>

      <div
        style={{
          marginBottom: 16,
          padding: 12,
          borderRadius: 8,
          background: "rgba(255,255,255,0.05)",
        }}
      >
        <div style={{ fontWeight: 700, marginBottom: 4 }}>
          {pads.length
            ? `✅ ${pads.length} controller(s) delivering input`
            : "⌛ No controller data yet — connect one and PRESS A BUTTON"}
        </div>
        <div style={{ opacity: 0.65 }}>
          Browsers only expose a gamepad after its first button press.
        </div>
      </div>

      {pads.map((p) => (
        <div
          key={p.index}
          style={{
            marginBottom: 20,
            padding: 14,
            borderRadius: 10,
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(224,64,251,0.3)",
          }}
        >
          <div style={{ fontWeight: 700, color: "#e040fb", marginBottom: 8 }}>
            [{p.index}] {p.id}{" "}
            <span style={{ opacity: 0.5, fontWeight: 400 }}>
              · mapping: {p.mapping || "(none)"}
            </span>
          </div>
          <div style={{ marginBottom: 6, opacity: 0.7 }}>Buttons</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12 }}>
            {p.buttons.map((b, i) => (
              <span
                key={i}
                style={{
                  minWidth: 34,
                  textAlign: "center",
                  padding: "3px 6px",
                  borderRadius: 6,
                  background: b.pressed ? "#e040fb" : "rgba(255,255,255,0.08)",
                  color: b.pressed ? "#fff" : "#aaa",
                  fontWeight: b.pressed ? 700 : 400,
                }}
                title={`button ${i}`}
              >
                {i}
                {b.value > 0 && b.value < 1 ? `·${b.value.toFixed(1)}` : ""}
              </span>
            ))}
          </div>
          <div style={{ marginBottom: 6, opacity: 0.7 }}>Axes</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {p.axes.map((a, i) => (
              <span key={i} style={{ color: Math.abs(a) > 0.15 ? "#e040fb" : "#aaa" }}>
                ax{i}: {a.toFixed(2)}
              </span>
            ))}
          </div>
        </div>
      ))}

      <div style={{ marginTop: 12, opacity: 0.6 }}>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>Connection log</div>
        {events.length ? events.map((e, i) => <div key={i}>{e}</div>) : <div>(none yet)</div>}
      </div>
    </div>
  );
}
