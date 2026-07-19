// Big Picture — generic browse grid (playlists / albums / artists). Fetches the same backend
// library endpoints the desktop UI uses and renders focusable cover cards; the focused card is
// auto-scrolled into view (important for long lists on a TV/handheld).
import { useEffect, useState } from "react";
import { FocusContext, useFocusable } from "@noriginmedia/norigin-spatial-navigation";
import { API } from "@/shared/api/client.js";
import { thumbHi } from "@/shared/api/thumbnails.js";

const ENDPOINT = {
  playlists: "/library/playlists",
  albums: "/library/albums",
  artists: "/library/artists",
};
const LISTKEY = { playlists: "playlists", albums: "albums", artists: "artists" };
const TITLE = { playlists: "Playlists", albums: "Alben", artists: "Künstler" };

function Card({ item, type, onSelect }) {
  const { ref, focused } = useFocusable({
    onEnterPress: () => onSelect(item),
    onFocus: (layout) => {
      const n = layout && layout.node;
      if (n && n.scrollIntoView) n.scrollIntoView({ block: "nearest", behavior: "smooth" });
    },
  });
  const title = type === "artists" ? item.artist : item.title;
  const sub =
    type === "artists"
      ? item.songs
        ? `${item.songs} Songs`
        : ""
      : item.count
        ? `${item.count} Songs`
        : item.artists || "";
  const round = type === "artists";
  return (
    <div ref={ref} onClick={() => onSelect(item)} style={{ cursor: "default" }}>
      <div
        style={{
          width: "100%",
          aspectRatio: "1",
          borderRadius: round ? "50%" : 14,
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
          marginTop: 12,
          color: "#fff",
          fontSize: 20,
          fontWeight: 600,
          textAlign: round ? "center" : "left",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {title}
      </div>
      <div
        style={{
          color: "rgba(255,255,255,0.5)",
          fontSize: 16,
          textAlign: round ? "center" : "left",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          minHeight: "1.2em",
        }}
      >
        {sub || " "}
      </div>
    </div>
  );
}

export function Browse({ type, chrome, onSelect }) {
  const [items, setItems] = useState(null); // null = loading
  const { ref, focusKey, focusSelf } = useFocusable();

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    fetch(`${API}${ENDPOINT[type]}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setItems(d[LISTKEY[type]] || []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, [type]);

  // The grid mounts only after the async fetch, so focus the first card once data arrives.
  useEffect(() => {
    if (items && items.length) {
      const t = setTimeout(() => focusSelf(), 0);
      return () => clearTimeout(t);
    }
  }, [items, focusSelf]);

  return (
    <FocusContext.Provider value={focusKey}>
      <div
        ref={ref}
        style={{
          minHeight: "100%",
          padding: "6vh 6vw",
          background: "radial-gradient(120% 80% at 50% -10%, #241033, #0a0a0f 60%)",
        }}
      >
        {chrome}
        <div style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, marginBottom: 24 }}>
          {items === null ? "Lädt…" : `${TITLE[type]} · ${items.length} Einträge`}
        </div>
        {items === null ? null : items.length === 0 ? (
          <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 18 }}>Nichts gefunden.</div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, minmax(0, 1fr))",
              gap: 28,
              alignItems: "start",
            }}
          >
            {items.map((it, i) => (
              <Card
                key={it.playlistId || it.browseId || i}
                item={it}
                type={type}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
      </div>
    </FocusContext.Provider>
  );
}
