import { useState, useEffect } from "react";
import { API, useLang } from "../context.jsx";
import { DownloadSimple } from "../icons.jsx";
import { Toggle, SettingRow, SettingsSectionLabel } from "../ui/settings-controls.jsx";

export function ComposerSettingsSection() {
  const t = useLang();
  const [autocache, setAutocache] = useState(true);
  useEffect(() => {
    fetch(`${API}/composer-bridge/autocache`).then(r => r.json())
      .then(d => setAutocache(d.enabled !== false)).catch(() => {});
  }, []);
  const toggle = (v) => {
    setAutocache(v);
    fetch(`${API}/composer-bridge/autocache`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: v }),
    }).catch(() => {});
  };
  return (
    <>
      <SettingsSectionLabel>{t("composer")}</SettingsSectionLabel>
      <SettingRow label={t("composerAutocache")} description={t("composerAutocacheDesc")} icon={<DownloadSimple />}>
        <Toggle value={autocache} onChange={toggle} />
      </SettingRow>
    </>
  );
}
