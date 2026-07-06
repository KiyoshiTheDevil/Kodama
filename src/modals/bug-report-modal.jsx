// Bug-report / feedback modal. Submits to the local backend, which forwards to a Discord
// webhook. Version (passed in) + OS (and optionally recent backend logs) are attached
// automatically. Extracted from App.jsx.
import { useState } from "react";
import { cn, Button, Spinner, TextFieldRoot, InputRoot, TextArea, ModalRoot, ModalBackdrop, ModalContainer, ModalDialog, ModalHeader, ModalIcon, ModalHeading, ModalBody, ModalFooter, ModalCloseTrigger } from "@heroui/react";
import { Bug, CheckCircle, Info, ImageSquare, PaperPlaneTilt } from "../icons.jsx";
import { Toggle } from "../ui/settings-controls.jsx";
import { API } from "../context.jsx";

// Short, human-readable OS string for bug-report diagnostics.
const OS_INFO = (() => {
  const ua = navigator.userAgent || "";
  let os = navigator.platform || "Unknown";
  if (/Windows NT 10/.test(ua)) os = "Windows 10/11";
  else if (/Windows/.test(ua)) os = "Windows";
  else if (/Mac OS X|Macintosh/.test(ua)) os = "macOS";
  else if (/Linux|X11/.test(ua)) os = "Linux";
  const arch = /x64|Win64|WOW64|x86_64/.test(ua) ? "x64" : (/arm64|aarch64/i.test(ua) ? "arm64" : "");
  return arch ? `${os} · ${arch}` : os;
})();

export function BugReportModal({ onClose, screenshot, t, version }) {
  const CATS = [
    { value: "Bug", label: t("catBug") || "Bug" },
    { value: "Absturz", label: t("catCrash") || "Crash" },
    { value: "UI / Design", label: t("catUI") || "UI / Design" },
    { value: "Vorschlag", label: t("catSuggestion") || "Suggestion" },
  ];
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Bug");
  const [description, setDescription] = useState("");
  const [includeDiag, setIncludeDiag] = useState(true);
  const [includeShot, setIncludeShot] = useState(!!screenshot);
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState(null); // null | "ok" | "error" | "unconfigured"

  const submit = async () => {
    if ((!title.trim() && !description.trim()) || sending) return;
    setSending(true); setStatus(null);
    try {
      const r = await fetch(`${API}/feedback`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(), category, description: description.trim(),
          version, os: OS_INFO, includeLogs: includeDiag,
          screenshot: (includeShot && screenshot) ? screenshot : undefined,
        }),
      });
      if (r.ok) { setStatus("ok"); setTimeout(onClose, 1500); }
      else if (r.status === 503) setStatus("unconfigured");
      else setStatus("error");
    } catch { setStatus("error"); }
    setSending(false);
  };

  const fieldLabel = "text-t10 font-bold uppercase tracking-[0.08em] text-muted";
  return (
    <ModalRoot isOpen onOpenChange={(open) => { if (!open) onClose(); }}>
      <ModalBackdrop className="z-[300]!">
        <ModalContainer placement="center" size="lg" className="w-[560px] max-w-[92vw]">
          <ModalDialog>
            <ModalHeader>
              <ModalIcon><Bug size={18} /></ModalIcon>
              <ModalCloseTrigger />
              <ModalHeading>{t("reportBug") || "Fehler melden"}</ModalHeading>
            </ModalHeader>
            <ModalBody>
              {status === "ok" ? (
                <div className="flex flex-col items-center gap-3 py-8">
                  <CheckCircle size={44} weight="fill" className="text-accent" />
                  <div className="text-t14 font-semibold">{t("reportSent") || "Danke! Dein Report wurde gesendet."}</div>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  <div className="flex flex-col gap-2">
                    <label className={fieldLabel}>{t("reportTitle") || "Titel"}</label>
                    <TextFieldRoot aria-label={t("reportTitle") || "Titel"} value={title} onChange={setTitle} className="w-full">
                      <InputRoot autoFocus placeholder={t("reportTitlePlaceholder") || "Kurz: was ist passiert?"} />
                    </TextFieldRoot>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className={fieldLabel}>{t("reportCategory") || "Kategorie"}</label>
                    <div className="flex flex-wrap gap-2">
                      {CATS.map((c) => (
                        <button key={c.value} onClick={() => setCategory(c.value)}
                          className={cn("px-3.5 py-2 rounded-xl text-t13 border-none transition-colors duration-150",
                            category === c.value ? "bg-accent-dim text-accent font-semibold" : "bg-transparent text-secondary hover:bg-hover border border-border")}>
                          {c.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className={fieldLabel}>{t("reportDescription") || "Beschreibung & Schritte"}</label>
                    <TextFieldRoot aria-label={t("reportDescription") || "Beschreibung"} value={description} onChange={setDescription} className="w-full">
                      <TextArea className="min-h-[110px] resize-none" placeholder={t("reportDescPlaceholder") || "Was hast du erwartet, was ist stattdessen passiert? Schritte zum Nachstellen?"} />
                    </TextFieldRoot>
                  </div>
                  <div className="rounded-xl bg-elevated px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <Info size={15} className="text-muted shrink-0" />
                        <span className="text-t13 font-medium">{t("reportDiagnostics") || "Diagnose anhängen"}</span>
                      </div>
                      <Toggle value={includeDiag} onChange={setIncludeDiag} />
                    </div>
                    {includeDiag && (
                      <div className="flex flex-wrap gap-1.5 mt-2.5">
                        {[`v${version}`, OS_INFO, t("reportLogs") || "letzte Log-Zeilen"].map((chip, i) => (
                          <span key={i} className="text-t11 font-mono px-2 py-0.5 rounded-md bg-surface border border-border text-secondary">{chip}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  {screenshot && (
                    <div className="rounded-xl bg-elevated px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0">
                          <ImageSquare size={15} className="text-muted shrink-0" />
                          <span className="text-t13 font-medium">{t("reportScreenshot") || "Attach screenshot"}</span>
                        </div>
                        <Toggle value={includeShot} onChange={setIncludeShot} />
                      </div>
                      {includeShot && (
                        <img src={`data:image/png;base64,${screenshot}`} alt=""
                          className="mt-2.5 w-full rounded-lg border border-border" style={{ maxHeight: 150, objectFit: "cover", objectPosition: "top" }} />
                      )}
                    </div>
                  )}
                  {status === "error" && <div className="text-t12 text-red-400">{t("reportError") || "Senden fehlgeschlagen. Bitte später erneut versuchen."}</div>}
                  {status === "unconfigured" && <div className="text-t12 text-amber-400">{t("reportUnconfigured") || "Feedback ist in diesem Build noch nicht konfiguriert."}</div>}
                </div>
              )}
            </ModalBody>
            {status !== "ok" && (
              <ModalFooter>
                <span className="text-t11 text-muted mr-auto">{t("reportAnon") || "Anonym · keine Account-Daten"}</span>
                <Button variant="ghost" onPress={onClose}>{t("cancel")}</Button>
                <Button color="accent" variant="solid" isDisabled={(!title.trim() && !description.trim()) || sending} onPress={submit}>
                  {sending ? <Spinner size="sm" /> : <span className="flex items-center gap-1.5"><PaperPlaneTilt size={15} />{t("reportSend") || "Senden"}</span>}
                </Button>
              </ModalFooter>
            )}
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </ModalRoot>
  );
}
