// Big Picture — the dynamic keybind hint bar, pinned to the bottom of every screen. Each screen
// passes context-relevant hints ({ kind, label }); the glyphs adapt to the last-used input device
// (controller buttons vs. keyboard caps) via the bpInput store. Symbol glyphs use Font Awesome.
import { useInputMode } from "./bpInput.js";

const S = {
  box: { position: "fixed", bottom: 22, zIndex: 2147483050, display: "flex", alignItems: "center", gap: 26, padding: "12px 22px", borderRadius: 15, pointerEvents: "none", background: "rgba(48,42,60,0.6)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", boxShadow: "0 10px 34px rgba(0,0,0,.38)" },
  hint: { display: "flex", alignItems: "center", gap: 11, fontSize: 16, fontWeight: 600, color: "rgba(255,255,255,0.9)" },
  cap: { minWidth: 30, height: 30, padding: "0 9px", borderRadius: 7, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", borderBottomWidth: 3, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 600, color: "#fff", flexShrink: 0 },
};

const fi = (name, size) => <i className={`fa-solid fa-${name}`} style={{ fontSize: size }} aria-hidden="true" />;
const pad = (src) => <img src={src} width="31" height="31" alt="" style={{ display: "block", flexShrink: 0 }} />;

function Glyph({ kind, mode }) {
  if (mode === "pad") {
    if (kind === "select") return pad("/a-button.svg");
    if (kind === "back") return pad("/b-button.svg");
    if (kind === "menu") return pad("/menu-button.svg");
    if (kind === "nav") return pad("/d-pad.svg");
    if (kind === "tabs") return <span style={{ display: "flex", gap: 6 }}>{pad("/left-shoulder-button.svg")}{pad("/right-shoulder-button.svg")}</span>;
  } else {
    if (kind === "select") return <span style={S.cap}>{fi("turn-down-left", 13)}</span>;
    if (kind === "back") return <span style={S.cap}>Esc</span>;
    if (kind === "menu") return <span style={S.cap}>M</span>;
    if (kind === "nav") return <span style={S.cap}>{fi("up-down-left-right", 13)}</span>;
    if (kind === "tabs") return <span style={{ display: "flex", gap: 6 }}><span style={S.cap}>Q</span><span style={S.cap}>E</span></span>;
  }
  return null;
}

export function Keybar({ hints }) {
  const mode = useInputMode();
  if (!hints || !hints.length) return null;
  const left = hints.filter(h => !h.right);
  const right = hints.filter(h => h.right);
  const render = (h, i) => (
    <span key={i} style={S.hint}><Glyph kind={h.kind} mode={mode} />{h.label}</span>
  );
  return (
    <>
      {left.length ? <div style={{ ...S.box, left: "3vw" }}>{left.map(render)}</div> : null}
      {right.length ? <div style={{ ...S.box, right: "3vw" }}>{right.map(render)}</div> : null}
    </>
  );
}
