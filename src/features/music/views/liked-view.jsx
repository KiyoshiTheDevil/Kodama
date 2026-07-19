// Liked-songs view — fetches the user's liked tracks and renders them via PlaylistLayout.
// Extracted from App.jsx.
import { useState, useEffect } from "react";
import { API } from "@/shared/api/client.js";
import { useLang } from "@/shared/i18n/context.jsx";
import { PlaylistLayout } from "@/features/music/components/track-table.jsx";

export function LikedView({
  onOpenArtist,
  onOpenAlbum,
  onTrackContextMenu,
  hideExplicit,
  onToggleLike,
  likedIds,
  selectedTracks,
  onToggleSelect,
  onSelectAll,
  onBack,
}) {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [errorCode, setErrorCode] = useState(null);
  const t = useLang();

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/liked`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) {
          const err = new Error(d.error);
          err.code = d.code;
          throw err;
        }
        setTracks(d.tracks || []);
      })
      .catch((e) => {
        setError(e.message);
        setErrorCode(e.code || null);
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return (
      <div style={{ padding: 28, color: "var(--text-secondary)" }}>{t("loadingLikedSongs")}</div>
    );

  if (error && errorCode === "auth_expired")
    return (
      <div style={{ padding: 28 }}>
        <div style={{ color: "#f44336", marginBottom: 8 }}>{t("sessionExpired")}</div>
        <div style={{ color: "var(--text-secondary)", fontSize: "var(--t13)" }}>
          {t("sessionExpiredHint")}
        </div>
      </div>
    );

  if (error)
    return (
      <div style={{ padding: 28 }}>
        <div style={{ color: "#f44336", marginBottom: 8 }}>{t("errorLoading")}</div>
        <div style={{ color: "var(--text-secondary)", fontSize: "var(--t13)" }}>{error}</div>
        <div style={{ color: "var(--text-muted)", fontSize: "var(--t12)", marginTop: 12 }}>
          {t("backendHint")}{" "}
          <code style={{ background: "var(--bg-elevated)", padding: "1px 6px", borderRadius: 4 }}>
            python server.py
          </code>
        </div>
      </div>
    );

  return (
    <div data-testid="view-liked">
      <PlaylistLayout
        title={t("likedSongs")}
        thumbnail={null}
        tracks={tracks}
        total={tracks.length}
        loading={false}
        progress={0}
        cached={false}
        onBack={onBack || null}
        isLiked={true}
        onOpenArtist={onOpenArtist}
        onOpenAlbum={onOpenAlbum}
        onTrackContextMenu={onTrackContextMenu}
        hideExplicit={hideExplicit}
        onToggleLike={onToggleLike}
        likedIds={likedIds}
        selectedTracks={selectedTracks}
        onToggleSelect={onToggleSelect}
        onSelectAll={onSelectAll}
      />
    </div>
  );
}
