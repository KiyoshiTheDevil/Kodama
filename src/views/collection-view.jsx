// Thin wrapper that renders a playlist/album/liked collection through PlaylistLayout.
// Extracted from App.jsx.
import { PlaylistLayout } from "./track-table.jsx";

export function CollectionView({
  title,
  thumbnail,
  tracks,
  total,
  loading,
  progress,
  cached,
  currentTrack,
  isPlaying,
  onBack,
  onOpenArtist,
  onOpenAlbum,
  isAlbum,
  albumArtists,
  albumArtistBrowseId,
  year,
  onRefresh,
  onTrackContextMenu,
  cachedSongIds,
  downloadingIds,
  premiumSongIds,
  onDownloadSong,
  onDownloadAll,
  onRemoveAll,
  hideExplicit,
  onToggleLike,
  likedIds,
  selectedTracks,
  onToggleSelect,
  onSelectAll,
}) {
  return (
    <PlaylistLayout
      title={title}
      thumbnail={thumbnail}
      tracks={tracks}
      total={total}
      loading={loading}
      progress={progress}
      cached={cached}
      currentTrack={currentTrack}
      isPlaying={isPlaying}
      onBack={onBack}
      onOpenArtist={onOpenArtist}
      onOpenAlbum={onOpenAlbum}
      isAlbum={isAlbum}
      albumArtists={albumArtists}
      albumArtistBrowseId={albumArtistBrowseId}
      year={year}
      onRefresh={onRefresh}
      onTrackContextMenu={onTrackContextMenu}
      cachedSongIds={cachedSongIds}
      downloadingIds={downloadingIds}
      premiumSongIds={premiumSongIds}
      onDownloadSong={onDownloadSong}
      onDownloadAll={onDownloadAll}
      onRemoveAll={onRemoveAll}
      hideExplicit={hideExplicit}
      onToggleLike={onToggleLike}
      likedIds={likedIds}
      selectedTracks={selectedTracks}
      onToggleSelect={onToggleSelect}
      onSelectAll={onSelectAll}
    />
  );
}
