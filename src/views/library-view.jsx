import { useState, useEffect, useRef } from "react";
import { Button, SearchFieldRoot, SearchFieldGroup, SearchFieldInput, SearchFieldClearButton, TabsRoot, TabListContainer, TabList, Tab, TabIndicator, ToggleButtonGroupRoot, ToggleButton } from "@heroui/react";
import { SharedElementTransition } from "react-aria-components";
import { API, useLang } from "../context.jsx";
import { MagnifyingGlass, Microphone, Playlist, Sliders, VinylRecord, WarningCircle } from "../icons.jsx";
import { GridCard } from "../ui/rows.jsx";

export function LibraryView({ onPlay, currentTrack, isPlaying, onOpenPlaylist, onOpenAlbum, onOpenArtist, onContextMenu, sessionExpired, onReauth }) {
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

  useEffect(() => { if (searchOpen) searchRef.current?.focus(); }, [searchOpen]);
  useEffect(() => { setSearchQuery(""); setSearchOpen(false); }, [tab]);

  useEffect(() => {
    const handler = () => setRefreshKey(k => k + 1);
    window.addEventListener("kiyoshi-library-updated", handler);
    return () => window.removeEventListener("kiyoshi-library-updated", handler);
  }, []);

  // Targeted, refetch-free removal of a single playlist (used when deleting): drops just that
  // card from the local list so the grid doesn't reload and flash empty.
  useEffect(() => {
    const onRemoved = (e) => setPlaylists(prev => prev.filter(p => p.playlistId !== e.detail));
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
      .then(r => r.json())
      .then(d => {
        if (d.error) throw new Error(d.error);
        if (tab === "playlists") setPlaylists(d.playlists || []);
        if (tab === "albums") setAlbums(d.albums || []);
        if (tab === "artists") setArtists(d.artists || []);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [tab, refreshKey]);

  const tabs = [
    { id: "playlists", label: t("filterPlaylists"), icon: <Playlist size={14} /> },
    { id: "albums",    label: t("filterAlbums"),    icon: <VinylRecord size={14} /> },
    { id: "artists",   label: t("filterArtists"),   icon: <Microphone size={14} /> },
  ];

  const rawItems = tab === "playlists" ? playlists : tab === "albums" ? albums : artists;

  const items = [...rawItems].sort((a, b) => {
    const nameA = (tab === "artists" ? a.artist : a.title) || "";
    const nameB = (tab === "artists" ? b.artist : b.title) || "";
    if (sortOrder === "az") return nameA.localeCompare(nameB);
    if (sortOrder === "za") return nameB.localeCompare(nameA);
    if (sortOrder === "artist") return (a.artists || "").localeCompare(b.artists || "");
    if (sortOrder === "year_desc") return (parseInt(b.year) || 0) - (parseInt(a.year) || 0);
    if (sortOrder === "year_asc")  return (parseInt(a.year) || 0) - (parseInt(b.year) || 0);
    return 0; // "default" — keep API order
  }).filter(item => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    if (tab === "artists") return (item.artist || "").toLowerCase().includes(q);
    return (item.title || "").toLowerCase().includes(q) || (item.artists || "").toLowerCase().includes(q);
  });

  // Play (or shuffle) a whole collection straight from its card, without opening it first —
  // fetch its tracks (same endpoints the detail views use) and hand them to the player.
  const playCollection = async (kind, id, shuffle) => {
    try {
      const url = kind === "album" ? `${API}/album/${id}` : `${API}/playlist/${id}`;
      const d = await fetch(url).then(r => r.json());
      let tracks = (d.tracks || []).filter(tr => tr.videoId);
      if (!tracks.length) return;
      if (shuffle) tracks = [...tracks].sort(() => Math.random() - 0.5);
      onPlay(tracks[0], tracks);
    } catch {}
  };

  const sortOptions = [
    { value: "default",   label: t("sortDefault") },
    { value: "az",        label: t("sortAlphaAZ") },
    { value: "za",        label: t("sortAlphaZA") },
    ...(tab === "albums" ? [
      { value: "artist",    label: t("sortByArtist") },
      { value: "year_desc", label: t("sortByYearDesc") },
      { value: "year_asc",  label: t("sortByYearAsc") },
    ] : []),
  ];

  return (
    <div style={{ padding: "24px 24px 0" }}>
      {/* Header row: title left, tabs centered */}
      <div style={{ position: "relative", display: "flex", alignItems: "center", marginBottom: 12, height: 36 }}>
        <div style={{ fontSize: "var(--t22)", fontWeight: 600 }}>{t("library")}</div>
        <div style={{ position: "absolute", left: "50%", transform: "translateX(-50%)" }}>
          <SharedElementTransition>
            <TabsRoot selectedKey={tab} onSelectionChange={key => { setTab(key); setSortOrder("default"); }}>
              <TabListContainer>
                <TabList aria-label={t("library")}>
                  {tabs.map(tab_ => (
                    <Tab key={tab_.id} id={tab_.id} className="gap-1.5">
                      {tab_.icon}{tab_.label}
                    </Tab>
                  ))}
                </TabList>
                <TabIndicator />
              </TabListContainer>
            </TabsRoot>
          </SharedElementTransition>
        </div>
      </div>

      {/* Sort + search row */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
        <Sliders size={13} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
        <ToggleButtonGroupRoot
          selectionMode="single"
          disallowEmptySelection
          selectedKeys={[sortOrder]}
          onSelectionChange={(keys) => { const v = [...keys][0]; if (v) setSortOrder(v); }}
          size="sm"
        >
          {sortOptions.map(o => <ToggleButton key={o.value} id={o.value}>{o.label}</ToggleButton>)}
        </ToggleButtonGroupRoot>
        {/* Search — right side */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: searchOpen ? 200 : 0, overflow: "hidden", transition: "width 0.25s cubic-bezier(0.4,0,0.2,1)" }}>
            <SearchFieldRoot value={searchQuery} onChange={setSearchQuery} aria-label={t("search")} className="w-[200px]">
              <SearchFieldGroup>
                <SearchFieldInput ref={searchRef} placeholder={t("search")}
                  onKeyDown={e => { if (e.key === "Escape") { setSearchQuery(""); setSearchOpen(false); } }} />
                <SearchFieldClearButton />
              </SearchFieldGroup>
            </SearchFieldRoot>
          </div>
          <button
            onClick={() => { setSearchOpen(v => !v); if (searchOpen) setSearchQuery(""); }}
            style={{
              width: 28, height: 28, borderRadius: "50%", flexShrink: 0,
              background: searchOpen ? "color-mix(in srgb, var(--accent) 18%, transparent)" : "var(--bg-elevated)",
              border: "0.5px solid var(--border)",
              color: searchOpen ? "var(--accent)" : "var(--text-secondary)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "default", transition: "all 0.15s", padding: 0,
            }}
            onMouseEnter={e => { if (!searchOpen) e.currentTarget.style.color = "var(--text-primary)"; }}
            onMouseLeave={e => { if (!searchOpen) e.currentTarget.style.color = "var(--text-secondary)"; }}
          >
            <MagnifyingGlass size={13} />
          </button>
        </div>
      </div>

      {loading && <div style={{ color: "var(--text-secondary)" }}>{t("loadingDots")}</div>}
      {error && <div style={{ color: "var(--status-danger)" }}>{error}</div>}
      {/* An empty library used to render an empty grid and nothing else. That was fine when it
          really was empty, but it was also what an expired session looked like: the requests
          come back with nothing, and the user is left guessing. Say which of the two it is. */}
      {!loading && !error && items.length === 0 && (
        <div style={{
          display: "flex", flexDirection: "column", alignItems: "center", gap: 10,
          padding: "48px 24px", textAlign: "center", color: "var(--text-secondary)",
        }}>
          {sessionExpired ? (
            <>
              <WarningCircle size={26} weight="fill" style={{ color: "var(--status-warning)" }} />
              <div style={{ color: "var(--text-primary)", fontWeight: 600 }}>{t("libraryEmptySessionTitle")}</div>
              <div style={{ maxWidth: 420 }}>{t("libraryEmptySessionBody")}</div>
              {onReauth && (
                <Button size="sm" variant="flat" onPress={onReauth} style={{ marginTop: 6 }}>
                  {t("reauthSession")}
                </Button>
              )}
            </>
          ) : (
            <div>{t(searchQuery ? "libraryNoMatches" : "libraryEmpty")}</div>
          )}
        </div>
      )}
      {!loading && !error && items.length > 0 && (
        <div style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
          gap: 16,
        }}>
          {items.map((item, i) => {
            if (tab === "playlists") return (
              <GridCard key={item.playlistId || i}
                cardId={item.playlistId}
                thumbnail={item.thumbnail}
                title={item.title}
                count={item.count || undefined}
                onClick={() => onOpenPlaylist(item)}
                onPlay={item.playlistId ? () => playCollection("playlist", item.playlistId, false) : undefined}
                onShuffle={item.playlistId ? () => playCollection("playlist", item.playlistId, true) : undefined}
                playLabel={t("playAll")} shuffleLabel={t("shuffle")}
                onContextMenu={onContextMenu ? (e) => onContextMenu(e, item) : undefined}
              />
            );
            if (tab === "albums") return (
              <GridCard key={item.browseId || item.playlistId || i}
                thumbnail={item.thumbnail}
                title={item.title}
                subtitle={`${item.artists}${item.year ? ` · ${item.year}` : ""}`}
                onClick={() => onOpenAlbum(item)}
                onPlay={item.browseId ? () => playCollection("album", item.browseId, false) : undefined}
                onShuffle={item.browseId ? () => playCollection("album", item.browseId, true) : undefined}
                playLabel={t("playAll")} shuffleLabel={t("shuffle")}
                onContextMenu={onContextMenu ? (e) => onContextMenu(e, { ...item, type: "album" }) : undefined}
              />
            );
            if (tab === "artists") return (
              <GridCard key={item.browseId || i}
                thumbnail={item.thumbnail}
                title={item.artist}
                count={item.songs || undefined}
                onClick={() => onOpenArtist(item)}
                onContextMenu={onContextMenu ? (e) => onContextMenu(e, { ...item, title: item.artist, type: "artist" }) : undefined}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
