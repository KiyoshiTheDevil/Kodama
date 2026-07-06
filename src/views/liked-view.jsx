// Liked-songs view — fetches the user's liked tracks and renders them via PlaylistLayout.
// Extracted from App.jsx.
import { useState, useEffect } from "react";
import { API, useLang } from "../context.jsx";
import { PlaylistLayout } from "./track-table.jsx";

export function LikedView({ onPlay, currentTrack, isPlaying, onOpenArtist, onOpenAlbum, onTrackContextMenu, cachedSongIds, downloadingIds, onDownloadSong, hideExplicit, onToggleLike, likedIds, selectedTracks, onToggleSelect, onSelectAll, onBack }) {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [errorCode, setErrorCode] = useState(null);
  const t = useLang();

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/liked`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { const err = new Error(d.error); err.code = d.code; throw err; }
        setTracks(d.tracks || []);
      })
      .catch(e => { setError(e.message); setErrorCode(e.code || null); })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ padding: 28, color: "var(--text-secondary)" }}>
      {t("loadingLikedSongs")}
    </div>
  );

  if (error && errorCode === "auth_expired") return (
    <div style={{ padding: 28 }}>
      <div style={{ color: "#f44336", marginBottom: 8 }}>{t("sessionExpired")}</div>
      <div style={{ color: "var(--text-secondary)", fontSize: "var(--t13)" }}>{t("sessionExpiredHint")}</div>
    </div>
  );

  if (error) return (
    <div style={{ padding: 28 }}>
      <div style={{ color: "#f44336", marginBottom: 8 }}>{t("errorLoading")}</div>
      <div style={{ color: "var(--text-secondary)", fontSize: "var(--t13)" }}>{error}</div>
      <div style={{ color: "var(--text-muted)", fontSize: "var(--t12)", marginTop: 12 }}>
        {t("backendHint")} <code style={{ background: "var(--bg-elevated)", padding: "1px 6px", borderRadius: 4 }}>python server.py</code>
      </div>
    </div>
  );

  return (
    <PlaylistLayout
      title={t("likedSongs")} thumbnail={null} tracks={tracks} total={tracks.length}
      loading={false} progress={0} cached={false}
      onPlay={onPlay} currentTrack={currentTrack} isPlaying={isPlaying}
      onBack={onBack || null} isLiked={true} onOpenArtist={onOpenArtist} onOpenAlbum={onOpenAlbum}
      onTrackContextMenu={onTrackContextMenu}
      cachedSongIds={cachedSongIds} downloadingIds={downloadingIds} onDownloadSong={onDownloadSong}
      hideExplicit={hideExplicit} onToggleLike={onToggleLike} likedIds={likedIds}
      selectedTracks={selectedTracks} onToggleSelect={onToggleSelect} onSelectAll={onSelectAll}
    />
  );
}
