// Big Picture — shared top chrome for the tab-level screens (home / search / playlists / albums /
// artists): an icon tab bar (no pills, active tab gets an accent underline) plus the compact
// now-playing card on the right. Rendered inside each tab view's FocusContext so the tabs and the
// card are spatially focusable; LB/RB tab-switching is handled globally in BigPicture.
import { useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import { thumbHi } from "../context.jsx";
import { useNowPlaying } from "./playerBridge.js";
import { bpt } from "./bpI18n.js";

export const TABS = [
  { key: "home", labelKey: "home", icon: "house" },
  { key: "search", labelKey: "search", icon: "magnifying-glass" },
  { key: "playlists", labelKey: "playlists", icon: "list-music" },
  { key: "albums", labelKey: "albums", icon: "compact-disc" },
  { key: "artists", labelKey: "artists", icon: "microphone" },
];

function scrollPageTop(node) {
  const sc = node && node.closest && node.closest("[data-bigpicture]");
  if (sc) sc.scrollTo({ top: 0, behavior: "smooth" });
}

function Tab({ t, active, onSelect }) {
  const { ref, focused } = useFocusable({ onEnterPress: () => onSelect(t.key), onFocus: (l) => scrollPageTop(l && l.node) });
  const on = active === t.key;
  return (
    <div ref={ref} onClick={() => onSelect(t.key)} style={{
      position: "relative", display: "flex", alignItems: "center", gap: 9, padding: "6px 3px", cursor: "default",
      fontSize: 18, fontWeight: 600, color: (on || focused) ? "#fff" : "rgba(255,255,255,0.5)",
      transition: "color .14s",
    }}>
      <i className={`fa-solid fa-${t.icon}`} style={{ fontSize: 19 }} aria-hidden="true" />
      {bpt(t.labelKey)}
      {(on || focused) ? <span style={{ position: "absolute", left: -2, right: -2, bottom: -8, height: 3, borderRadius: 2, background: on ? "var(--accent)" : "rgba(255,255,255,0.4)" }} /> : null}
    </div>
  );
}

function NowCard({ onOpen }) {
  const np = useNowPlaying();
  const { ref, focused } = useFocusable({ onEnterPress: () => np.hasTrack && onOpen(), onFocus: (l) => scrollPageTop(l && l.node) });
  if (!np.hasTrack) return null;
  return (
    <div ref={ref} onClick={onOpen} style={{
      display: "flex", alignItems: "center", gap: 15, padding: "9px 12px 9px 10px", borderRadius: 15, cursor: "default", maxWidth: 360,
      background: focused ? "rgba(255,255,255,0.1)" : "transparent",
      outline: focused ? "3px solid var(--accent)" : "3px solid transparent",
      boxShadow: focused ? "0 0 0 5px color-mix(in srgb, var(--accent) 24%, transparent)" : "none",
      transition: "background .14s, box-shadow .14s, outline-color .14s",
    }}>
      <div style={{ width: 60, height: 60, borderRadius: 11, overflow: "hidden", flexShrink: 0, background: "linear-gradient(135deg,#2a1535,#17091f)" }}>
        {np.thumbnail ? <img src={thumbHi(np.thumbnail)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : null}
      </div>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--accent)", marginBottom: 3 }}>{bpt("nowPlaying")}</div>
        <div style={{ fontSize: 16, fontWeight: 600, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{np.title}</div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{np.artists}</div>
      </div>
    </div>
  );
}

export function TabChrome({ active, onSelectTab, onOpenNowPlaying }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 26, marginBottom: 30 }}>
      {TABS.map(t => <Tab key={t.key} t={t} active={active} onSelect={onSelectTab} />)}
      <div style={{ flex: 1 }} />
      <NowCard onOpen={onOpenNowPlaying} />
    </div>
  );
}
