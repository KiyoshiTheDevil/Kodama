// Thin wrapper that renders a playlist/album/liked collection through PlaylistLayout.
// Extracted from App.jsx.
import { PlaylistLayout } from "./track-table.jsx";

export function CollectionView({ title, description, thumbnail, tracks, total, loading, progress, cached, onPlay, currentTrack, isPlaying, onBack, isLiked, onOpenArtist, onOpenAlbum, isAlbum, albumArtists, albumArtistBrowseId, year, onRefresh, contextMenuTrackId, onTrackContextMenu, cachedSongIds, downloadingIds, premiumSongIds, onDownloadSong, onDownloadAll, onRemoveAll, hideExplicit, onToggleLike, likedIds, selectedTracks, onToggleSelect, onSelectAll }) {
  return (
    <PlaylistLayout
      title={title} description={description} thumbnail={thumbnail} tracks={tracks} total={total}
      loading={loading} progress={progress} cached={cached}
      onPlay={onPlay} currentTrack={currentTrack} isPlaying={isPlaying}
      onBack={onBack} isLiked={isLiked} onOpenArtist={onOpenArtist} onOpenAlbum={onOpenAlbum}
      isAlbum={isAlbum} albumArtists={albumArtists} albumArtistBrowseId={albumArtistBrowseId} year={year}
      onRefresh={onRefresh} contextMenuTrackId={contextMenuTrackId} onTrackContextMenu={onTrackContextMenu}
      cachedSongIds={cachedSongIds} downloadingIds={downloadingIds} premiumSongIds={premiumSongIds} onDownloadSong={onDownloadSong} onDownloadAll={onDownloadAll} onRemoveAll={onRemoveAll}
      hideExplicit={hideExplicit} onToggleLike={onToggleLike} likedIds={likedIds}
      selectedTracks={selectedTracks} onToggleSelect={onToggleSelect} onSelectAll={onSelectAll}
    />
  );
}
