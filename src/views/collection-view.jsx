// Thin wrapper that renders a playlist/album/liked collection through PlaylistLayout.
// Extracted from App.jsx.
import { PlaylistLayout } from "./track-table.jsx";
import { useDownloadActions } from "../features/downloads/download-context.jsx";

export function CollectionView({
  title,
  thumbnail,
  tracks,
  total,
  loading,
  progress,
  cached,
  onBack,
  onOpenArtist,
  onOpenAlbum,
  isAlbum,
  albumArtists,
  albumArtistBrowseId,
  year,
  onRefresh,
  onTrackContextMenu,
  hideExplicit,
  onToggleLike,
  likedIds,
  selectedTracks,
  onToggleSelect,
  onSelectAll,
}) {
  // "Download all" needs this collection's own title/thumbnail/artists metadata, so it's built
  // here rather than sourced verbatim from DownloadContext (Step 12).
  const { downloadAll, removeAll } = useDownloadActions();
  return (
    <PlaylistLayout
      title={title}
      thumbnail={thumbnail}
      tracks={tracks}
      total={total}
      loading={loading}
      progress={progress}
      cached={cached}
      onBack={onBack}
      onOpenArtist={onOpenArtist}
      onOpenAlbum={onOpenAlbum}
      isAlbum={isAlbum}
      albumArtists={albumArtists}
      albumArtistBrowseId={albumArtistBrowseId}
      year={year}
      onRefresh={onRefresh}
      onTrackContextMenu={onTrackContextMenu}
      onDownloadAll={(tracks) =>
        downloadAll(tracks, { title, thumbnail, artists: albumArtists || "" })
      }
      onRemoveAll={removeAll}
      hideExplicit={hideExplicit}
      onToggleLike={onToggleLike}
      likedIds={likedIds}
      selectedTracks={selectedTracks}
      onToggleSelect={onToggleSelect}
      onSelectAll={onSelectAll}
    />
  );
}
