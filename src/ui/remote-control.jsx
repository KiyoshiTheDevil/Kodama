// LAN remote-control UI: the pairing modal (QR + approve/deny) and the settings panel that
// lists paired devices. Extracted from App.jsx; both share the remote i18n + device props.
import { useState, useEffect } from "react";
import { Button, ModalRoot, ModalBackdrop, ModalContainer, ModalDialog, ModalHeader, ModalIcon, ModalHeading, ModalBody, ModalCloseTrigger } from "@heroui/react";
import { DeviceMobile, Check, PushPin, Trash } from "../icons.jsx";
import { useLang } from "../context.jsx";

export function RemotePairModal({ isOpen, onClose, info, devices, onDevice, onRemember }) {
  const t = useLang();
  const [qr, setQr] = useState("");
  const [remember, setRemember] = useState(true);
  const base = info && info.ips && info.ips.length ? `http://${info.ips[0]}:${info.port}/remote` : "";
  const url = base && info?.token ? `${base}#${info.token}` : "";
  useEffect(() => {
    if (!isOpen || !url) { setQr(""); return; }
    let cancel = false;
    import("qrcode")
      .then(QR => (QR.default || QR).toDataURL(url, { margin: 1, width: 320 }))
      .then(d => { if (!cancel) setQr(d); })
      .catch(() => {});
    return () => { cancel = true; };
  }, [isOpen, url]);
  const dev = devices.find(d => d.status === "pending");
  return (
    <ModalRoot isOpen={isOpen} onOpenChange={(o) => { if (!o) onClose(); }}>
      <ModalBackdrop className="z-[320]!">
        <ModalContainer placement="center" size="sm" className="w-[400px] max-w-[92vw]">
          <ModalDialog>
            <ModalHeader>
              <ModalIcon><DeviceMobile size={18} /></ModalIcon>
              <ModalCloseTrigger />
              <ModalHeading>{dev ? t("remoteApproveTitle") : t("remotePairTitle")}</ModalHeading>
            </ModalHeader>
            <ModalBody>
              {dev ? (
                <div className="flex flex-col items-center gap-4 py-2">
                  <div className="w-16 h-16 rounded-full flex items-center justify-center bg-accent-dim">
                    <DeviceMobile size={28} className="text-accent" />
                  </div>
                  <div className="text-center">
                    <div style={{ fontSize: "var(--t15)", fontWeight: 600, color: "var(--text-primary)" }}>{dev.name}</div>
                    <div style={{ fontSize: "var(--t12)", color: "var(--text-muted)", marginTop: 2 }}>{t("remoteWantsConnect")}</div>
                  </div>
                  <button onClick={() => setRemember(r => !r)}
                    style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", cursor: "pointer", fontSize: "var(--t12)", color: "var(--text-secondary)" }}>
                    <span style={{ width: 17, height: 17, borderRadius: 5, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
                      border: `1.5px solid ${remember ? "var(--accent)" : "var(--text-muted)"}`, background: remember ? "var(--accent)" : "transparent" }}>
                      {remember && <Check size={11} weight="bold" className="text-white" />}
                    </span>
                    {t("remoteRemember")}
                  </button>
                  <div className="flex gap-2 w-full pt-1">
                    <Button variant="ghost" className="flex-1 text-[#ff7070]!" onPress={() => onDevice(dev.id, "deny")}>{t("remoteDeny")}</Button>
                    <Button className="flex-1 bg-accent! text-white!" onPress={() => { onRemember(dev.id, dev.name, remember); onDevice(dev.id, "approve"); }}>{t("remoteApprove")}</Button>
                  </div>
                </div>
              ) : base ? (
                <div className="flex flex-col items-center gap-4 py-1">
                  {qr
                    ? <img src={qr} alt="QR" style={{ width: 180, height: 180, borderRadius: 14, background: "#fff", padding: 8 }} />
                    : <div style={{ width: 180, height: 180 }} />}
                  <ol style={{ alignSelf: "stretch", margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 5, fontSize: "var(--t13)", color: "var(--text-secondary)", listStyleType: "decimal" }}>
                    <li>{t("remoteStep1")}</li>
                    <li>{t("remoteStep2")}</li>
                  </ol>
                  <div style={{ fontSize: "var(--t11)", color: "var(--text-muted)", fontFamily: "monospace", wordBreak: "break-all", textAlign: "center" }}>{base}</div>
                </div>
              ) : (
                <div style={{ fontSize: "var(--t12)", color: "var(--text-muted)", textAlign: "center", padding: "12px 0" }}>{t("remoteNoIp")}</div>
              )}
            </ModalBody>
          </ModalDialog>
        </ModalContainer>
      </ModalBackdrop>
    </ModalRoot>
  );
}

// Inline Remote-control panel (Settings): a "Pair new device" button + the list of already
// paired devices. The QR + approval flow lives in RemotePairModal.
export function RemoteControlPanel({ devices, onDevice, onPair, trustedIds, onRemember }) {
  const t = useLang();
  const approved = devices.filter(d => d.status === "approved");
  const pendingCount = devices.filter(d => d.status === "pending").length;
  return (
    <div style={{ margin: "2px 0 6px", padding: "14px 16px", background: "var(--fill-subtle)", borderRadius: 12, display: "flex", flexDirection: "column", gap: 11 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <Button size="sm" className="bg-accent! text-white!" onPress={onPair}>
          <DeviceMobile size={14} /> {t("remotePairNew")}
        </Button>
        {pendingCount > 0 && (
          <button onClick={onPair} style={{ background: "none", border: "none", cursor: "default", padding: 0, fontSize: "var(--t12)", color: "var(--accent)" }}>
            {t("remoteWaitingReview", { n: pendingCount })}
          </button>
        )}
      </div>
      {approved.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {approved.map(d => (
            <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: d.online ? "#3ddc84" : "var(--text-muted)" }} />
              <span style={{ flex: 1, minWidth: 0, fontSize: "var(--t12)", color: "var(--text-primary)" }}>
                {d.name} <span style={{ color: "var(--text-muted)" }}>· {d.online ? t("remoteConnected") : t("remoteOffline")}</span>
              </span>
              <Button size="sm" variant="ghost" isIconOnly title={t("remoteRememberDevice")}
                className={`h-7 min-w-7 ${trustedIds.has(d.id) ? "text-accent!" : "text-muted"}`}
                onPress={() => onRemember(d.id, d.name, !trustedIds.has(d.id))}>
                <PushPin size={13} weight={trustedIds.has(d.id) ? "fill" : "regular"} />
              </Button>
              <Button size="sm" variant="ghost" isIconOnly className="h-7 min-w-7 text-muted hover:text-[#ff7070]!" onPress={() => onDevice(d.id, "remove")}><Trash size={13} /></Button>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontSize: "var(--t12)", color: "var(--text-muted)" }}>{t("remoteNoDevices")}</div>
      )}
    </div>
  );
}
