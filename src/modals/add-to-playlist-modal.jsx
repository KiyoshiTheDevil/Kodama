// "Add to playlist" modal — search the user's playlists and add the given track(s), or jump
// to creating a new one. Extracted from App.jsx; uses the shared API/thumb/useLang from context.
import { useState, useEffect } from "react";
import { Button, Spinner, toast, SearchFieldRoot, SearchFieldGroup, SearchFieldSearchIcon, SearchFieldInput, SearchFieldClearButton, ModalRoot, ModalBackdrop, ModalContainer, ModalDialog, ModalHeader, ModalIcon, ModalHeading, ModalBody, ModalCloseTrigger } from "@heroui/react";
import { Playlist, MagnifyingGlass, Plus } from "../icons.jsx";
import { API, thumb, useLang } from "../context.jsx";

export function AddToPlaylistModal({ tracks, onClose, onNewPlaylist, onAdded }) {
  const t = useLang();
  const [playlists, setPlaylists] = useState(null);
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`${API}/library/playlists`).then(r => r.json())
      .then(d => { if (!cancelled) setPlaylists(d.playlists || []); })
      .catch(() => { if (!cancelled) setPlaylists([]); });
    return () => { cancelled = true; };
  }, []);

  const query = q.trim().toLowerCase();
  const filtered = (playlists || []).filter(pl => (pl.title || "").toLowerCase().includes(query));

  const countLabel = (c) => {
    if (!c) return null;
    const s = String(c);
    return /^\d+$/.test(s) ? `${s} ${t("songs")}` : s;
  };

  const add = async (pl) => {
    if (busyId) return;
    setBusyId(pl.playlistId);
    try {
      await fetch(`${API}/playlist/${pl.playlistId}/add`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoIds: tracks.map(tr => tr.videoId), tracks }),
      });
      toast.success(t("addedToPlaylist", { title: pl.title }), { timeout: 3000 });
      onAdded?.();
    } catch {}
    setBusyId(null);
    onClose();
  };

  return (
    <ModalRoot isOpen onOpenChange={(open) => { if (!open) onClose(); }}>
      <ModalBackdrop className="z-[300]!">
        <ModalContainer placement="center" size="sm" className="w-[440px] max-w-[92vw]">
          <ModalDialog>
            <ModalHeader>
              <ModalIcon><Playlist size={18} /></ModalIcon>
              <ModalCloseTrigger />
              <ModalHeading>{t("addToPlaylist")}</ModalHeading>
            </ModalHeader>
            <ModalBody>
              <div className="flex flex-col gap-3">
                <SearchFieldRoot aria-label={t("search")} value={q} onChange={setQ} className="w-full">
                  <SearchFieldGroup>
                    <SearchFieldSearchIcon><MagnifyingGlass size={16} /></SearchFieldSearchIcon>
                    <SearchFieldInput autoFocus placeholder={t("search")} />
                    <SearchFieldClearButton />
                  </SearchFieldGroup>
                </SearchFieldRoot>

                <Button variant="ghost" fullWidth className="justify-start gap-2.5 px-3 rounded-xl text-accent"
                  onPress={() => { onClose(); onNewPlaylist(); }}>
                  <Plus size={16} weight="bold" />
                  {t("newPlaylist")}
                </Button>

                <div className="h-[46vh] overflow-y-auto -mx-1 px-1">
                  {playlists === null ? (
                    <div className="h-full flex items-center justify-center"><Spinner size="sm" /></div>
                  ) : filtered.length === 0 ? (
                    <div className="h-full flex items-center justify-center text-muted text-t12">{t("noPlaylists")}</div>
                  ) : (
                  <div className="flex flex-col gap-1">
                  {filtered.map((pl, i) => (
                    <button key={pl.playlistId || i}
                      onClick={() => add(pl)}
                      disabled={!!busyId}
                      className="flex items-center gap-3 p-2 rounded-xl text-left transition-colors duration-150 border-none bg-transparent w-full hover:bg-hover disabled:opacity-60"
                    >
                      <div className="w-11 h-11 rounded-lg bg-elevated shrink-0 overflow-hidden flex items-center justify-center text-muted">
                        {pl.thumbnail
                          ? <img src={thumb(pl.thumbnail)} alt="" className="w-full h-full object-cover" />
                          : <Playlist size={18} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-t13 font-medium truncate">{pl.title}</div>
                        {countLabel(pl.count) ? <div className="text-t11 text-muted truncate">{countLabel(pl.count)}</div> : null}
                      </div>
                      {busyId === pl.playlistId
                        ? <Spinner size="sm" className="shrink-0" />
                        : <Plus size={16} className="text-muted shrink-0" />}
                    </button>
                  ))}
                  </div>
                  )}
                </div>
              </div>
            </ModalBody>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </ModalRoot>
  );
}
