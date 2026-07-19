// Recently-played history view (local, per-profile). Rendered via PlaylistLayout, with a
// particle burst on entry removal. Extracted from App.jsx.
import { useCallback, useEffect, useState } from "react";
import { useAnimations } from "@/features/settings/display-context.jsx";
import { useLang } from "@/shared/i18n/context.jsx";
import { PlaylistLayout } from "@/features/music/components/track-table.jsx";
import { particleBurst } from "@/shared/lib/particle-burst.js";
import { Trash } from "@/shared/icons/icons.jsx";

const profileKey = () => `kiyoshi-history-${window.__activeProfile || "default"}`;

export function HistoryView({
  onOpenArtist,
  onOpenAlbum,
  onTrackContextMenu,
  hideExplicit,
  onBack,
}) {
  const t = useLang();
  const anim = useAnimations();
  const load = useCallback(() => {
    try {
      return JSON.parse(localStorage.getItem(profileKey()) || "[]");
    } catch {
      return [];
    }
  }, []);
  const [tracks, setTracks] = useState(load);

  useEffect(() => {
    const sync = () => setTracks(load());
    window.addEventListener("kiyoshi-history-updated", sync);
    return () => window.removeEventListener("kiyoshi-history-updated", sync);
  }, [load]);

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

  const clearHistoryBtn =
    tracks.length > 0 ? (
      <button
        onClick={clearHistory}
        style={{
          borderRadius: 28,
          height: 42,
          display: "flex",
          alignItems: "center",
          padding: "0 18px",
          gap: 8,
          fontSize: "var(--t13)",
          fontWeight: 600,
          cursor: "default",
          transition: "background 0.15s, border-color 0.15s, color 0.15s",
          fontFamily: "var(--font)",
          backdropFilter: "blur(6px)",
          border: "0.5px solid rgba(255,255,255,0.15)",
          background: "rgba(0,0,0,0.3)",
          color: "rgba(255,255,255,0.75)",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "#f44336";
          e.currentTarget.style.borderColor = "#f44336";
          e.currentTarget.style.background = "rgba(244,67,54,0.12)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "rgba(255,255,255,0.75)";
          e.currentTarget.style.borderColor = "rgba(255,255,255,0.15)";
          e.currentTarget.style.background = "rgba(0,0,0,0.3)";
        }}
      >
        <Trash size={13} /> {t("clearHistory")}
      </button>
    ) : null;

  return (
    <div data-testid="view-history">
      <PlaylistLayout
        title={t("history")}
        thumbnail={null}
        tracks={tracks}
        total={tracks.length}
        loading={false}
        progress={0}
        cached={false}
        onBack={onBack}
        typeLabel={t("history")}
        isLiked={false}
        onOpenArtist={onOpenArtist}
        onOpenAlbum={onOpenAlbum}
        onTrackContextMenu={(e, tr) => {
          const idx = tracks.findIndex((x) => x === tr);
          onTrackContextMenu(e, tr, {
            removeFromHistory: () => {
              if (anim) {
                try {
                  particleBurst(
                    document.querySelector(`[data-track-id="${CSS.escape(tr.videoId)}"]`)
                  );
                } catch {
                  /* intentionally ignored */
                }
              }
              removeFromHistory(idx);
            },
          });
        }}
        hideExplicit={hideExplicit}
        extraActions={clearHistoryBtn}
      />
    </div>
  );
}
