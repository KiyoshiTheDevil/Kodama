// Correcting what Last.fm records for one track.
//
// The fields open filled with what would actually be sent right now, rules already applied,
// rather than with the raw metadata: the point of a correction is to change the outcome, and a
// dialog that shows something other than the outcome makes you guess at what you are changing.
//
// Built on the app's own modal rather than a hand-made floating box, like the crossfade editor
// beside it — the header, the close control, the backdrop and its motion all come from there.
import { useState } from "react";
import {
  Button, InputRoot, ModalBackdrop, ModalBody, ModalCloseTrigger, ModalContainer,
  ModalHeader, ModalHeading, ModalIcon, ModalRoot, TextFieldRoot,
} from "@heroui/react";
import { ModalDialog } from "../ui/zoomed-heroui.jsx";
import { PencilSimple } from "../icons.jsx";
import { useLang } from "../context.jsx";
import { loadOverrides, loadPrimaryArtistOnly, removeOverride, resolveScrobbleMeta, setOverride } from "./scrobble-rules.js";

export function ScrobbleEditModal({ track, onClose }) {
  const t = useLang();
  const resolved = resolveScrobbleMeta(track, {
    primaryOnly: loadPrimaryArtistOnly(),
    overrides: loadOverrides(),
  });
  const [hasOverride] = useState(() => !!loadOverrides()[track?.videoId]);
  const [artist, setArtist] = useState(resolved.artist);
  const [title, setTitle] = useState(resolved.track);

  const save = () => {
    setOverride(track?.videoId, { artist, title, label: track?.title });
    onClose();
  };

  return (
    <ModalRoot isOpen onOpenChange={(open) => { if (!open) onClose(); }}>
      <ModalBackdrop className="z-[320]!">
        <ModalContainer placement="center" size="sm" className="w-[420px] max-w-[92vw]">
          <ModalDialog>
            <ModalHeader>
              <ModalIcon><PencilSimple size={18} /></ModalIcon>
              <ModalCloseTrigger />
              <ModalHeading>{t("scrobbleEdit")}</ModalHeading>
            </ModalHeader>
            <ModalBody>
              <div className="flex flex-col gap-4 pb-1">
                <p className="text-t11 text-muted">{t("scrobbleEditDesc")}</p>

                <div className="flex flex-col gap-1.5">
                  <span className="text-t11 text-muted">{t("scrobbleArtist")}</span>
                  <TextFieldRoot value={artist} onChange={setArtist} aria-label={t("scrobbleArtist")}>
                    <InputRoot autoFocus className="text-t13!" />
                  </TextFieldRoot>
                </div>

                <div className="flex flex-col gap-1.5">
                  <span className="text-t11 text-muted">{t("scrobbleTitle")}</span>
                  <TextFieldRoot value={title} onChange={setTitle} aria-label={t("scrobbleTitle")}>
                    <InputRoot className="text-t13!" />
                  </TextFieldRoot>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  {/* Only when there is something to undo, so it never offers to reverse a
                      correction that was never made. */}
                  {hasOverride
                    ? <Button variant="ghost" size="sm" className="text-[var(--status-danger)]!"
                        onPress={() => { removeOverride(track?.videoId); onClose(); }}>{t("scrobbleReset")}</Button>
                    : <span />}
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onPress={onClose}>{t("cancel")}</Button>
                    <Button size="sm" className="bg-accent! text-white!"
                      isDisabled={!artist.trim() && !title.trim()} onPress={save}>{t("save")}</Button>
                  </div>
                </div>
              </div>
            </ModalBody>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </ModalRoot>
  );
}
