import {
  DropdownItem,
  DropdownMenu,
  DropdownPopover,
  DropdownSection,
  DropdownSubmenuIndicator,
  DropdownSubmenuTrigger,
  toast,
} from "@heroui/react";
import { API } from "../shared/api/client.js";
import { ContextMenu, CtxItem } from "../shared/ui/context-menu.jsx";
import { translate } from "../i18n.js";
import { Copy, DownloadSimple, Heart, Microphone, MusicNote, Plus, Queue, Radio, ShareNodes, Trash, VinylRecord, X } from "../icons.jsx";
import { particleBurst } from "../effects/particle-burst.js";
import { buildShareLink } from "../features/player/share-link.js";
import { usePlayerActions } from "../features/player/player-context.jsx";
import { useDownloadState, useDownloadActions } from "../features/downloads/download-context.jsx";

// Track context menu — extracted from AppShell.jsx (Step 13b). `menu` is the
// { x, y, track, playlistId?, removeFromHistory? } object AppShell tracks as `trackContextMenu`.
export function TrackContextMenu({
  menu,
  onClose,
  language,
  uiZoom,
  animations,
  likedIds,
  handleToggleLike,
  addToast,
  setCollection,
  openAlbum,
  openArtist,
  view,
  onAddToPlaylist,
}) {
  const { enqueue, startSongRadio } = usePlayerActions();
  const { cachedSongIds, downloadingIds } = useDownloadState();
  const {
    downloadSong: handleDownloadSong,
    exportSong: handleExportSong,
    removeCachedSong,
  } = useDownloadActions();

  if (!menu) return null;
  const track = menu.track;
  const ctxLiked = likedIds.has(track.videoId);
  const showRemovePl = menu.playlistId && track.setVideoId;
  const showRemoveHist = !!menu.removeFromHistory;
  const artistList = Array.isArray(track.artists)
    ? track.artists.filter((a) => a?.browseId || a?.id)
    : [];
  const showAlbumNav = !!track.albumBrowseId;
  const showArtistNav = artistList.length > 0 || !!track.artistBrowseId;
  const isCached = cachedSongIds.has(track.videoId);

  const copyShare = (url) => {
    navigator.clipboard
      .writeText(url)
      .then(() => toast.success(translate(language, "linkCopied")))
      .catch(() => {});
  };
  const copyLyrics = () => {
    fetch(`${API}/lyrics/${track.videoId}`)
      .then((r) => r.json())
      .then((d) => {
        if (!d.lyrics) return;
        const text = d.lyrics
          .map((l) => {
            const main = l.wordSync ? (l.words || []).map((w) => w.text).join("") : l.text || "";
            const bg = (l.bgWords || []).map((w) => w.text).join("") || l.bgText || "";
            return bg ? `${main} ${bg}` : main;
          })
          .join("\n");
        navigator.clipboard.writeText(text).catch(() => {});
      })
      .catch(() => {});
  };
  const saveLrc = async () => {
    try {
      const d = await fetch(`${API}/lyrics/${track.videoId}`).then((r) => r.json());
      if (!d.lyrics) return;
      const lyrics = d.lyrics;
      const isSync = lyrics.some((l) => l.time >= 0);
      const lrcLineText = (l) => {
        const main = l.wordSync ? (l.words || []).map((w) => w.text).join("") : l.text || "";
        const bg = (l.bgWords || []).map((w) => w.text).join("") || l.bgText || "";
        return bg ? `${main} ${bg}` : main;
      };
      const lrcText = isSync
        ? lyrics
            .map((l) => {
              const lineText = lrcLineText(l);
              if (l.time < 0) return lineText;
              const mm = String(Math.floor(l.time / 60)).padStart(2, "0");
              const ss = String(Math.floor(l.time % 60)).padStart(2, "0");
              const cs = String(Math.floor((l.time % 1) * 100)).padStart(2, "0");
              return `[${mm}:${ss}.${cs}] ${lineText}`;
            })
            .join("\n")
        : lyrics.map(lrcLineText).join("\n");
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { writeTextFile } = await import("@tauri-apps/plugin-fs");
      const safeTitle = (track?.title || "lyrics").replace(/[<>:"/\\|?*]/g, "_");
      const filePath = await save({
        title: translate(language, "saveLrc"),
        defaultPath: `${safeTitle}.lrc`,
        filters: [
          { name: "LRC", extensions: ["lrc"] },
          { name: "Text", extensions: ["txt"] },
        ],
      });
      if (!filePath) return;
      await writeTextFile(filePath, lrcText);
    } catch (e) {
      console.error(e);
    }
  };
  const removeFromPlaylist = async () => {
    if (animations) {
      try {
        particleBurst(document.querySelector(`[data-track-id="${CSS.escape(track.videoId)}"]`));
      } catch { /* intentionally ignored */ }
    }
    setCollection((c) =>
      c
        ? {
            ...c,
            tracks: c.tracks.filter(
              (t) => t.videoId !== track.videoId || t.setVideoId !== track.setVideoId
            ),
            total: Math.max(0, (c.total ?? c.tracks.length) - 1),
          }
        : c
    );
    try {
      await fetch(`${API}/playlist/${menu.playlistId}/remove`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videos: [{ videoId: track.videoId, setVideoId: track.setVideoId }],
        }),
      });
    } catch { /* intentionally ignored */ }
  };
  const removeDownload = () => removeCachedSong(track.videoId);

  return (
    <ContextMenu
      x={menu.x}
      y={menu.y}
      zoom={uiZoom}
      onClose={onClose}
      ariaLabel={track.title || "Track"}
      minWidth={210}
    >
      <DropdownSection>
        {/* Add to playlist — opens a dedicated modal with search + rich rows */}
        <CtxItem
          icon={<Plus size={15} />}
          label={translate(language, "addToPlaylist")}
          onSelect={() => onAddToPlaylist(track)}
        />

        <CtxItem
          icon={<Queue size={15} />}
          label={translate(language, "playNext")}
          onSelect={() => {
            enqueue(track, "next");
            addToast(translate(language, "addedNext") || "Als Nächstes eingereiht", "success");
          }}
        />
        <CtxItem
          icon={<Queue size={15} />}
          label={translate(language, "addToQueue")}
          onSelect={() => {
            enqueue(track, "end");
            addToast(
              translate(language, "addedQueue") || "Zur Warteschlange hinzugefügt",
              "success"
            );
          }}
        />
        <CtxItem
          icon={<Radio size={15} />}
          label={translate(language, "startRadio")}
          onSelect={() => startSongRadio(track)}
        />

        <DropdownItem
          textValue={ctxLiked ? translate(language, "unlike") : translate(language, "like")}
          onAction={() => handleToggleLike(track)}
          className={
            ctxLiked
              ? "text-accent! data-[focused]:text-accent! data-[hovered]:text-accent!"
              : undefined
          }
        >
          <span className="w-4 flex justify-center shrink-0">
            <Heart size={15} weight={ctxLiked ? "fill" : "regular"} />
          </span>
          {ctxLiked ? translate(language, "unlike") : translate(language, "like")}
        </DropdownItem>

        {showRemovePl ? (
          <CtxItem
            icon={<X size={15} />}
            danger
            label={translate(language, "removeFromPlaylist")}
            onSelect={removeFromPlaylist}
          />
        ) : null}
        {showRemoveHist ? (
          <CtxItem
            icon={<X size={15} />}
            danger
            label={translate(language, "removeFromHistory")}
            onSelect={() => menu.removeFromHistory()}
          />
        ) : null}
      </DropdownSection>

      {showAlbumNav || showArtistNav ? (
        <DropdownSection className="w-full border-t border-border mt-1 pt-1">
          {showAlbumNav ? (
            <CtxItem
              icon={<VinylRecord size={15} />}
              label={translate(language, "goToAlbum")}
              onSelect={() =>
                openAlbum({ browseId: track.albumBrowseId, title: track.album }, view)
              }
            />
          ) : null}
          {artistList.length > 0 ? (
            artistList.map((a, i) => {
              const browseId = a.browseId || a.id;
              const name = a.name || "";
              return (
                <CtxItem
                  key={browseId || i}
                  id={`artist-${browseId || i}`}
                  icon={<Microphone size={15} />}
                  label={`${translate(language, "goToArtist")}${name ? `: ${name}` : ""}`}
                  textValue={`${translate(language, "goToArtist")} ${name}`}
                  onSelect={() => openArtist({ browseId, artist: name }, view)}
                />
              );
            })
          ) : track.artistBrowseId ? (
            <CtxItem
              icon={<Microphone size={15} />}
              label={translate(language, "goToArtist")}
              onSelect={() => openArtist({ browseId: track.artistBrowseId }, view)}
            />
          ) : null}
        </DropdownSection>
      ) : null}

      <DropdownSection className="w-full border-t border-border mt-1 pt-1">
        <DropdownSubmenuTrigger>
          <DropdownItem textValue={translate(language, "share")}>
            <span className="w-4 flex justify-center shrink-0">
              <ShareNodes size={15} />
            </span>
            {translate(language, "share")}
            <DropdownSubmenuIndicator className="ml-auto" />
          </DropdownItem>
          <DropdownPopover className="min-w-56">
            <DropdownMenu aria-label={translate(language, "share")}>
              <DropdownSection>
                <CtxItem
                  icon={<ShareNodes size={15} />}
                  label={translate(language, "copyShareLink")}
                  onSelect={() => copyShare(buildShareLink(track))}
                />
                <CtxItem
                  icon={<Copy size={15} />}
                  label={translate(language, "copyKodamaLink")}
                  onSelect={() => copyShare(`kodama://song/${track.videoId}`)}
                />
                <CtxItem
                  icon={<Copy size={15} />}
                  label={translate(language, "copyYtMusicLink")}
                  onSelect={() => copyShare(`https://music.youtube.com/watch?v=${track.videoId}`)}
                />
                <CtxItem
                  icon={<Copy size={15} />}
                  label={translate(language, "copyYoutubeLink")}
                  onSelect={() => copyShare(`https://youtube.com/watch?v=${track.videoId}`)}
                />
              </DropdownSection>
            </DropdownMenu>
          </DropdownPopover>
        </DropdownSubmenuTrigger>
      </DropdownSection>

      <DropdownSection className="w-full border-t border-border mt-1 pt-1">
        {isCached ? (
          <CtxItem
            icon={<Trash size={15} />}
            danger
            label={translate(language, "removeDownload")}
            onSelect={removeDownload}
          />
        ) : !downloadingIds.has(track.videoId) ? (
          <CtxItem
            icon={<DownloadSimple size={15} />}
            label={translate(language, "download")}
            onSelect={() => handleDownloadSong(track)}
          />
        ) : null}
        <CtxItem
          icon={<MusicNote size={15} />}
          label={translate(language, "saveAsMp3")}
          onSelect={() => handleExportSong(track, "mp3")}
        />
        <CtxItem
          icon={<MusicNote size={15} />}
          label={translate(language, "saveAsOpus")}
          onSelect={() => handleExportSong(track, "opus")}
        />
      </DropdownSection>

      <DropdownSection className="w-full border-t border-border mt-1 pt-1">
        <CtxItem
          icon={<Copy size={15} />}
          label={translate(language, "copyLyrics")}
          onSelect={copyLyrics}
        />
        <CtxItem
          icon={<DownloadSimple size={15} />}
          label={translate(language, "saveLrc")}
          onSelect={saveLrc}
        />
      </DropdownSection>
    </ContextMenu>
  );
}
