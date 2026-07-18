// Downloads view — offline/cached songs, rendered via PlaylistLayout. Extracted from App.jsx.
import { useState, useEffect, useMemo } from "react";
import { API, useLang } from "../context.jsx";
import { PlaylistLayout } from "./track-table.jsx";
import { GridCard } from "../ui/rows.jsx";
import { Microphone, MusicNote, VinylRecord } from "../icons.jsx";

export function DownloadsView({
  currentTrack,
  isPlaying,
  cachedSongIds,
  downloadingIds,
  premiumSongIds,
  onDownloadSong,
  onTrackContextMenu,
  hideExplicit,
  onOpenAlbum,
  onOpenArtist,
  onToggleLike,
  likedIds,
}) {
  const t = useLang();
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("songs");
  const [selectedGroup, setSelectedGroup] = useState(null);

  useEffect(() => {
    setLoading(true);
    let cancelled = false;
    const load = (attempt = 0) => {
      fetch(`${API}/song/cached/list`)
        .then((r) => r.json())
        .then((d) => {
          if (!cancelled) {
            setSongs(d.songs || []);
            setLoading(false);
          }
        })
        .catch(() => {
          if (!cancelled && attempt < 20) setTimeout(() => load(attempt + 1), 1500);
          else if (!cancelled) setLoading(false);
        });
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [cachedSongIds.size]);

  const albums = useMemo(() => {
    const map = new Map();
    songs.forEach((song) => {
      if (!song.album) return;
      const key = song.albumBrowseId || song.album;
      if (!map.has(key))
        map.set(key, {
          key,
          title: song.album,
          browseId: song.albumBrowseId,
          thumbnail: song.thumbnail,
          artists: song.artists,
          songs: [],
        });
      map.get(key).songs.push(song);
    });
    return Array.from(map.values()).sort((a, b) => a.title.localeCompare(b.title));
  }, [songs]);

  const artists = useMemo(() => {
    const map = new Map();
    songs.forEach((song) => {
      if (!song.artists) return;
      const key = song.artistBrowseId || song.artists;
      if (!map.has(key))
        map.set(key, {
          key,
          artist: song.artists,
          browseId: song.artistBrowseId,
          thumbnail: song.thumbnail,
          songs: [],
        });
      map.get(key).songs.push(song);
    });
    return Array.from(map.values()).sort((a, b) => a.artist.localeCompare(b.artist));
  }, [songs]);

  const tabDefs = [
    { id: "songs", label: t("filterSongs"), icon: <MusicNote size={14} /> },
    { id: "albums", label: t("filterAlbums"), icon: <VinylRecord size={14} /> },
    { id: "artists", label: t("filterArtists"), icon: <Microphone size={14} /> },
  ];

  // Detail view for a selected album or artist
  if (selectedGroup) {
    return (
      <PlaylistLayout
        title={selectedGroup.title}
        thumbnail={selectedGroup.thumbnail}
        tracks={selectedGroup.songs}
        total={selectedGroup.songs.length}
        loading={false}
        progress={1}
        cached={true}
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        onBack={() => setSelectedGroup(null)}
        onOpenArtist={onOpenArtist}
        onOpenAlbum={onOpenAlbum}
        onTrackContextMenu={onTrackContextMenu}
        cachedSongIds={cachedSongIds}
        downloadingIds={downloadingIds}
        premiumSongIds={premiumSongIds}
        onDownloadSong={onDownloadSong}
        hideExplicit={hideExplicit}
        onToggleLike={onToggleLike}
        likedIds={likedIds}
      />
    );
  }

  // Header in normal flow — sits above PlaylistLayout via zIndex:5 (safe, below any overlay)
  const HEADER_H = 60; // 24px top padding + 36px row height
  const tabBar = (
    <div style={{ position: "relative", zIndex: 5, flexShrink: 0, padding: "24px 24px 0" }}>
      <div style={{ position: "relative", display: "flex", alignItems: "center", height: 36 }}>
        <div style={{ fontSize: "var(--t22)", fontWeight: 600 }}>{t("downloads")}</div>
        <div
          style={{
            position: "absolute",
            left: "50%",
            transform: "translateX(-50%)",
            display: "flex",
            gap: 4,
          }}
        >
          {tabDefs.map((tb) => (
            <button
              key={tb.id}
              onClick={() => setTab(tb.id)}
              className={`view-tab-btn${tab === tb.id ? " active" : ""}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                background:
                  tab === tb.id
                    ? "color-mix(in srgb, var(--accent) 20%, transparent)"
                    : "transparent",
                color: tab === tb.id ? "var(--accent)" : "var(--text-secondary)",
                border: "none",
                borderRadius: 8,
                padding: "7px 14px",
                fontSize: "var(--t13)",
                cursor: "default",
                fontFamily: "var(--font)",
                transition: "all 0.15s",
                fontWeight: tab === tb.id ? 600 : 400,
              }}
            >
              {tb.icon}
              {tb.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  if (tab === "songs") {
    return (
      <div style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
        {tabBar}
        {/* Negative margin pulls PlaylistLayout's gradient up behind the header */}
        <div style={{ marginTop: -HEADER_H, flex: 1 }}>
          <PlaylistLayout
            title={t("allSongs")}
            thumbnail={null}
            tracks={songs}
            total={songs.length}
            loading={loading}
            progress={1}
            cached={false}
            currentTrack={currentTrack}
            isPlaying={isPlaying}
            onBack={null}
            onOpenArtist={onOpenArtist}
            onOpenAlbum={onOpenAlbum}
            onTrackContextMenu={onTrackContextMenu}
            cachedSongIds={cachedSongIds}
            downloadingIds={downloadingIds}
            premiumSongIds={premiumSongIds}
            onDownloadSong={onDownloadSong}
            hideExplicit={hideExplicit}
            onToggleLike={onToggleLike}
            likedIds={likedIds}
          />
        </div>
      </div>
    );
  }

  // Albums / Artists grid
  const items = tab === "albums" ? albums : artists;
  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {tabBar}
      <div style={{ flex: 1, overflowY: "auto", padding: "16px 24px 32px" }}>
        {loading ? (
          <div style={{ color: "var(--text-muted)", fontSize: "var(--t13)" }}>{t("loading")}…</div>
        ) : items.length === 0 ? (
          <div style={{ color: "var(--text-muted)", fontSize: "var(--t13)" }}>{t("noResults")}</div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))",
              gap: 16,
            }}
          >
            {tab === "albums" &&
              albums.map((album, i) => (
                <GridCard
                  key={i}
                  thumbnail={album.thumbnail}
                  title={album.title}
                  subtitle={`${album.artists || ""} · ${album.songs.length} ${t("songs")}`}
                  onClick={() =>
                    setSelectedGroup({
                      title: album.title,
                      thumbnail: album.thumbnail,
                      songs: album.songs,
                    })
                  }
                />
              ))}
            {tab === "artists" &&
              artists.map((artist, i) => (
                <GridCard
                  key={i}
                  thumbnail={artist.thumbnail}
                  title={artist.artist}
                  subtitle={`${artist.songs.length} ${t("songs")}`}
                  onClick={() =>
                    setSelectedGroup({
                      title: artist.artist,
                      thumbnail: artist.thumbnail,
                      songs: artist.songs,
                    })
                  }
                />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
