import { useState, useEffect } from "react";
import { Button, CardRoot, InputRoot, Spinner, TextFieldRoot } from "@heroui/react";
import { useLang } from "../context.jsx";
import { DownloadSimple, Key, UserCircle } from "../icons.jsx";
import { SettingsSectionLabel, SettingsSectionDesc } from "../ui/settings-controls.jsx";
import { unisonSetNickname, unisonResetNickname, unisonFetchDisplayName } from "../unison/api.js";
import { generateIdentity, importIdentityFile, exportIdentityFile } from "../unison/identity.js";

export function UnisonIdentitySection() {
  const t = useLang();
  const [identity, setIdentity] = useState(() => {
    try { const raw = localStorage.getItem("kodama-unison-identity"); return raw ? JSON.parse(raw) : null; }
    catch { return null; }
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [serverName, setServerName] = useState(null);   // resolved nickname or pet name from server
  const [nickDraft, setNickDraft] = useState("");
  const [nickBusy, setNickBusy] = useState(false);
  const [nickErr, setNickErr] = useState("");

  const NICK_RE = /^[A-Za-z0-9_]{3,20}$/;

  const persist = (id) => {
    try { localStorage.setItem("kodama-unison-identity", JSON.stringify(id)); } catch {}
    setIdentity(id);
  };

  // Resolve the current display name from the server (custom nickname, or derived pet name).
  useEffect(() => {
    let alive = true;
    setServerName(null); setNickDraft(""); setNickErr("");
    if (!identity?.keyId) return;
    (async () => {
      const name = await unisonFetchDisplayName(identity.keyId);
      if (!alive) return;
      const resolved = name || identity.displayName || "";
      setServerName(resolved);
      // Pre-fill draft only if the server name looks like a custom nickname (not the derived pet name).
      setNickDraft(resolved && resolved !== identity.displayName ? resolved : "");
    })();
    return () => { alive = false; };
  }, [identity?.keyId]);

  const hasCustomNick = !!serverName && serverName !== identity?.displayName;

  const saveNick = async () => {
    const v = nickDraft.trim();
    if (!NICK_RE.test(v)) { setNickErr(t("unisonNicknameInvalid")); return; }
    setNickBusy(true); setNickErr("");
    try {
      await unisonSetNickname(v);
      setServerName(v);
    } catch (e) {
      setNickErr(String(e?.message) === "nickname_taken" ? t("unisonNicknameTaken") : t("unisonNicknameError"));
    }
    setNickBusy(false);
  };

  const resetNick = async () => {
    setNickBusy(true); setNickErr("");
    try {
      await unisonResetNickname();
      setServerName(identity.displayName || "");
      setNickDraft("");
    } catch { setNickErr(t("unisonNicknameError")); }
    setNickBusy(false);
  };

  const create = async () => {
    setBusy(true); setErr("");
    try { persist(await generateIdentity()); }
    catch { setErr(t("unisonGenericError")); }
    setBusy(false);
  };

  const importFile = async () => {
    setErr("");
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const path = await open({ title: t("unisonImportKey"), filters: [{ name: "Key", extensions: ["json", "key"] }] });
      if (!path) return;
      const { readTextFile } = await import("@tauri-apps/plugin-fs");
      const id = await importIdentityFile(await readTextFile(path));
      persist(id);
    } catch { setErr(t("unisonImportError")); }
  };

  const exportFile = async () => {
    if (!identity) return;
    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const { writeTextFile } = await import("@tauri-apps/plugin-fs");
      const base = (identity.displayName || identity.keyId.slice(0, 10)).replace(/[^\w-]/g, "_");
      const path = await save({ defaultPath: `unison-identity-${base}.json`, filters: [{ name: "Key", extensions: ["json"] }] });
      if (!path) return;
      await writeTextFile(path, JSON.stringify(exportIdentityFile(identity), null, 2));
    } catch {}
  };

  const remove = () => { try { localStorage.removeItem("kodama-unison-identity"); } catch {} setIdentity(null); };

  return (
    <>
      <SettingsSectionLabel>{t("unisonIdentity")}</SettingsSectionLabel>
      <SettingsSectionDesc>{t("unisonIdentityDesc")}</SettingsSectionDesc>
      <CardRoot variant="secondary" className="p-4 flex flex-col gap-3">
        {!identity ? (
          <>
            <div className="text-t12 text-muted leading-relaxed">{t("unisonNoIdentity")}</div>
            <div className="flex items-center gap-2">
              <Button color="accent" variant="solid" className="flex-1 justify-center" isDisabled={busy} onPress={create}>
                {busy ? <Spinner size="sm" /> : t("unisonCreate")}
              </Button>
              <Button variant="secondary" className="flex-1 justify-center gap-2" onPress={importFile}>
                <DownloadSimple size={15} className="rotate-180" />{t("unisonImportKey")}
              </Button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-accent-dim text-accent flex items-center justify-center shrink-0"><UserCircle size={20} /></div>
              <div className="flex-1 min-w-0">
                <div className="text-t13 font-semibold truncate">{serverName || identity.displayName || t("unisonAnonymous")}</div>
                <button onClick={() => navigator.clipboard.writeText(identity.keyId).catch(() => {})} title={t("copy")}
                  className="text-t10 text-muted font-mono truncate hover:text-primary bg-transparent border-0 p-0 cursor-default block max-w-full">
                  {identity.keyId.slice(0, 10)}…{identity.keyId.slice(-6)}
                </button>
              </div>
            </div>

            {/* Custom nickname editor */}
            <div className="flex flex-col gap-1.5">
              <div className="text-t11 font-semibold text-secondary">{t("unisonNickname")}</div>
              <div className="text-t10 text-muted leading-relaxed">{t("unisonNicknameDesc")}</div>
              <div className="flex items-center gap-2 mt-0.5">
                <TextFieldRoot aria-label={t("unisonNickname")} className="flex-1" value={nickDraft} onChange={setNickDraft}>
                  <InputRoot placeholder={identity.displayName || ""} maxLength={20}
                    onKeyDown={(e) => { if (e.key === "Enter") saveNick(); }} />
                </TextFieldRoot>
                <Button color="accent" variant="solid" className="justify-center shrink-0" isDisabled={nickBusy || !NICK_RE.test(nickDraft.trim()) || nickDraft.trim() === serverName} onPress={saveNick}>
                  {nickBusy ? <Spinner size="sm" /> : t("save")}
                </Button>
                {hasCustomNick ? (
                  <Button variant="secondary" className="justify-center shrink-0" isDisabled={nickBusy} onPress={resetNick}>
                    {t("reset")}
                  </Button>
                ) : null}
              </div>
              {nickErr ? <div className="text-t10 text-[var(--status-danger)]">{nickErr}</div>
                : <div className="text-t10 text-muted">{t("unisonNameDerived")}</div>}
            </div>

            <div className="flex items-center gap-2">
              <Button variant="secondary" className="flex-1 justify-center gap-2" onPress={exportFile}>
                <DownloadSimple size={15} />{t("unisonExportKey")}
              </Button>
              <Button variant="secondary" className="flex-1 justify-center gap-2" onPress={importFile}>
                <DownloadSimple size={15} className="rotate-180" />{t("unisonImportKey")}
              </Button>
            </div>
            <Button variant="ghost" className="justify-center text-[var(--status-danger)]!" onPress={remove}>{t("unisonRemove")}</Button>
          </>
        )}
        {err ? <div className="text-t11 text-[var(--status-danger)]">{err}</div> : null}
      </CardRoot>
    </>
  );
}

// Composer-related settings (backend-backed, since the composer talks to Kodama's bridge).
