// Recently-played history view (local, per-profile). Rendered via PlaylistLayout, with a
// particle burst on entry removal. Extracted from App.jsx.
import { useState, useEffect } from "react";
import { API, useLang, useAnimations } from "../context.jsx";
import { PlaylistLayout } from "./track-table.jsx";
import { particleBurst } from "../effects/particle-burst.js";
import { Trash } from "../icons.jsx";

export function HistoryView({ onPlay, currentTrack, isPlaying, onOpenArtist, onOpenAlbum, contextMenuTrackId, onTrackContextMenu, cachedSongIds, downloadingIds, onDownloadSong, hideExplicit, onBack }) {
  const t = useLang();
  const anim = useAnimations();
  const profileKey = () => `kiyoshi-history-${window.__activeProfile || "default"}`;
  const load = () => { try { return JSON.parse(localStorage.getItem(profileKey()) || "[]"); } catch { return []; } };
  const [tracks, setTracks] = useState(load);

  useEffect(() => {
    const sync = () => setTracks(load());
    window.addEventListener("kiyoshi-history-updated", sync);
    return () => window.removeEventListener("kiyoshi-history-updated", sync);
  }, []);

  const clearHistory = () => {
    localStorage.removeItem(profileKey());
    setTracks([]);
  };

  const removeFromHistory = (index) => {
    const updated = [...tracks];
    updated.splice(index, 1);
    localStorage.setItem(profileKey(), JSON.stringify(updated));
    setTracks(updated);
  };

  const clearHistoryBtn = tracks.length === 0 ? null : ({ compact, pill }) => (
    <button onClick={clearHistory}
      style={{ ...pill, padding: compact ? "0 14px" : "0 18px", background: "rgba(255,255,255,0.06)", border: "none", color: "#fff", fontWeight: 600 }}
      onMouseEnter={e => { e.currentTarget.style.color = "var(--status-danger)"; e.currentTarget.style.background = "var(--status-danger-soft)"; }}
      onMouseLeave={e => { e.currentTarget.style.color = "#fff"; e.currentTarget.style.background = "rgba(255,255,255,0.06)"; }}
    >
      <Trash size={compact ? 13 : 14} /> {t("clearHistory")}
    </button>
  );

  return (
    <PlaylistLayout
      title={t("history")} thumbnail={null} tracks={tracks} total={tracks.length}
      loading={false} progress={0} cached={false}
      onPlay={onPlay} currentTrack={currentTrack} isPlaying={isPlaying}
      onBack={onBack}
      typeLabel={t("history")}
      isLiked={false}
      onOpenArtist={onOpenArtist} onOpenAlbum={onOpenAlbum}
      contextMenuTrackId={contextMenuTrackId} onTrackContextMenu={(e, tr) => {
        const idx = tracks.findIndex(x => x === tr);
        onTrackContextMenu(e, tr, { removeFromHistory: () => {
          if (anim) { try { particleBurst(document.querySelector(`[data-track-id="${CSS.escape(tr.videoId)}"]`)); } catch {} }
          removeFromHistory(idx);
        } });
      }}
      cachedSongIds={cachedSongIds} downloadingIds={downloadingIds}
      onDownloadSong={onDownloadSong}
      hideExplicit={hideExplicit}
      extraActions={clearHistoryBtn}
    />
  );
}
