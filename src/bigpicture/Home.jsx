// Big Picture — the home tab. The shared top chrome (icon tabs + now-playing card) followed by a
// "recently played" shelf from local history and the YT Music home feed (/home) rendered as
// horizontal card shelves. Type-aware: songs play, collections open their detail screen.
import { useEffect, useState } from "react";
import { FocusContext, useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import { API, thumbHi } from "../context.jsx";
import { sendPlay } from "./playerBridge.js";
import { setContextTarget } from "./bpContext.js";
import { trackContextActions } from "./Detail.jsx";

function readHistory() {
  try {
    const key = `kiyoshi-history-${window.__activeProfile || "default"}`;
    const arr = JSON.parse(localStorage.getItem(key) || "[]");
    const seen = new Set();
    return arr.filter(t => t && t.videoId && !seen.has(t.videoId) && seen.add(t.videoId)).slice(0, 20);
  } catch { return []; }
}

function artistsOf(item) {
  return Array.isArray(item.artists) ? item.artists.map(a => (a && a.name) || a).filter(Boolean).join(", ") : (item.artists || "");
}

function Card({ item, section, onOpenCard }) {
  const isArtist = item.type === "artist";
  const isSong = item.type === "song";
  const activate = () => {
    if (isSong) { sendPlay(item, (section.items || []).filter(x => x.type === "song")); return; }
    if (item.type === "playlist") { onOpenCard("playlists", { playlistId: item.playlistId, title: item.title, thumbnail: item.thumbnail }); return; }
    if (item.type === "album") { onOpenCard("albums", { browseId: item.browseId, title: item.title, thumbnail: item.thumbnail }); return; }
    if (isArtist) { onOpenCard("artists", { browseId: item.browseId, artist: item.title, title: item.title, thumbnail: item.thumbnail }); return; }
  };
  const { ref, focused } = useFocusable({
    onEnterPress: activate,
    onFocus: (l) => { if (isSong) setContextTarget(trackContextActions(item)); const n = l && l.node; if (n && n.scrollIntoView) n.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" }); },
  });
  const sub = isArtist ? "Künstler" : (item.type === "album" ? (item.year || artistsOf(item) || "Album") : (artistsOf(item) || (item.type === "playlist" ? "Playlist" : "")));
  return (
    <div ref={ref} onClick={activate} style={{ width: 176, flexShrink: 0, cursor: "default" }}>
      <div style={{
        width: 176, height: 176, borderRadius: isArtist ? "50%" : 14, overflow: "hidden", background: "linear-gradient(135deg,#2a1535,#17091f)",
        outline: focused ? "3px solid var(--accent)" : "3px solid transparent", outlineOffset: 3,
        boxShadow: focused ? "0 0 0 6px color-mix(in srgb, var(--accent) 30%, transparent), 0 14px 40px rgba(0,0,0,.5)" : "0 6px 18px rgba(0,0,0,.3)",
        transform: focused ? "scale(1.06)" : "scale(1)", transition: "transform .15s, box-shadow .15s, outline-color .15s",
      }}>
        {item.thumbnail ? <img src={thumbHi(item.thumbnail)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} /> : null}
      </div>
      <div style={{ marginTop: 10, color: "#fff", fontSize: 17, fontWeight: 600, textAlign: isArtist ? "center" : "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.title}</div>
      <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, textAlign: isArtist ? "center" : "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minHeight: "1.2em" }}>{sub || " "}</div>
    </div>
  );
}

function Shelf({ title, items, section, onOpenCard }) {
  if (!items || !items.length) return null;
  return (
    <div style={{ marginBottom: 36 }}>
      <div style={{ color: "#fff", fontSize: 23, fontWeight: 700, marginBottom: 14 }}>{title}</div>
      {/* overflow-x:auto clips vertically too — pad (cancelled by negative margin) so the focus
          ring isn't cut; centering on focus keeps a card off the scroll edges. */}
      <div style={{ display: "flex", gap: 20, overflowX: "auto", overflowY: "hidden", padding: 16, margin: -16, scrollPadding: "0 50%" }}>
        {items.map((it, i) => <Card key={it.videoId || it.playlistId || it.browseId || i} item={it} section={section || { items }} onOpenCard={onOpenCard} />)}
      </div>
    </div>
  );
}

export function Home({ chrome, onOpenCard }) {
  const [sections, setSections] = useState([]);
  const [history] = useState(readHistory);
  const { ref, focusKey, focusSelf } = useFocusable();

  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/home`).then(r => r.json())
      .then(d => { if (!cancelled) setSections((d.sections || []).map(s => ({ ...s, items: (s.items || []).filter(x => x && (x.videoId || x.browseId || x.playlistId)) })).filter(s => s.items.length)); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  useEffect(() => { const t = setTimeout(() => focusSelf(), 0); return () => clearTimeout(t); }, [focusSelf]);

  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref} style={{ minHeight: "100%", padding: "6vh 6vw", background: "radial-gradient(120% 80% at 50% -10%, #241033, #0a0a0f 60%)" }}>
        {chrome}
        {history.length ? <Shelf title="Zuletzt gespielt" items={history} onOpenCard={onOpenCard} /> : null}
        {sections.map((s, i) => <Shelf key={i} title={s.title} items={s.items} section={s} onOpenCard={onOpenCard} />)}
      </div>
    </FocusContext.Provider>
  );
}
