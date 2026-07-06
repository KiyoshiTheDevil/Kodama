// Per-transition crossfade editor — set/override the crossfade duration for a specific
// track→track transition in the queue. Extracted from App.jsx.
import { useState } from "react";
import { Button, ModalRoot, ModalBackdrop, ModalContainer, ModalDialog, ModalHeader, ModalIcon, ModalHeading, ModalBody, ModalCloseTrigger } from "@heroui/react";
import { Sliders } from "../icons.jsx";
import { useLang } from "../context.jsx";
import { Slider } from "../ui/settings-controls.jsx";

export function FadeEditorModal({ from, to, current, globalDefault = 0, onSave, onClear, onClose }) {
  const t = useLang();
  const [secs, setSecs] = useState(current != null ? current : (globalDefault || 5));
  return (
    <ModalRoot isOpen onOpenChange={(open) => { if (!open) onClose(); }}>
      <ModalBackdrop className="z-[320]!">
        <ModalContainer placement="center" size="sm" className="w-[420px] max-w-[92vw]">
          <ModalDialog>
            <ModalHeader>
              <ModalIcon><Sliders size={18} /></ModalIcon>
              <ModalCloseTrigger />
              <ModalHeading>{t("customCrossfade")}</ModalHeading>
            </ModalHeader>
            <ModalBody>
              <div className="flex flex-col gap-4 pb-1">
                <div className="flex items-center gap-2 text-t12">
                  <span className="flex-1 min-w-0 truncate font-medium text-primary">{from?.title}</span>
                  <span className="shrink-0 text-accent font-bold">→</span>
                  <span className="flex-1 min-w-0 truncate font-medium text-primary text-right">{to?.title}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Slider min={0} max={12} step={1} value={secs} onChange={setSecs} width={180} />
                  <span className="text-t12 text-secondary w-9 text-right">{secs}s</span>
                </div>
                <p className="text-t11 text-muted">
                  {secs === 0 ? t("crossfadeHardCut") : t("customCrossfadeHint", { secs })}
                  {" · "}{t("crossfadeDefault")}: {globalDefault}s
                </p>
                <div className="flex items-center justify-between gap-2 pt-1">
                  {current != null
                    ? <Button variant="ghost" size="sm" className="text-[#ff7070]!" onPress={() => { onClear(); onClose(); }}>{t("removeOverride")}</Button>
                    : <span />}
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onPress={onClose}>{t("cancel")}</Button>
                    <Button size="sm" className="bg-accent! text-white!" onPress={() => { onSave(secs); onClose(); }}>{t("save")}</Button>
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
