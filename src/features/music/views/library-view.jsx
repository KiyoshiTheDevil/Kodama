import { useEffect, useRef, useState } from "react";

import { GridCard } from "@/features/music/components/rows.jsx";
import {
  MagnifyingGlass,
  Microphone,
  Playlist,
  Sliders,
  VinylRecord,
} from "@/shared/icons/icons.jsx";
import { API } from "@/shared/api/client.js";
import { useLang } from "@/shared/i18n/context.jsx";

export function LibraryView({ onOpenPlaylist, onOpenAlbum, onOpenArtist, onContextMenu }) {
  const [tab, setTab] = useState("playlists");
  const [playlists, setPlaylists] = useState([]);
  const [albums, setAlbums] = useState([]);
  const [artists, setArtists] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [sortOrder, setSortOrder] = useState("default");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const searchRef = useRef(null);
  const t = useLang();

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);
  useEffect(() => {
    setSearchQuery("");
    setSearchOpen(false);
  }, [tab]);

  useEffect(() => {
    const handler = () => setRefreshKey((k) => k + 1);
    window.addEventListener("kiyoshi-library-updated", handler);
    return () => window.removeEventListener("kiyoshi-library-updated", handler);
  }, []);

  // Targeted, refetch-free removal of a single playlist (used when deleting): drops just that
  // card from the local list so the grid doesn't reload and flash empty.
  useEffect(() => {
    const onRemoved = (e) => setPlaylists((prev) => prev.filter((p) => p.playlistId !== e.detail));
    window.addEventListener("kiyoshi-playlist-removed", onRemoved);
    return () => window.removeEventListener("kiyoshi-playlist-removed", onRemoved);
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const endpoints = {
      playlists: `${API}/library/playlists`,
      albums: `${API}/library/albums`,
      artists: `${API}/library/artists`,
    };
    fetch(endpoints[tab])
      .then((r) => r.json())
      .then((d) => {
        if (d.error) throw new Error(d.error);
        if (tab === "playlists") setPlaylists(d.playlists || []);
        if (tab === "albums") setAlbums(d.albums || []);
        if (tab === "artists") setArtists(d.artists || []);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [tab, refreshKey]);

  const tabs = [
    { id: "playlists", label: t("filterPlaylists"), icon: <Playlist size={14} /> },
    { id: "albums", label: t("filterAlbums"), icon: <VinylRecord size={14} /> },
    { id: "artists", label: t("filterArtists"), icon: <Microphone size={14} /> },
  ];

  const rawItems = tab === "playlists" ? playlists : tab === "albums" ? albums : artists;

  const items = [...rawItems]
    .sort((a, b) => {
      const nameA = (tab === "artists" ? a.artist : a.title) || "";
      const nameB = (tab === "artists" ? b.artist : b.title) || "";
      if (sortOrder === "az") return nameA.localeCompare(nameB);
      if (sortOrder === "za") return nameB.localeCompare(nameA);
      if (sortOrder === "artist") return (a.artists || "").localeCompare(b.artists || "");
      if (sortOrder === "year_desc") return (parseInt(b.year) || 0) - (parseInt(a.year) || 0);
      if (sortOrder === "year_asc") return (parseInt(a.year) || 0) - (parseInt(b.year) || 0);
      return 0; // "default" — keep API order
    })
    .filter((item) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      if (tab === "artists") return (item.artist || "").toLowerCase().includes(q);
      return (
        (item.title || "").toLowerCase().includes(q) ||
        (item.artists || "").toLowerCase().includes(q)
      );
    });

  const sortOptions = [
    { value: "default", label: t("sortDefault") },
    { value: "az", label: t("sortAlphaAZ") },
    { value: "za", label: t("sortAlphaZA") },
    ...(tab === "albums"
      ? [
          { value: "artist", label: t("sortByArtist") },
          { value: "year_desc", label: t("sortByYearDesc") },
          { value: "year_asc", label: t("sortByYearAsc") },
        ]
      : []),
  ];

  return (
    <div data-testid="view-library" style={{ padding: "24px 24px 0" }}>
      {/* Header row: title left, tabs centered */}
      <div
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          marginBottom: 12,
          height: 36,
        }}
      >
        <div style={{ fontSize: "var(--t22)", fontWeight: 600 }}>{t("library")}</div>
        <div
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: 4,
          }}
        >
          {tabs.map((tab_) => (
            <button
              key={tab_.id}
              onClick={() => {
                setTab(tab_.id);
                setSortOrder("default");
              }}
              className={`view-tab-btn${tab === tab_.id ? " active" : ""}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background:
                  tab === tab_.id
                    ? "color-mix(in srgb, var(--accent) 20%, transparent)"
                    : "transparent",
                color: tab === tab_.id ? "var(--accent)" : "var(--text-secondary)",
                border: "none",
                borderRadius: 8,
                padding: "7px 14px",
                fontSize: "var(--t13)",
                cursor: "default",
                fontFamily: "var(--font)",
                transition: "all 0.15s",
                fontWeight: tab === tab_.id ? 600 : 400,
              }}
            >
              {tab_.icon}
              {tab_.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sort + search row */}
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 20 }}>
        <Sliders size={12} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
        {sortOptions.map((o) => (
          <button
            key={o.value}
            onClick={() => setSortOrder(o.value)}
            style={{
              background:
                sortOrder === o.value
                  ? "color-mix(in srgb, var(--accent) 15%, transparent)"
                  : "none",
              border: "none",
              borderRadius: 6,
              padding: "3px 9px",
              fontSize: "var(--t12)",
              fontFamily: "var(--font)",
              color: sortOrder === o.value ? "var(--accent)" : "var(--text-muted)",
              fontWeight: sortOrder === o.value ? 600 : 400,
              cursor: "default",
              transition: "all 0.15s",
            }}
            onMouseEnter={(e) => {
              if (sortOrder !== o.value) e.currentTarget.style.color = "var(--text-secondary)";
            }}
            onMouseLeave={(e) => {
              if (sortOrder !== o.value) e.currentTarget.style.color = "var(--text-muted)";
            }}
          >
            {o.label}
          </button>
        ))}
        {/* Search — right side */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <div
            style={{
              width: searchOpen ? 200 : 0,
              overflow: "hidden",
              transition: "width 0.25s cubic-bezier(0.4,0,0.2,1)",
            }}
          >
            <input
              ref={searchRef}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setSearchQuery("");
                  setSearchOpen(false);
                }
              }}
              placeholder={t("search")}
              style={{
                background: "var(--bg-elevated)",
                border: "0.5px solid var(--border)",
                borderRadius: 20,
                padding: "5px 12px",
                fontSize: "var(--t12)",
                color: "var(--text-primary)",
                outline: "none",
                width: 200,
                fontFamily: "var(--font)",
              }}
            />
          </div>
          <button
            onClick={() => {
              setSearchOpen((v) => !v);
              if (searchOpen) setSearchQuery("");
            }}
            style={{
              width: 28,
              height: 28,
              borderRadius: "50%",
              flexShrink: 0,
              background: searchOpen
                ? "color-mix(in srgb, var(--accent) 18%, transparent)"
                : "var(--bg-elevated)",
              border: "0.5px solid var(--border)",
              color: searchOpen ? "var(--accent)" : "var(--text-secondary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "default",
              transition: "all 0.15s",
              padding: 0,
            }}
            onMouseEnter={(e) => {
              if (!searchOpen) e.currentTarget.style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              if (!searchOpen) e.currentTarget.style.color = "var(--text-secondary)";
            }}
          >
            <MagnifyingGlass size={13} />
          </button>
        </div>
      </div>

      {loading && <div style={{ color: "var(--text-secondary)" }}>{t("loadingDots")}</div>}
      {error && <div style={{ color: "#f44336" }}>{error}</div>}
      {!loading && !error && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
            gap: 16,
          }}
        >
          {items.map((item, i) => {
            if (tab === "playlists")
              return (
                <GridCard
                  key={item.playlistId || i}
                  cardId={item.playlistId}
                  thumbnail={item.thumbnail}
                  title={item.title}
                  subtitle={item.count ? `${item.count} ${t("songs")}` : ""}
                  onClick={() => onOpenPlaylist(item)}
                  onContextMenu={onContextMenu ? (e) => onContextMenu(e, item) : undefined}
                />
              );
            if (tab === "albums")
              return (
                <GridCard
                  key={item.browseId || item.playlistId || i}
                  thumbnail={item.thumbnail}
                  title={item.title}
                  subtitle={`${item.artists}${item.year ? ` · ${item.year}` : ""}`}
                  onClick={() => onOpenAlbum(item)}
                  onContextMenu={
                    onContextMenu ? (e) => onContextMenu(e, { ...item, type: "album" }) : undefined
                  }
                />
              );
            if (tab === "artists")
              return (
                <GridCard
                  key={item.browseId || i}
                  thumbnail={item.thumbnail}
                  title={item.artist}
                  subtitle={item.songs ? `${item.songs} ${t("songs")}` : ""}
                  onClick={() => onOpenArtist(item)}
                  onContextMenu={
                    onContextMenu
                      ? (e) => onContextMenu(e, { ...item, title: item.artist, type: "artist" })
                      : undefined
                  }
                />
              );
          })}
        </div>
      )}
    </div>
  );
}
