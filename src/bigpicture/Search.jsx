// Big Picture — search screen. On-screen keyboard (controller-typeable) + live song results.
// Selecting a result plays it via the player bridge. Keyboard keys and result rows are all
// focusable, so the controller/keyboard flows between them by geometry.
import { useCallback, useEffect, useRef, useState } from "react";
import { FocusContext, useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import { API, thumbHi } from "../context.jsx";
import { sendPlay } from "./playerBridge.js";
import { setContextTarget } from "./bpContext.js";
import { trackContextActions } from "./Detail.jsx";
import { MagnifyingGlass, Play } from "../icons.jsx";

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const NUMS = "0123456789".split("");

function KeyBtn({ children, onPress, span, active }) {
  const { ref, focused } = useFocusable({ onEnterPress: onPress });
  return (
    <div ref={ref} onClick={onPress} style={{
      gridColumn: span ? `span ${span}` : undefined,
      minHeight: 56, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: 22, fontWeight: 600, cursor: "default",
      color: active && !focused ? "var(--accent)" : "#fff",
      background: focused ? "var(--accent)" : (active ? "color-mix(in srgb, var(--accent) 22%, rgba(255,255,255,0.07))" : "rgba(255,255,255,0.07)"),
      outline: focused ? "3px solid var(--accent)" : "3px solid transparent",
      boxShadow: focused ? "0 0 0 5px color-mix(in srgb, var(--accent) 28%, transparent)" : "none",
      transform: focused ? "scale(1.08)" : "scale(1)", transition: "transform .12s, background .12s, box-shadow .12s, outline-color .12s, color .12s",
    }}>{children}</div>
  );
}

function Keyboard({ onKey, caps, onShift }) {
  const upper = caps !== "off";
  return (
    <div style={{ width: 560, flexShrink: 0, display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 10 }}>
        {LETTERS.map(k => <KeyBtn key={k} onPress={() => onKey(k)}>{upper ? k : k.toLowerCase()}</KeyBtn>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(10, 1fr)", gap: 10 }}>
        {NUMS.map(k => <KeyBtn key={k} onPress={() => onKey(k)}>{k}</KeyBtn>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 10 }}>
        <KeyBtn active={upper} onPress={onShift} title={caps === "lock" ? "Feststell (LB/RB)" : "Shift (LB/RB)"}>{caps === "lock" ? "⇪" : "⇧"}</KeyBtn>
        <KeyBtn span={3} onPress={() => onKey(" ")}>Leer</KeyBtn>
        <KeyBtn onPress={() => onKey("\b")}>⌫</KeyBtn>
        <KeyBtn span={2} onPress={() => onKey("clear")}>Löschen</KeyBtn>
      </div>
    </div>
  );
}

function ResultRow({ track }) {
  const { ref, focused } = useFocusable({
    onEnterPress: () => sendPlay(track),
    onFocus: (l) => { setContextTarget(trackContextActions(track)); const n = l && l.node; if (n && n.scrollIntoView) n.scrollIntoView({ block: "nearest", behavior: "smooth" }); },
  });
  const artists = Array.isArray(track.artists) ? track.artists.map(a => (a && a.name) || a).filter(Boolean).join(", ") : (track.artists || "");
  return (
    <div ref={ref} onClick={() => sendPlay(track)} style={{
      display: "flex", alignItems: "center", gap: 16, padding: "10px 14px", borderRadius: 12, cursor: "default",
      background: focused ? "rgba(255,255,255,0.10)" : "transparent",
      outline: focused ? "3px solid var(--accent)" : "3px solid transparent",
      transition: "background .12s, outline-color .12s",
    }}>
      <div style={{ width: 52, height: 52, borderRadius: 8, overflow: "hidden", flexShrink: 0, background: "linear-gradient(135deg,#2a1535,#17091f)" }}>
        {track.thumbnail ? <img src={thumbHi(track.thumbnail)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : null}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: "#fff", fontSize: 18, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{track.title}</div>
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{artists}</div>
      </div>
      {focused ? <Play size={20} weight="fill" style={{ color: "var(--accent)", flexShrink: 0 }} /> : null}
    </div>
  );
}

export function Search({ chrome }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [caps, setCaps] = useState("off"); // "off" | "shift" (one-shot) | "lock" (caps lock)
  const capsRef = useRef("off");
  capsRef.current = caps;
  const lastShift = useRef(0);
  const { ref, focusKey, focusSelf } = useFocusable();

  // Shift: single tap = one-shot (next letter caps, then off); double tap = caps lock;
  // tap again while shift/lock = off. Stable (reads refs) so the controller bind can call it too.
  const onShift = useCallback(() => {
    const now = Date.now();
    const dbl = now - lastShift.current < 350;
    lastShift.current = now;
    setCaps(c => (dbl ? "lock" : (c === "off" ? "shift" : "off")));
  }, []);

  // Controller LB/RB toggles case (BigPicture dispatches "bp-shift" on those buttons).
  useEffect(() => {
    const h = () => onShift();
    window.addEventListener("bp-shift", h);
    return () => window.removeEventListener("bp-shift", h);
  }, [onShift]);

  useEffect(() => { const t = setTimeout(() => focusSelf(), 0); return () => clearTimeout(t); }, [focusSelf]);

  useEffect(() => {
    const q = query.trim();
    if (!q) { setResults([]); setLoading(false); return; }
    setLoading(true);
    const timer = setTimeout(() => {
      fetch(`${API}/search?q=${encodeURIComponent(q)}&filter=songs`)
        .then(r => r.json())
        .then(d => setResults(d.results || []))
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  const onKey = useCallback((k) => {
    if (k === "\b") { setQuery(q => q.slice(0, -1)); return; }
    if (k === "clear") { setQuery(""); return; }
    let ch = k;
    if (k.length === 1 && k >= "A" && k <= "Z") {
      const c = capsRef.current;
      ch = c === "off" ? k.toLowerCase() : k;
      if (c === "shift") setCaps("off"); // one-shot consumed
    }
    setQuery(q => q + ch);
  }, []);

  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref} style={{ minHeight: "100%", padding: "6vh 6vw", background: "radial-gradient(120% 80% at 50% -10%, #241033, #0a0a0f 60%)" }}>
        {chrome}
        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, marginBottom: 22 }}>Linken Stick drücken (L3) wechselt Groß-/Kleinschreibung</div>
        <div style={{ display: "flex", alignItems: "center", gap: 14, background: "rgba(255,255,255,0.06)", borderRadius: 14, padding: "16px 22px", marginBottom: 30 }}>
          <MagnifyingGlass size={26} style={{ color: "rgba(255,255,255,0.5)" }} />
          <span style={{ color: query ? "#fff" : "rgba(255,255,255,0.35)", fontSize: 26, fontWeight: 600 }}>{query || "Songs suchen…"}</span>
          <span style={{ width: 2, height: 30, background: "var(--accent)", marginLeft: 2, animation: "bpCaret 1s step-end infinite" }} />
        </div>
        <div style={{ display: "flex", gap: 48, alignItems: "flex-start" }}>
          <Keyboard onKey={onKey} caps={caps} onShift={onShift} />
          <div style={{ flex: 1, minWidth: 0 }}>
            {!query.trim() ? (
              <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 18, padding: "20px 0" }}>Tippe etwas, um zu suchen.</div>
            ) : loading && !results.length ? (
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 18, padding: "20px 0" }}>Sucht…</div>
            ) : !results.length ? (
              <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 18, padding: "20px 0" }}>Nichts gefunden.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {results.map((tr, i) => <ResultRow key={tr.videoId || i} track={tr} />)}
              </div>
            )}
          </div>
        </div>
      </div>
    </FocusContext.Provider>
  );
}
