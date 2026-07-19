// Big Picture — artist detail screen. Fetches /artist/{browseId} (same as the desktop UI) and
// shows the top songs (playable as a queue) plus album/single cover grids that open the album
// detail screen. Everything sits in one FocusContext so the controller flows by geometry.
import { useEffect, useState } from "react";
import { FocusContext, useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import { API } from "@/shared/api/client.js";
import { thumbHi } from "@/shared/api/thumbnails.js";
import { sendPlay } from "@/features/player/player-bridge.js";
import { setContextTarget } from "./bpContext.js";
import { trackContextActions } from "./Detail.jsx";
import { Play, Shuffle } from "@/shared/icons/icons.jsx";

function artistsOf(track) {
  return Array.isArray(track.artists)
    ? track.artists
        .map((a) => (a && a.name) || a)
        .filter(Boolean)
        .join(", ")
    : track.artists || track.artist || "";
}

// The action buttons sit below a tall header (artist image + name), which is taller than the
// scroll container's top padding — so scrollIntoView would leave the header clipped. When one
// of them gains focus (they are the top-most focusables), scroll the whole page fully to top.
function scrollPageTop(node) {
  const sc = node && node.closest && node.closest("[data-bigpicture]");
  if (sc) sc.scrollTo({ top: 0, behavior: "smooth" });
}

function ActionBtn({ icon, label, onPress }) {
  const { ref, focused } = useFocusable({
    onEnterPress: onPress,
    onFocus: (l) => scrollPageTop(l && l.node),
  });
  return (
    <div
      ref={ref}
      onClick={onPress}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        padding: "12px 22px",
        borderRadius: 14,
        cursor: "default",
        color: focused ? "#0a0a0f" : "#fff",
        fontSize: 18,
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

function CoverCard({ item, onSelect }) {
  const { ref, focused } = useFocusable({
    onEnterPress: () => onSelect(item),
    // Center the focused card horizontally so it never sits flush against a scroll edge (where
    // the overflow container would clip its focus ring); "nearest" for the outer vertical scroll.
    onFocus: (l) => {
      const n = l && l.node;
      if (n && n.scrollIntoView)
        n.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
    },
  });
  return (
    <div
      ref={ref}
      onClick={() => onSelect(item)}
      style={{ width: 180, flexShrink: 0, cursor: "default" }}
    >
      <div
        style={{
          width: 180,
          height: 180,
          borderRadius: 14,
          overflow: "hidden",
          background: "linear-gradient(135deg,#2a1535,#17091f)",
          outline: focused ? "3px solid var(--accent)" : "3px solid transparent",
          outlineOffset: 3,
          boxShadow: focused
            ? "0 0 0 6px color-mix(in srgb, var(--accent) 30%, transparent), 0 14px 40px rgba(0,0,0,.5)"
            : "0 6px 18px rgba(0,0,0,.3)",
          transform: focused ? "scale(1.06)" : "scale(1)",
          transition: "transform .15s, box-shadow .15s, outline-color .15s",
        }}
      >
        {item.thumbnail ? (
          <img
            src={thumbHi(item.thumbnail)}
            alt=""
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : null}
      </div>
      <div
        style={{
          marginTop: 10,
          color: "#fff",
          fontSize: 17,
          fontWeight: 600,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {item.title}
      </div>
      <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, minHeight: "1.2em" }}>
        {item.year || " "}
      </div>
    </div>
  );
}

function Shelf({ title, items, onSelect }) {
  if (!items || !items.length) return null;
  return (
    <div style={{ marginBottom: 34 }}>
      <div style={{ color: "#fff", fontSize: 22, fontWeight: 700, marginBottom: 14 }}>{title}</div>
      {/* overflow-x:auto clips the vertical axis too, so the scaled focus ring would be cut off.
          Add vertical padding (cancelled by a negative margin so spacing is unchanged) for the
          ring, and horizontal scroll-padding so a focused card never sits flush against an edge. */}
      <div
        style={{
          display: "flex",
          gap: 20,
          overflowX: "auto",
          overflowY: "hidden",
          padding: "16px",
          margin: "-16px",
          scrollPadding: "0 50%",
        }}
      >
        {items.map((it, i) => (
          <CoverCard key={it.browseId || i} item={it} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

export function Artist({ item, onOpenAlbum, onPlayed }) {
  const [data, setData] = useState(null); // null = loading
  const [error, setError] = useState(false);
  const { ref, focusKey, focusSelf } = useFocusable();

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(false);
    fetch(`${API}/artist/${item.browseId}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        if (d.error) {
          setError(true);
          return;
        }
        setData(d);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [item.browseId]);

  useEffect(() => {
    if (data) {
      const t = setTimeout(() => focusSelf(), 0);
      return () => clearTimeout(t);
    }
  }, [data, focusSelf]);

  const topTracks = (data && data.tracks) || [];
  const playFrom = (track) => {
    sendPlay(
      track,
      topTracks.filter((t) => t.videoId)
    );
    onPlayed && onPlayed();
  };
  const playAll = () => {
    const l = topTracks.filter((t) => t.videoId);
    if (l.length) {
      sendPlay(l[0], l);
      onPlayed && onPlayed();
    }
  };
  const playShuffle = () => {
    const l = topTracks.filter((t) => t.videoId);
    if (!l.length) return;
    for (let i = l.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [l[i], l[j]] = [l[j], l[i]];
    }
    sendPlay(l[0], l);
    onPlayed && onPlayed();
  };

  const bg = {
    minHeight: "100%",
    padding: "6vh 6vw",
    background: "radial-gradient(120% 80% at 50% -10%, #241033, #0a0a0f 60%)",
  };

  if (error)
    return (
      <div style={bg}>
        <div style={{ color: "rgba(255,255,255,0.6)", fontSize: 20 }}>
          Künstler konnte nicht geladen werden. · B / Esc zurück
        </div>
      </div>
    );
  if (!data)
    return (
      <div style={bg}>
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 20 }}>Lädt…</div>
      </div>
    );

  const stats = [
    data.subscribers && `${data.subscribers} Abonnenten`,
    data.monthlyListeners && `${data.monthlyListeners} monatliche Hörer`,
  ]
    .filter(Boolean)
    .join("  ·  ");

  return (
    <FocusContext.Provider value={focusKey}>
      <div ref={ref} style={bg}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", gap: 28, marginBottom: 36 }}>
          <div
            style={{
              width: 160,
              height: 160,
              borderRadius: "50%",
              overflow: "hidden",
              flexShrink: 0,
              background: "linear-gradient(135deg,#2a1535,#17091f)",
              boxShadow: "0 14px 40px rgba(0,0,0,.5)",
            }}
          >
            {data.thumbnail ? (
              <img
                src={thumbHi(data.thumbnail)}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
            ) : null}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: "#fff", fontSize: 44, fontWeight: 800, lineHeight: 1.1 }}>
              {data.name || item.artist || ""}
            </div>
            {stats ? (
              <div
                style={{
                  color: "rgba(255,255,255,0.5)",
                  fontSize: 16,
                  marginTop: 8,
                  marginBottom: 18,
                }}
              >
                {stats}
              </div>
            ) : (
              <div style={{ marginBottom: 18 }} />
            )}
            {topTracks.some((t) => t.videoId) ? (
              <div style={{ display: "flex", gap: 12 }}>
                <ActionBtn
                  icon={<Play size={19} weight="fill" />}
                  label="Alles abspielen"
                  onPress={playAll}
                />
                <ActionBtn
                  icon={<Shuffle size={19} weight="bold" />}
                  label="Zufall"
                  onPress={playShuffle}
                />
              </div>
            ) : null}
          </div>
        </div>

        {/* Top songs */}
        {topTracks.length ? (
          <div style={{ marginBottom: 38 }}>
            <div style={{ color: "#fff", fontSize: 22, fontWeight: 700, marginBottom: 12 }}>
              Top-Songs
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: 900 }}>
              {topTracks.map((tr, i) => (
                <TrackRow key={tr.videoId || i} track={tr} index={i} onPlay={playFrom} />
              ))}
            </div>
          </div>
        ) : null}

        <Shelf title="Alben" items={data.albums} onSelect={onOpenAlbum} />
        <Shelf title="Singles" items={data.singles} onSelect={onOpenAlbum} />
      </div>
    </FocusContext.Provider>
  );
}
