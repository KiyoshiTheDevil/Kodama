// The compact layout has no sidebar, so what it held comes to the top of the library: Liked
// Songs, History and Downloads as shortcuts, then the pinned and the recently opened items as
// rows of covers. Same storage as the sidebar (kiyoshi-pinned-/kiyoshi-recent-<profile>) and
// the same events, so a pin made anywhere shows up here at once.
import { useState, useEffect, useCallback } from "react";
import { thumb, useLang } from "../context.jsx";
import { Heart, ClockCounterClockwise, DownloadSimple, Playlist, VinylRecord, Microphone } from "../icons.jsx";

function readList(kind) {
  const p = window.__activeProfile || "default";
  try { return JSON.parse(localStorage.getItem(`kiyoshi-${kind}-${p}`) || "[]"); } catch { return []; }
}

export function LibraryShortcuts({ onOpenLiked, onOpenView, onOpenPlaylist, onOpenAlbum, onOpenArtist, onContextMenu }) {
  const t = useLang();
  const [pinned, setPinned] = useState(() => readList("pinned"));
  const [recent, setRecent] = useState(() => readList("recent"));
  const sync = useCallback(() => { setPinned(readList("pinned")); setRecent(readList("recent")); }, []);
  useEffect(() => {
    const evs = ["kiyoshi-pins-updated", "kiyoshi-recent-updated", "profile-switched"];
    evs.forEach((e) => window.addEventListener(e, sync));
    return () => evs.forEach((e) => window.removeEventListener(e, sync));
  }, [sync]);

  const id = (pl) => pl.playlistId || pl.browseId;
  const pinnedIds = new Set(pinned.map(id));
  const recentOnly = recent.filter((pl) => !pinnedIds.has(id(pl)));
  const open = (pl) => { if (pl.type === "album") onOpenAlbum?.(pl); else if (pl.type === "artist") onOpenArtist?.(pl); else onOpenPlaylist?.(pl); };

  const quick = [
    { key: "liked", label: t("likedSongs"), icon: <Heart size={16} weight="fill" />, onPress: onOpenLiked },
    { key: "history", label: t("history"), icon: <ClockCounterClockwise size={16} />, onPress: () => onOpenView?.("history") },
    { key: "downloads", label: t("downloads"), icon: <DownloadSimple size={16} />, onPress: () => onOpenView?.("downloads") },
  ];

  const row = (title, items) => items.length > 0 && (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: "var(--t12)", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{title}</div>
      <div className="scrollable" style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 6 }}>
        {items.map((pl) => (
          <button key={id(pl)} type="button" onClick={() => open(pl)} onContextMenu={(e) => { e.preventDefault(); onContextMenu?.(e, pl); }}
            style={{ width: 96, flexShrink: 0, border: 0, padding: 0, background: "transparent", cursor: "default", textAlign: "start", fontFamily: "var(--font)" }}>
            <div style={{ width: 96, height: 96, overflow: "hidden", background: "var(--bg-elevated)", display: "flex", alignItems: "center", justifyContent: "center",
              borderRadius: pl.type === "artist" ? "var(--r-full)" : "var(--r-lg)" }}>
              {pl.thumbnail
                ? <img src={thumb(pl.thumbnail)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                : pl.type === "album" ? <VinylRecord size={22} className="text-muted" />
                : pl.type === "artist" ? <Microphone size={22} className="text-muted" />
                : <Playlist size={22} className="text-muted" />}
            </div>
            <div style={{ marginTop: 6, fontSize: "var(--t12)", color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{pl.title}</div>
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, marginBottom: 20 }}>
        {quick.map((q) => (
          <button key={q.key} type="button" onClick={q.onPress}
            style={{ height: 64, border: 0, cursor: "default", borderRadius: "var(--r-xl)", background: "var(--fill-subtle)", color: "var(--text-primary)",
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, fontFamily: "var(--font)", fontSize: "var(--t12)", fontWeight: 600, padding: "0 6px" }}
            className="hover:bg-hover">
            <span style={{ color: "var(--accent)", display: "inline-flex" }}>{q.icon}</span>
            <span style={{ maxWidth: "100%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{q.label}</span>
          </button>
        ))}
      </div>
      {row(t("pinned"), pinned)}
      {row(t("recentlyOpened"), recentOnly)}
    </div>
  );
}
