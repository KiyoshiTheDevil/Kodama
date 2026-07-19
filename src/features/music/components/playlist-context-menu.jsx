import { DropdownSection, toast } from "@heroui/react";
import { ContextMenu, CtxItem } from "@/shared/ui/context-menu.jsx";
import { translate } from "@/shared/i18n/i18n.js";
import { itemId } from "@/features/music/lib/playlist-id.js";
import {
  Copy,
  DotsThreeVertical,
  Microphone,
  PencilSimple,
  PushPin,
  ShareNodes,
  Trash,
  VinylRecord,
  X,
} from "@/shared/icons/icons.jsx";

// Global playlist/album/artist context menu — extracted from AppShell.jsx (Step 13b). `menu` is
// the { x, y, playlist } object AppShell tracks as `globalContextMenu`.
export function PlaylistContextMenu({
  menu,
  onClose,
  language,
  uiZoom,
  pinnedIds,
  togglePin,
  openAlbum,
  openArtist,
  openPlaylist,
  view,
  onRename,
  onDelete,
  removeRecentPlaylist,
}) {
  if (!menu) return null;
  const pl = menu.playlist;
  const isPinned = pinnedIds.includes(itemId(pl));
  const showAlbumNav = pl?.browseId && pl?.type !== "artist";
  const showArtistNav = !!pl?.artistBrowseId;
  const isUserPlaylist = pl?.playlistId && pl?.type !== "album" && pl?.owned !== false;
  const isPlaylistShare =
    pl && pl.type !== "album" && pl.type !== "artist" && (pl.playlistId || pl.browseId);
  const plShareId = (pl?.playlistId || pl?.browseId || "").replace(/^VL/, "");

  return (
    <ContextMenu
      x={menu.x}
      y={menu.y}
      zoom={uiZoom}
      onClose={onClose}
      ariaLabel="Playlist"
      minWidth={190}
    >
      <DropdownSection>
        <CtxItem
          icon={<PushPin size={15} />}
          label={isPinned ? translate(language, "unpin") : translate(language, "pin")}
          onSelect={() => togglePin(pl)}
        />
        <CtxItem
          icon={<DotsThreeVertical size={16} />}
          label={translate(language, "open")}
          onSelect={() => {
            if (pl?.type === "album") openAlbum(pl, view);
            else if (pl?.type === "artist") openArtist(pl, view);
            else openPlaylist(pl, view);
          }}
        />
      </DropdownSection>
      {isPlaylistShare && plShareId ? (
        <DropdownSection className="w-full border-t border-border mt-1 pt-1">
          <CtxItem
            icon={<ShareNodes size={15} />}
            label={translate(language, "copyYtMusicLink")}
            onSelect={() =>
              navigator.clipboard
                .writeText(`https://music.youtube.com/playlist?list=${plShareId}`)
                .then(() => toast.success(translate(language, "linkCopied")))
                .catch(() => {})
            }
          />
          <CtxItem
            icon={<Copy size={15} />}
            label={translate(language, "copyYoutubeLink")}
            onSelect={() =>
              navigator.clipboard
                .writeText(`https://youtube.com/playlist?list=${plShareId}`)
                .then(() => toast.success(translate(language, "linkCopied")))
                .catch(() => {})
            }
          />
        </DropdownSection>
      ) : null}
      {showAlbumNav || showArtistNav ? (
        <DropdownSection className="w-full border-t border-border mt-1 pt-1">
          {showAlbumNav ? (
            <CtxItem
              icon={<VinylRecord size={15} />}
              label={translate(language, "goToAlbum")}
              onSelect={() => openAlbum(pl, view)}
            />
          ) : null}
          {showArtistNav ? (
            <CtxItem
              icon={<Microphone size={15} />}
              label={translate(language, "goToArtist")}
              onSelect={() => openArtist({ browseId: pl.artistBrowseId }, view)}
            />
          ) : null}
        </DropdownSection>
      ) : null}
      {isUserPlaylist || !isPinned ? (
        <DropdownSection className="w-full border-t border-border mt-1 pt-1">
          {isUserPlaylist ? (
            <CtxItem
              icon={<PencilSimple size={15} />}
              label={translate(language, "renamePlaylist")}
              onSelect={() => onRename({ playlistId: pl.playlistId, title: pl.title })}
            />
          ) : null}
          {isUserPlaylist ? (
            <CtxItem
              icon={<Trash size={15} />}
              danger
              label={translate(language, "deletePlaylist")}
              onSelect={() => onDelete({ playlistId: pl.playlistId, title: pl.title })}
            />
          ) : null}
          {!isPinned ? (
            <CtxItem
              icon={<X size={16} />}
              danger
              label={translate(language, "removeFromRecent")}
              onSelect={() => removeRecentPlaylist(itemId(pl))}
            />
          ) : null}
        </DropdownSection>
      ) : null}
    </ContextMenu>
  );
}
