import { translate } from "@/shared/i18n/i18n.js";
import { WifiX } from "@/shared/icons/icons.jsx";
import { CollectionView } from "@/features/music/views/collection-view.jsx";
import { DownloadsView } from "@/features/downloads/downloads-view.jsx";
import { HistoryView } from "@/features/music/views/history-view.jsx";
import { LikedView } from "@/features/music/views/liked-view.jsx";
import { LibraryView } from "@/features/music/views/library-view.jsx";
import { SearchView } from "@/features/music/views/search-view.jsx";
import { HomeView } from "@/features/music/views/home-view.jsx";
import { ArtistView } from "@/features/music/views/artist-view.jsx";

function AnimatedView({ animations, children }) {
  return (
    <div
      style={{
        animation: animations ? "fadeSlideIn 0.28s cubic-bezier(0.22,1,0.36,1) both" : "none",
      }}
    >
      {children}
    </div>
  );
}

// Scrollable main content area — routes the active `view` to its screen (wrapped in the
// fade/slide AnimatedView transition), then the sticky offline banner and a spacer that
// keeps content clear of the floating player bar. Extracted verbatim from AppShell.jsx
// (Step 13c). AnimatedView keeps its useCallback identity so unrelated re-renders don't
// remount the active view subtree.
export function MainContent({
  appKey,
  view,
  viewRefreshKey,
  animations,
  profiles,
  openPlaylist,
  openAlbum,
  openArtist,
  openContextMenu,
  setTrackContextMenu,
  hideExplicit,
  searchQuery,
  handleToggleLike,
  likedIds,
  selectedTracks,
  toggleTrackSelection,
  selectAllTracks,
  goBack,
  collection,
  artistView,
  togglePin,
  pinnedIds,
  isOffline,
  language,
}) {
  return (
    <div key={appKey} className="scrollable" style={{ height: "100%", overflowY: "auto" }}>
      {view === "home" && (
        <AnimatedView key={`home-${viewRefreshKey}`} animations={animations}>
          <HomeView
            displayName={profiles.find((p) => p.active)?.displayName}
            onOpenPlaylist={(item) => openPlaylist(item, "home")}
            onOpenAlbum={(item) => openAlbum(item, "home")}
            onOpenArtist={(item) => openArtist(item, "home")}
            onContextMenu={openContextMenu}
            onTrackContextMenu={(e, track) =>
              setTrackContextMenu({ x: e.clientX, y: e.clientY, track })
            }
            hideExplicit={hideExplicit}
          />
        </AnimatedView>
      )}
      {view === "search" && (
        <AnimatedView key={`search-${viewRefreshKey}`} animations={animations}>
          <SearchView
            query={searchQuery}
            onOpenArtist={openArtist}
            onOpenAlbum={(item) => openAlbum(item, "search")}
            onOpenPlaylist={(item) => openPlaylist(item, "search")}
            onContextMenu={openContextMenu}
            onTrackContextMenu={(e, track) =>
              setTrackContextMenu({ x: e.clientX, y: e.clientY, track })
            }
            hideExplicit={hideExplicit}
          />
        </AnimatedView>
      )}
      {view === "liked" && (
        <AnimatedView key={`liked-${viewRefreshKey}`} animations={animations}>
          <LikedView
            onOpenArtist={openArtist}
            onOpenAlbum={(item) => openAlbum(item, "liked")}
            onTrackContextMenu={(e, track) =>
              setTrackContextMenu({ x: e.clientX, y: e.clientY, track })
            }
            hideExplicit={hideExplicit}
            onToggleLike={handleToggleLike}
            likedIds={likedIds}
            selectedTracks={selectedTracks}
            onToggleSelect={toggleTrackSelection}
            onSelectAll={selectAllTracks}
            onBack={goBack}
          />
        </AnimatedView>
      )}
      {view === "history" && (
        <AnimatedView key={`history-${viewRefreshKey}`} animations={animations}>
          <HistoryView
            onOpenArtist={openArtist}
            onOpenAlbum={(item) => openAlbum(item, "history")}
            onTrackContextMenu={(e, track, extra) =>
              setTrackContextMenu({
                x: e.clientX,
                y: e.clientY,
                track,
                ...extra,
              })
            }
            hideExplicit={hideExplicit}
            onBack={goBack}
          />
        </AnimatedView>
      )}
      {view === "library" && (
        <AnimatedView key={`library-${viewRefreshKey}`} animations={animations}>
          <LibraryView
            onOpenPlaylist={openPlaylist}
            onOpenAlbum={openAlbum}
            onOpenArtist={openArtist}
            onContextMenu={openContextMenu}
          />
        </AnimatedView>
      )}
      {view === "collection" && collection && (
        <AnimatedView key={`collection-${viewRefreshKey}`} animations={animations}>
          <CollectionView
            title={collection.title}
            thumbnail={collection.thumbnail}
            tracks={collection.tracks}
            total={collection.total}
            loading={collection.loading}
            progress={collection.progress || 0}
            cached={collection.cached}
            onBack={goBack}
            onOpenArtist={openArtist}
            onOpenAlbum={(item) => openAlbum(item, "collection")}
            isAlbum={collection.isAlbum}
            albumArtists={collection.albumArtists}
            albumArtistBrowseId={collection.albumArtistBrowseId}
            year={collection.year}
            onRefresh={() => {
              if (collection.isAlbum)
                openAlbum(
                  {
                    browseId: collection.browseId,
                    title: collection.title,
                    thumbnail: collection.thumbnail,
                  },
                  collection.fromView,
                  true
                );
              else
                openPlaylist(
                  {
                    playlistId: collection.playlistId,
                    title: collection.title,
                    thumbnail: collection.thumbnail,
                    forcedTitle: collection.forcedTitle,
                  },
                  collection.fromView,
                  true
                );
            }}
            onTrackContextMenu={(e, track) =>
              setTrackContextMenu({
                x: e.clientX,
                y: e.clientY,
                track,
                playlistId: collection.isAlbum ? null : collection.playlistId,
              })
            }
            hideExplicit={hideExplicit}
            onToggleLike={handleToggleLike}
            likedIds={likedIds}
            selectedTracks={selectedTracks}
            onToggleSelect={toggleTrackSelection}
            onSelectAll={selectAllTracks}
          />
        </AnimatedView>
      )}
      {view === "artist" && artistView && (
        <AnimatedView key={`artist-${viewRefreshKey}`} animations={animations}>
          <ArtistView
            browseId={artistView.browseId}
            onOpenAlbum={(item) => openAlbum(item, "artist")}
            onOpenPlaylist={(item) => openPlaylist(item, "artist")}
            onOpenArtist={(item) => openArtist(item, "artist")}
            onBack={goBack}
            onContextMenu={openContextMenu}
            onTogglePin={togglePin}
            isPinned={pinnedIds.includes(artistView.browseId)}
            hideExplicit={hideExplicit}
          />
        </AnimatedView>
      )}
      {view === "downloads" && (
        <AnimatedView key={`downloads-${viewRefreshKey}`} animations={animations}>
          <DownloadsView
            onTrackContextMenu={(e, track) =>
              setTrackContextMenu({ x: e.clientX, y: e.clientY, track })
            }
            hideExplicit={hideExplicit}
            onOpenAlbum={(item) => openAlbum(item, "downloads")}
            onOpenArtist={openArtist}
            onToggleLike={handleToggleLike}
            likedIds={likedIds}
          />
        </AnimatedView>
      )}
      {isOffline && view !== "downloads" && (
        <div
          style={{
            position: "sticky",
            bottom: 0,
            left: 0,
            right: 0,
            background: "rgba(240,180,41,0.12)",
            borderTop: "1px solid rgba(240,180,41,0.3)",
            color: "#f0b429",
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 16px",
            fontSize: 13,
            zIndex: 10,
          }}
        >
          <WifiX size={15} weight="bold" />
          {translate(language, "offlineBanner")}
        </div>
      )}
      {/* Spacer so content scrolls clear of the floating player bar */}
      <div style={{ height: 97, flexShrink: 0, pointerEvents: "none" }} aria-hidden="true" />
    </div>
  );
}
