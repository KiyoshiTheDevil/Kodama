import { SelActionBtn } from "../views/track-table.jsx";
import { Heart, Plus, Trash, X } from "../icons.jsx";
import { API } from "../shared/api/client.js";
import { translate } from "../i18n.js";

// Floating multi-track selection action bar (like-all / add-to-playlist / remove-from-playlist
// / close). Rendered by App when there is a selection; behaviour and the current callback
// interface are preserved from the former inline App render.
export function SelectionActionBar({
  selectedTracks,
  language,
  view,
  collection,
  setCollection,
  onToggleLike,
  onClearSelection,
  onAddToPlaylist,
}) {
  return (
    <div
      style={{
        position: "absolute",
        bottom: "100%",
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        padding: "0 0 6px",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          pointerEvents: "auto",
          display: "flex",
          flexDirection: "column",
          alignItems: "stretch",
          background: "var(--bg-elevated)",
          border: "0.5px solid var(--border)",
          borderRadius: 16,
          boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
          animation: "ctxMenuIn 0.2s ease-out",
        }}
      >
        {/* Title */}
        <div
          style={{
            fontSize: "var(--t12)",
            color: "var(--text-muted)",
            fontWeight: 600,
            textTransform: "uppercase",
            letterSpacing: "0.07em",
            padding: "9px 24px 8px",
            textAlign: "center",
          }}
        >
          {selectedTracks.size}{" "}
          {translate(language, selectedTracks.size === 1 ? "songSelected" : "songsSelected")}
        </div>
        {/* Actions */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            padding: "6px 8px",
          }}
        >
          {/* Like all */}
          <SelActionBtn
            icon={<Heart size={17} />}
            label={translate(language, "likeAll")}
            iconOnly
            onClick={async () => {
              for (const track of selectedTracks.values()) await onToggleLike(track);
              onClearSelection();
            }}
          />
          <div
            style={{
              width: 1,
              height: 20,
              background: "var(--border)",
              flexShrink: 0,
            }}
          />
          {/* Add to playlist — opens the shared modal with the selected tracks */}
          <SelActionBtn
            icon={<Plus size={17} />}
            label={translate(language, "addToPlaylist")}
            horizontal
            onClick={() => onAddToPlaylist(Array.from(selectedTracks.values()))}
          />
          {/* Remove from playlist — only when in playlist context */}
          {view === "collection" && collection?.playlistId && (
            <>
              <div
                style={{
                  width: 1,
                  height: 20,
                  background: "var(--border)",
                  flexShrink: 0,
                }}
              />
              <SelActionBtn
                icon={<Trash size={17} />}
                label={translate(language, "removeSelected")}
                iconOnly
                danger
                onClick={async () => {
                  const tracks = Array.from(selectedTracks.values());
                  for (const track of tracks) {
                    if (!track.setVideoId) continue;
                    try {
                      await fetch(`${API}/playlist/${collection.playlistId}/remove`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          videos: [
                            {
                              videoId: track.videoId,
                              setVideoId: track.setVideoId,
                            },
                          ],
                        }),
                      });
                      setCollection((c) =>
                        c
                          ? {
                              ...c,
                              tracks: c.tracks.filter(
                                (t) =>
                                  !(
                                    t.videoId === track.videoId && t.setVideoId === track.setVideoId
                                  )
                              ),
                            }
                          : c
                      );
                    } catch { /* intentionally ignored */ }
                  }
                  onClearSelection();
                }}
              />
            </>
          )}
          <div
            style={{
              width: 1,
              height: 20,
              background: "var(--border)",
              flexShrink: 0,
            }}
          />
          {/* Close */}
          <SelActionBtn
            icon={<X size={17} />}
            label={translate(language, "cancel")}
            iconOnly
            onClick={onClearSelection}
          />
        </div>
      </div>
    </div>
  );
}
