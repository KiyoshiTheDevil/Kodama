// Big Picture — playlist/album detail screen. Loads the tracks (playlists stream over SSE,
// albums come back in one fetch — same endpoints the desktop UI uses), then shows the cover,
// a Play all / Shuffle action column and a focusable track list. Selecting anything plays the
// whole collection as the queue via the player bridge and jumps to Now Playing.
import { useEffect, useState } from "react";
import { FocusContext, useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import { API } from "@/shared/api/client.js";
import { thumbHi } from "@/shared/api/thumbnails.js";
import { sendPlay, sendEnqueue } from "@/features/player/player-bridge.js";
import { setContextTarget } from "./bpContext.js";
import { Play, Shuffle } from "@/shared/icons/icons.jsx";

// Standard context-menu actions for a track (add-to-queue). Reused across the track lists.
export function trackContextActions(track) {
  return {
    title: track.title || "",
    actions: [
      { label: "Als Nächstes abspielen", run: () => sendEnqueue(track, "next") },
      { label: "Zur Warteschlange hinzufügen", run: () => sendEnqueue(track, "end") },
    ],
  };
}

function artistsOf(track) {
  return Array.isArray(track.artists)
    ? track.artists
        .map((a) => (a && a.name) || a)
        .filter(Boolean)
        .join(", ")
    : track.artists || track.artist || "";
}

// Focusing an action button (top-most focusable, below a tall cover column) scrolls the whole
// page fully to top — scrollIntoView alone would leave the cover/title clipped above.
function scrollPageTop(node) {
  const sc = node && node.closest && node.closest("[data-bigpicture]");
  if (sc) sc.scrollTo({ top: 0, behavior: "smooth" });
}

function ActionBtn({ icon, label, onPress, disabled }) {
  const { ref, focused } = useFocusable({
    onEnterPress: () => {
      if (!disabled) onPress();
    },
    onFocus: (l) => scrollPageTop(l && l.node),
  });
  return (
    <div
      ref={ref}
      onClick={() => {
        if (!disabled) onPress();
      }}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: "14px 20px",
        borderRadius: 14,
        cursor: "default",
        opacity: disabled ? 0.4 : 1,
        color: focused ? "#0a0a0f" : "#fff",
        fontSize: 19,
        fontWeight: 700,
        background: focused ? "var(--accent)" : "rgba(255,255,255,0.09)",
        outline: focused ? "3px solid var(--accent)" : "3px solid transparent",
        boxShadow: focused
          ? "0 0 0 5px color-mix(in srgb, var(--accent) 28%, transparent)"
          : "none",
        transform: focused ? "scale(1.04)" : "scale(1)",
        transition:
          "transform .12s, background .12s, box-shadow .12s, color .12s, outline-color .12s",
      }}
    >
      {icon}
      {label}
    </div>
  );
}

function TrackRow({ track, index, onPlay }) {
  const { ref, focused } = useFocusable({
    onEnterPress: () => onPlay(track),
    onFocus: (l) => {
      setContextTarget(trackContextActions(track));
      const n = l && l.node;
      if (n && n.scrollIntoView) n.scrollIntoView({ block: "nearest", behavior: "smooth" });
    },
  });
  return (
    <div
      ref={ref}
      onClick={() => onPlay(track)}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "10px 14px",
        borderRadius: 12,
        cursor: "default",
        background: focused ? "rgba(255,255,255,0.10)" : "transparent",
        outline: focused ? "3px solid var(--accent)" : "3px solid transparent",
        transition: "background .12s, outline-color .12s",
      }}
    >
      <div
        style={{
          width: 46,
          height: 46,
          borderRadius: 8,
          overflow: "hidden",
          flexShrink: 0,
          position: "relative",
          background: "linear-gradient(135deg,#2a1535,#17091f)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {track.thumbnail ? (
          <img
            src={thumbHi(track.thumbnail)}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : (
          <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 16, fontWeight: 700 }}>
            {index + 1}
          </span>
        )}
        {focused ? (
          <span
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Play size={20} weight="fill" style={{ color: "#fff" }} />
          </span>
        ) : null}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            color: "#fff",
            fontSize: 18,
            fontWeight: 600,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {track.title}
        </div>
        <div
          style={{
            color: "rgba(255,255,255,0.5)",
            fontSize: 15,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {artistsOf(track)}
        </div>
      </div>
      {track.duration ? (
        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, flexShrink: 0 }}>
          {track.duration}
        </div>
      ) : null}
    </div>
  );
}

export function Detail({ type, item, onPlayed }) {
  const isAlbum = type === "albums";
  const [title, setTitle] = useState(item.title || "");
  const [cover, setCover] = useState(item.thumbnail || "");
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const { ref, focusKey, focusSelf } = useFocusable();

  // Load the collection's tracks. Albums arrive in one JSON response; playlists stream in over
  // SSE (they can be long), so append as batches come in.
  useEffect(() => {
    let cancelled = false;
    setTracks([]);
    setLoading(true);
    if (isAlbum) {
      fetch(`${API}/album/${item.browseId}`)
        .then((r) => r.json())
        .then((d) => {
          if (cancelled) return;
          setTitle(d.title || item.title || "");
          if (d.thumbnail) setCover(d.thumbnail);
          setTracks(d.tracks || []);
          setLoading(false);
        })
        .catch(() => {
          if (!cancelled) setLoading(false);
        });
      return () => {
        cancelled = true;
      };
    }
    const es = new EventSource(`${API}/playlist/${item.playlistId}/stream`);
    es.onmessage = (e) => {
      const msg = JSON.parse(e.data);
      if (cancelled) return;
      if (msg.type === "header") {
        setTitle(msg.title || item.title || "");
        if (msg.thumbnail) setCover(msg.thumbnail);
      } else if (msg.type === "tracks") setTracks((t) => [...t, ...msg.tracks]);
      else if (msg.type === "done" || msg.type === "error") {
        setLoading(false);
        es.close();
      }
    };
    es.onerror = () => {
      if (!cancelled) setLoading(false);
      es.close();
    };
    return () => {
      cancelled = true;
      es.close();
    };
  }, [type, item.browseId, item.playlistId]);

  // Focus the action column as soon as the screen mounts (the buttons exist immediately).
  useEffect(() => {
    const t = setTimeout(() => focusSelf(), 0);
    return () => clearTimeout(t);
  }, [focusSelf]);

  const playFrom = (track) => {
    const list = tracks.filter((t) => t.videoId);
    sendPlay(track, list);
    onPlayed && onPlayed();
  };
  const playAll = () => {
    const list = tracks.filter((t) => t.videoId);
    if (list.length) {
      sendPlay(list[0], list);
      onPlayed && onPlayed();
    }
  };
  const playShuffle = () => {
    const list = tracks.filter((t) => t.videoId);
    if (!list.length) return;
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    sendPlay(list[0], list);
    onPlayed && onPlayed();
  };

  const playable = tracks.some((t) => t.videoId);

  return (
    <FocusContext.Provider value={focusKey}>
      <div
        ref={ref}
        style={{
          minHeight: "100%",
          padding: "6vh 6vw",
          background: "radial-gradient(120% 80% at 50% -10%, #241033, #0a0a0f 60%)",
          display: "flex",
          gap: 48,
          alignItems: "flex-start",
        }}
      >
        <div style={{ width: 340, flexShrink: 0 }}>
          <div
            style={{
              width: 340,
              height: 340,
              borderRadius: 18,
              overflow: "hidden",
              background: "linear-gradient(135deg,#2a1535,#17091f)",
              boxShadow: "0 18px 50px rgba(0,0,0,.5)",
            }}
          >
            {cover ? (
              <img
                src={thumbHi(cover)}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            ) : null}
          </div>
          <div
            style={{
              color: "#fff",
              fontSize: 30,
              fontWeight: 800,
              marginTop: 20,
              lineHeight: 1.15,
            }}
          >
            {title}
          </div>
          <div
            style={{
              color: "rgba(255,255,255,0.45)",
              fontSize: 15,
              marginTop: 6,
              marginBottom: 22,
            }}
          >
            {loading && !tracks.length ? "Lädt…" : `${tracks.length} Songs`}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <ActionBtn
              icon={<Play size={20} weight="fill" />}
              label="Alles abspielen"
              onPress={playAll}
              disabled={!playable}
            />
            <ActionBtn
              icon={<Shuffle size={20} weight="bold" />}
              label="Zufall"
              onPress={playShuffle}
              disabled={!playable}
            />
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {!tracks.length ? (
            <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 18, padding: "20px 0" }}>
              {loading ? "Lädt…" : "Keine Titel."}
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {tracks.map((tr, i) => (
                <TrackRow
                  key={tr.videoId || tr.setVideoId || i}
                  track={tr}
                  index={i}
                  onPlay={playFrom}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </FocusContext.Provider>
  );
}
