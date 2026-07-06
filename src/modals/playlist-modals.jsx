// Playlist CRUD modals (create / rename / delete). Extracted from App.jsx — each is a
// self-contained HeroUI modal that receives the translator `t` as a prop and talks to the
// backend directly. Kept together because they share the same small dependency footprint.
import { useState } from "react";
import { cn, Button, Spinner, ModalRoot, ModalBackdrop, ModalContainer, ModalDialog, ModalHeader, ModalIcon, ModalHeading, ModalBody, ModalFooter, ModalCloseTrigger, TextFieldRoot, InputRoot, TextArea } from "@heroui/react";
import { Lock, EyeSlash, Globe, Playlist, PencilSimple, Trash } from "../icons.jsx";
import { API } from "../context.jsx";

export function CreatePlaylistModal({ onClose, onCreated, t }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [privacy, setPrivacy] = useState("PRIVATE");
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!title.trim() || creating) return;
    setCreating(true);
    try {
      const r = await fetch(`${API}/playlist/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim(), description, privacyStatus: privacy }),
      });
      const data = await r.json();
      if (data.ok) {
        window.dispatchEvent(new Event("kiyoshi-library-updated"));
        onCreated?.(data.playlistId, title.trim());
        onClose();
      }
    } catch {}
    setCreating(false);
  };

  const fieldLabel = "text-t10 font-bold uppercase tracking-[0.08em] text-muted";
  const privacyOpts = [
    ["PRIVATE",  t("privacyPrivate"),  <Lock size={14} />],
    ["UNLISTED", t("privacyUnlisted"), <EyeSlash size={14} />],
    ["PUBLIC",   t("privacyPublic"),   <Globe size={14} />],
  ];

  return (
    <ModalRoot isOpen onOpenChange={(open) => { if (!open) onClose(); }}>
      <ModalBackdrop className="z-[300]!">
        <ModalContainer placement="center" size="lg" className="w-[640px] max-w-[92vw]">
          <ModalDialog>
            <ModalHeader>
              <ModalIcon><Playlist size={18} /></ModalIcon>
              <ModalCloseTrigger />
              <ModalHeading>{t("createPlaylist")}</ModalHeading>
            </ModalHeader>
            <ModalBody>
              <div className="flex gap-5">
                {/* Left: title + description */}
                <div className="flex-1 flex flex-col gap-4 min-w-0">
                  <div className="flex flex-col gap-2">
                    <label className={fieldLabel}>{t("playlistTitle")}</label>
                    <TextFieldRoot aria-label={t("playlistTitle")} value={title} onChange={setTitle} className="w-full">
                      <InputRoot autoFocus onKeyDown={e => { if (e.key === "Enter") handleCreate(); }} />
                    </TextFieldRoot>
                  </div>
                  <div className="flex flex-col gap-2 flex-1">
                    <label className={fieldLabel}>{t("playlistDescription")}</label>
                    <TextFieldRoot aria-label={t("playlistDescription")} value={description} onChange={setDescription} className="w-full flex-1">
                      <TextArea className="min-h-[110px] resize-none" />
                    </TextFieldRoot>
                  </div>
                </div>

                {/* Right: visibility */}
                <div className="w-[180px] shrink-0 flex flex-col gap-2 border-l border-border pl-5">
                  <label className={fieldLabel}>{t("playlistPrivacy")}</label>
                  <div className="flex flex-col gap-1.5">
                    {privacyOpts.map(([val, label, icon]) => {
                      const active = privacy === val;
                      return (
                        <button key={val} onClick={() => setPrivacy(val)}
                          className={cn("flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-left text-t13 border-none w-full transition-colors duration-150",
                            active ? "bg-accent-dim text-accent font-semibold" : "bg-transparent text-secondary hover:bg-hover")}>
                          <span className={cn("flex w-4 justify-center shrink-0", !active && "opacity-55")}>{icon}</span>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" onPress={onClose}>{t("cancel")}</Button>
              <Button color="accent" variant="solid" isDisabled={!title.trim() || creating} onPress={handleCreate}>
                {creating ? <Spinner size="sm" /> : t("create")}
              </Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </ModalRoot>
  );
}

// Rename an existing playlist. HeroUI modal with a single text field.
export function RenamePlaylistModal({ dialog, onClose, t }) {
  const [name, setName] = useState(dialog.title || "");
  const submit = async () => {
    const newTitle = name.trim();
    if (!newTitle) return;
    try {
      await fetch(`${API}/playlist/${dialog.playlistId}/edit`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle }),
      });
      window.dispatchEvent(new Event("kiyoshi-library-updated"));
    } catch {}
    onClose();
  };
  return (
    <ModalRoot isOpen onOpenChange={(open) => { if (!open) onClose(); }}>
      <ModalBackdrop className="z-[300]!">
        <ModalContainer placement="center" size="sm" className="w-[380px] max-w-[92vw]">
          <ModalDialog>
            <ModalHeader>
              <ModalIcon><PencilSimple size={18} /></ModalIcon>
              <ModalCloseTrigger />
              <ModalHeading>{t("renamePlaylist")}</ModalHeading>
            </ModalHeader>
            <ModalBody>
              <TextFieldRoot aria-label={t("renamePlaylist")} value={name} onChange={setName} className="w-full">
                <InputRoot autoFocus onKeyDown={e => { if (e.key === "Enter") submit(); }} />
              </TextFieldRoot>
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" onPress={onClose}>{t("cancel")}</Button>
              <Button color="accent" variant="solid" isDisabled={!name.trim()} onPress={submit}>{t("save")}</Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </ModalRoot>
  );
}

// Confirm deleting a playlist.
export function DeletePlaylistModal({ dialog, onConfirm, onClose, t }) {
  return (
    <ModalRoot isOpen onOpenChange={(open) => { if (!open) onClose(); }}>
      <ModalBackdrop className="z-[300]!">
        <ModalContainer placement="center" size="sm" className="w-[400px] max-w-[92vw]">
          <ModalDialog>
            <ModalHeader>
              <ModalIcon><Trash size={18} /></ModalIcon>
              <ModalCloseTrigger />
              <ModalHeading>{t("deletePlaylist")}</ModalHeading>
            </ModalHeader>
            <ModalBody>
              <div className="text-t13 text-secondary leading-relaxed">
                {t("deletePlaylistConfirm")}<br /><strong className="text-primary">{dialog.title}</strong>
              </div>
            </ModalBody>
            <ModalFooter>
              <Button variant="ghost" onPress={onClose}>{t("cancel")}</Button>
              <Button variant="danger" onPress={onConfirm}>{t("removeAccountConfirm")}</Button>
            </ModalFooter>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </ModalRoot>
  );
}
