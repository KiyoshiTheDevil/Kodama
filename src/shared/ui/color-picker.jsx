// Kodama color picker — a self-contained popover (saturation/brightness gradient +
// hue slider + hex/rgb/hsl input + optional EyeDropper + preset & recent swatches),
// styled to match the app instead of the browser-native <input type="color"> picker.
// Shared by the settings accent picker and the overlay editor's inspector color fields.
import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Eyedropper, X, DotsSixVertical } from "@/shared/icons/icons.jsx";

// ── Color conversions ─────────────────────────────────────────────────────────
function _hexToHsv(hex) {
  if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return { h: 0, s: 0, v: 0 };
  let r = parseInt(hex.slice(1, 3), 16) / 255;
  let g = parseInt(hex.slice(3, 5), 16) / 255;
  let b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min;
  const v = max;
  const s = max === 0 ? 0 : d / max;
  let h = 0;
  if (d !== 0) {
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }
  return { h: h * 360, s, v };
}

function _hsvToHex(h, s, v) {
  h = h / 360;
  let r, g, b;
  const i = Math.floor(h * 6),
    f = h * 6 - i;
  const p = v * (1 - s),
    q = v * (1 - f * s),
    t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0:
      r = v;
      g = t;
      b = p;
      break;
    case 1:
      r = q;
      g = v;
      b = p;
      break;
    case 2:
      r = p;
      g = v;
      b = t;
      break;
    case 3:
      r = p;
      g = q;
      b = v;
      break;
    case 4:
      r = t;
      g = p;
      b = v;
      break;
    case 5:
      r = v;
      g = p;
      b = q;
      break;
    default:
      r = g = b = 0;
  }
  return (
    "#" +
    [r, g, b]
      .map((x) =>
        Math.round(x * 255)
          .toString(16)
          .padStart(2, "0")
      )
      .join("")
  );
}

function _hexToRgb(hex) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}
function _rgbToHex(r, g, b) {
  const c = (x) =>
    Math.max(0, Math.min(255, Math.round(x)))
      .toString(16)
      .padStart(2, "0");
  return "#" + c(r) + c(g) + c(b);
}
function _hexToHsl(hex) {
  let { r, g, b } = _hexToRgb(hex);
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    d = max - min;
  const l = (max + min) / 2;
  let h = 0,
    s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      case b:
        h = ((r - g) / d + 4) / 6;
        break;
    }
  }
  return { h: h * 360, s: s * 100, l: l * 100 };
}
function _hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) {
    r = c;
    g = x;
  } else if (h < 120) {
    r = x;
    g = c;
  } else if (h < 180) {
    g = c;
    b = x;
  } else if (h < 240) {
    g = x;
    b = c;
  } else if (h < 300) {
    r = x;
    b = c;
  } else {
    r = c;
    b = x;
  }
  return _rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
}

// Format the current hex for the selected input mode, and parse edits back to hex.
function _format(hex, mode) {
  if (mode === "rgb") {
    const { r, g, b } = _hexToRgb(hex);
    return `${r}, ${g}, ${b}`;
  }
  if (mode === "hsl") {
    const { h, s, l } = _hexToHsl(hex);
    return `${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%`;
  }
  return hex.slice(1).toUpperCase();
}
function _parse(text, mode) {
  if (mode === "hex") {
    const t = text.replace(/[^0-9a-fA-F]/g, "").slice(0, 6);
    return t.length === 6 ? "#" + t : null;
  }
  const nums = text.match(/-?\d+(\.\d+)?/g);
  if (!nums || nums.length < 3) return null;
  const [a, b, c] = nums.map(Number);
  return mode === "rgb" ? _rgbToHex(a, b, c) : _hslToHex(a, b, c);
}

const RECENTS_KEY = "kodama-color-recents";
function _loadRecents() {
  try {
    const a = JSON.parse(localStorage.getItem(RECENTS_KEY));
    return Array.isArray(a) ? a.filter((x) => /^#[0-9a-fA-F]{6}$/.test(x)).slice(0, 8) : [];
  } catch {
    return [];
  }
}
function _pushRecent(hex) {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
  try {
    const a = _loadRecents().filter((x) => x.toLowerCase() !== hex.toLowerCase());
    a.unshift(hex);
    localStorage.setItem(RECENTS_KEY, JSON.stringify(a.slice(0, 8)));
  } catch {
    // Recent colors are optional when storage is unavailable.
  }
}
const PRESETS = [
  "#FFFFFF",
  "#D4D4D4",
  "#9CA3AF",
  "#4B5563",
  "#1F2937",
  "#000000",
  "#EF4444",
  "#F97316",
  "#F59E0B",
  "#EAB308",
  "#84CC16",
  "#22C55E",
  "#10B981",
  "#06B6D4",
  "#3B82F6",
  "#6366F1",
  "#8B5CF6",
  "#A855F7",
  "#D946EF",
  "#EC4899",
  "#F43F5E",
  "#0AFFFB",
];

// value/onChange are #RRGGBB. `swatch` overrides the trigger's size/style (e.g. a small
// inline swatch inside a field); default is a standalone 32px chip.
export function ColorPicker({ value, onChange, swatch }) {
  const safe = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#000000";
  const [open, setOpen] = useState(false);
  const [hsv, setHsv] = useState(() => _hexToHsv(safe));
  const [mode, setMode] = useState("hex"); // hex | rgb | hsl
  const [fmtOpen, setFmtOpen] = useState(false); // format dropdown
  const [valText, setValText] = useState(() => _format(safe, "hex"));
  const [recents, setRecents] = useState(_loadRecents);
  const editing = useRef(false);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const gradientRef = useRef(null);
  const hueRef = useRef(null);
  const curHexRef = useRef(safe);
  const [popPos, setPopPos] = useState({ top: 0, left: 0 });

  const currentHex = _hsvToHex(hsv.h, hsv.s, hsv.v);
  curHexRef.current = currentHex;

  // Reflect external value + format changes into the text field (unless the user is typing).
  useEffect(() => {
    if (/^#[0-9a-fA-F]{6}$/.test(value)) setHsv(_hexToHsv(value));
  }, [value]);
  useEffect(() => {
    if (!editing.current) setValText(_format(currentHex, mode));
  }, [currentHex, mode]);

  const openPicker = () => {
    const r = triggerRef.current.getBoundingClientRect();
    setPopPos({ top: r.bottom + 8, left: Math.max(8, r.right - 244) });
    setRecents(_loadRecents());
    setOpen(true);
  };
  const close = () => {
    _pushRecent(curHexRef.current);
    setOpen(false);
    setFmtOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target)
      )
        close();
    };
    document.addEventListener("pointerdown", handler);
    return () => document.removeEventListener("pointerdown", handler);
  }, [open]);

  // Keep the popover inside the viewport (it can otherwise be clipped when the trigger is
  // near the bottom/right edge). Measured after mount, once per open.
  useLayoutEffect(() => {
    if (!open || !popoverRef.current) return;
    const rect = popoverRef.current.getBoundingClientRect();
    let top = popPos.top,
      left = popPos.left;
    if (top + rect.height > window.innerHeight - 8)
      top = Math.max(8, window.innerHeight - rect.height - 8);
    if (left + rect.width > window.innerWidth - 8)
      left = Math.max(8, window.innerWidth - rect.width - 8);
    if (top !== popPos.top || left !== popPos.left) setPopPos({ top, left });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Drag the popover by its header (Figma-style repositioning).
  const startDrag = (e) => {
    if (e.target.closest("[data-no-drag]")) return;
    e.preventDefault();
    const rect = popoverRef.current.getBoundingClientRect();
    const ox = e.clientX - rect.left,
      oy = e.clientY - rect.top;
    const move = (ev) => {
      const left = Math.max(8, Math.min(window.innerWidth - rect.width - 8, ev.clientX - ox));
      const top = Math.max(8, Math.min(window.innerHeight - rect.height - 8, ev.clientY - oy));
      setPopPos({ top, left });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", () => window.removeEventListener("pointermove", move), {
      once: true,
    });
  };

  const applyHsv = (newHsv) => {
    setHsv(newHsv);
    onChange(_hsvToHex(newHsv.h, newHsv.s, newHsv.v));
  };
  const applyHex = (hex) => {
    setHsv(_hexToHsv(hex));
    onChange(hex);
  };

  const makeDragger = (ref, onDrag) => (e) => {
    e.preventDefault();
    const move = (ev) => onDrag(ev.clientX, ev.clientY, ref.current.getBoundingClientRect());
    move(e);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", () => window.removeEventListener("pointermove", move), {
      once: true,
    });
  };
  const onGradientDrag = makeDragger(gradientRef, (cx, cy, rect) => {
    const s = Math.max(0, Math.min(1, (cx - rect.left) / rect.width));
    const v = Math.max(0, Math.min(1, 1 - (cy - rect.top) / rect.height));
    applyHsv({ ...hsv, s, v });
  });
  const onHueDrag = makeDragger(hueRef, (cx, _cy, rect) => {
    const h = Math.max(0, Math.min(360, ((cx - rect.left) / rect.width) * 360));
    applyHsv({ ...hsv, h });
  });

  const hueColor = `hsl(${hsv.h},100%,50%)`;
  const swatchGrid = [...recents, ...PRESETS]
    .filter((c, i, a) => a.findIndex((x) => x.toLowerCase() === c.toLowerCase()) === i)
    .slice(0, 24);

  return (
    <>
      <div
        ref={triggerRef}
        onClick={openPicker}
        style={{
          width: 32,
          height: 32,
          borderRadius: 8,
          border: "0.5px solid var(--border)",
          cursor: "default",
          flexShrink: 0,
          ...(swatch || {}),
          background: safe, // live color always wins over any swatch override
        }}
      />

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            style={{
              position: "fixed",
              top: popPos.top,
              left: popPos.left,
              zIndex: 9999,
              width: 244,
              padding: 12,
              borderRadius: 14,
              background: "#1c1c1c",
              border: "0.5px solid rgba(255,255,255,0.12)",
              boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
              userSelect: "none",
            }}
          >
            {/* Drag header — move the panel (Figma-style), with a close button */}
            <div
              onPointerDown={startDrag}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                height: 20,
                marginBottom: 8,
                cursor: "move",
                color: "var(--text-muted)",
              }}
            >
              <DotsSixVertical size={14} />
              <button
                data-no-drag
                onClick={close}
                aria-label="Close"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 20,
                  height: 20,
                  borderRadius: 6,
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "default",
                }}
              >
                <X size={13} />
              </button>
            </div>
            {/* Gradient square */}
            <div
              ref={gradientRef}
              onPointerDown={onGradientDrag}
              style={{
                width: "100%",
                height: 160,
                borderRadius: 10,
                background: `linear-gradient(to right, #fff, ${hueColor})`,
                position: "relative",
                cursor: "crosshair",
                marginBottom: 10,
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: "linear-gradient(to bottom, transparent, #000)",
                  borderRadius: 10,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  left: `${hsv.s * 100}%`,
                  top: `${(1 - hsv.v) * 100}%`,
                  transform: "translate(-50%, -50%)",
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  border: "2px solid #fff",
                  boxShadow: "0 1px 6px rgba(0,0,0,0.5)",
                  background: currentHex,
                  pointerEvents: "none",
                }}
              />
            </div>

            {/* Hue slider */}
            <div
              ref={hueRef}
              onPointerDown={onHueDrag}
              style={{
                width: "100%",
                height: 14,
                borderRadius: 7,
                background: "linear-gradient(to right,#f00,#ff0,#0f0,#0ff,#00f,#f0f,#f00)",
                position: "relative",
                cursor: "default",
                marginBottom: 12,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: `${(hsv.h / 360) * 100}%`,
                  top: "50%",
                  transform: "translate(-50%, -50%)",
                  width: 18,
                  height: 18,
                  borderRadius: "50%",
                  border: "2.5px solid #fff",
                  boxShadow: "0 1px 6px rgba(0,0,0,0.5)",
                  background: hueColor,
                  pointerEvents: "none",
                }}
              />
            </div>

            {/* Eyedropper + format dropdown + value input */}
            <div
              style={{
                display: "flex",
                gap: 6,
                alignItems: "center",
                marginBottom: swatchGrid.length ? 12 : 0,
              }}
            >
              {window.EyeDropper && (
                <button
                  title="Farbpipette"
                  onClick={async () => {
                    try {
                      const dropper = new window.EyeDropper();
                      const { sRGBHex } = await dropper.open();
                      applyHex(sRGBHex);
                    } catch {
                      // Closing the native picker rejects the request.
                    }
                  }}
                  style={{
                    width: 30,
                    height: 30,
                    flexShrink: 0,
                    borderRadius: 8,
                    background: "var(--bg-elevated)",
                    border: "0.5px solid rgba(255,255,255,0.12)",
                    color: "var(--text-muted)",
                    cursor: "default",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Eyedropper size={15} />
                </button>
              )}
              {/* Format dropdown */}
              <div style={{ position: "relative", flexShrink: 0 }}>
                <button
                  onClick={() => setFmtOpen((o) => !o)}
                  style={{
                    height: 30,
                    padding: "0 8px",
                    borderRadius: 8,
                    minWidth: 56,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 4,
                    background: "var(--bg-elevated)",
                    border: "0.5px solid rgba(255,255,255,0.12)",
                    color: "var(--text-primary)",
                    fontSize: "var(--t12)",
                    cursor: "default",
                  }}
                >
                  {mode.toUpperCase()}
                  <span style={{ color: "var(--text-muted)", fontSize: 10 }}>▾</span>
                </button>
                {fmtOpen && (
                  <div
                    style={{
                      position: "absolute",
                      top: 34,
                      left: 0,
                      zIndex: 1,
                      minWidth: 72,
                      padding: 4,
                      borderRadius: 8,
                      background: "#242424",
                      border: "0.5px solid rgba(255,255,255,0.12)",
                      boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                    }}
                  >
                    {["hex", "rgb", "hsl"].map((f) => (
                      <button
                        key={f}
                        onClick={() => {
                          setMode(f);
                          setFmtOpen(false);
                        }}
                        style={{
                          display: "block",
                          width: "100%",
                          textAlign: "left",
                          padding: "6px 8px",
                          borderRadius: 6,
                          background: f === mode ? "rgba(255,255,255,0.08)" : "none",
                          border: "none",
                          color: "var(--text-primary)",
                          fontSize: "var(--t12)",
                          cursor: "default",
                        }}
                      >
                        {f.toUpperCase()}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Value input */}
              <input
                value={valText}
                onFocus={() => {
                  editing.current = true;
                }}
                onChange={(e) => {
                  setValText(e.target.value);
                  const hex = _parse(e.target.value, mode);
                  if (hex) applyHex(hex);
                }}
                onBlur={() => {
                  editing.current = false;
                  setValText(_format(curHexRef.current, mode));
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === "Escape") {
                    editing.current = false;
                    e.currentTarget.blur();
                    if (e.key === "Escape") close();
                  }
                }}
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: 30,
                  boxSizing: "border-box",
                  padding: "0 10px",
                  borderRadius: 8,
                  background: "var(--bg-elevated)",
                  border: "0.5px solid rgba(255,255,255,0.12)",
                  color: "var(--text-primary)",
                  fontSize: "var(--t12)",
                  fontFamily: "monospace",
                  outline: "none",
                  letterSpacing: "0.03em",
                }}
              />
            </div>

            {/* Preset + recent swatches */}
            {swatchGrid.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 6 }}>
                {swatchGrid.map((c) => (
                  <button
                    key={c}
                    title={c}
                    onClick={() => applyHex(c)}
                    style={{
                      width: "100%",
                      aspectRatio: "1",
                      borderRadius: 6,
                      background: c,
                      border:
                        c.toLowerCase() === currentHex.toLowerCase()
                          ? "2px solid var(--accent)"
                          : "0.5px solid rgba(255,255,255,0.15)",
                      cursor: "default",
                      padding: 0,
                    }}
                  />
                ))}
              </div>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
