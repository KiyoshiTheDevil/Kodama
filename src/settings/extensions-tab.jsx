// Settings for installed extensions, drawn by Kodama from what each manifest declares.
//
// Drawn here rather than by the extension because a background extension has no surface of its
// own, and asking for a token should not require one. It also keeps every form in Kodama's own
// controls: an extension describes a field, it does not get to style a password box.
//
// Values go into the extension's own storage, through the same quota'd store the bridge uses, so
// the extension reads them with storage.get like anything else it keeps.
import { useEffect, useState } from "react";
import { Button, InputRoot, TextFieldRoot } from "@heroui/react";
import { Eye, EyeSlash, PuzzlePiece } from "../icons.jsx";
import { SettingRow, SettingsSectionLabel, Toggle } from "../ui/settings-controls.jsx";
import { installedExtensions, onExtensionsChanged } from "../extensions/registry.js";
import { localisedText } from "../extensions/manifest.js";
import { storageImpl } from "../extensions/bridge.js";
import { EXTENSION_SETTINGS_EVENT } from "../extensions/background.jsx";
import { thumb } from "../context.jsx";

const store = storageImpl(
  (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  (k, v) => localStorage.setItem(k, v),
);

/** Installed extensions that declare at least one setting. */
export function extensionsWithSettings() {
  return installedExtensions().filter(m => m.settings?.length);
}

/** The same list, kept current as extensions are installed or removed in any window. */
export function useExtensionsWithSettings() {
  const [list, setList] = useState(() => extensionsWithSettings());
  useEffect(() => onExtensionsChanged(() => setList(extensionsWithSettings())), []);
  return list;
}

function tell(manifest, key) {
  window.dispatchEvent(new CustomEvent(EXTENSION_SETTINGS_EVENT, { detail: { id: manifest.id, key } }));
}

function TextSetting({ manifest, setting, lang, t }) {
  const saved = String(store["storage.get"]({ key: setting.key }, manifest) ?? "");
  const [draft, setDraft] = useState(saved);
  const [shown, setShown] = useState(false);
  const [stored, setStored] = useState(saved);
  const [error, setError] = useState("");
  const secret = setting.type === "secret";
  const changed = draft !== stored;

  const save = () => {
    try {
      store["storage.set"]({ key: setting.key, value: draft.trim() }, manifest);
      setStored(draft.trim());
      setDraft(draft.trim());
      setError("");
      tell(manifest, setting.key);
    } catch (e) {
      setError(String(e?.message || e));
    }
  };

  return (
    <SettingRow vertical label={localisedText(setting.label, lang)} description={localisedText(setting.hint, lang) || undefined}>
      <div className="flex items-center gap-2">
        <TextFieldRoot aria-label={localisedText(setting.label, lang)} value={draft} onChange={setDraft} className="flex-1">
          <InputRoot
            type={secret && !shown ? "password" : "text"}
            autoComplete="off"
            spellCheck={false}
            onKeyDown={e => { if (e.key === "Enter" && changed) save(); }}
          />
        </TextFieldRoot>
        {secret && (
          <Button variant="ghost" size="sm" isIconOnly onPress={() => setShown(s => !s)}
            aria-label={shown ? t("extSettingHide") : t("extSettingShow")}>
            {shown ? <EyeSlash size={15} /> : <Eye size={15} />}
          </Button>
        )}
        <Button variant="primary" size="sm" isDisabled={!changed} onPress={save}>{t("save")}</Button>
      </div>
      {error && <div className="mt-1 text-[length:var(--t11)]" style={{ color: "var(--status-danger)" }}>{error}</div>}
    </SettingRow>
  );
}

function ToggleSetting({ manifest, setting, lang }) {
  // Unset shows the declared default, which is what the extension itself assumes until it is set.
  const [on, setOn] = useState(() => {
    const v = store["storage.get"]({ key: setting.key }, manifest);
    return v === null ? !!setting.default : !!v;
  });
  return (
    <SettingRow label={localisedText(setting.label, lang)} description={localisedText(setting.hint, lang) || undefined}>
      <Toggle value={on} onChange={(v) => {
        try {
          store["storage.set"]({ key: setting.key, value: !!v }, manifest);
          setOn(!!v);
          tell(manifest, setting.key);
        } catch { /* over quota: the switch simply stays where it was */ }
      }} />
    </SettingRow>
  );
}

export function ExtensionsTab({ t, lang }) {
  const list = useExtensionsWithSettings();
  return (
    <div className="flex flex-col gap-7">
      {list.map(m => (
        <div key={m.id}>
          <SettingsSectionLabel>
            <span className="inline-flex items-center gap-2">
              {m.icon
                ? <img src={thumb(m.icon)} alt="" className="h-4 w-4 object-contain" />
                : <PuzzlePiece size={14} />}
              {m.name}
            </span>
          </SettingsSectionLabel>
          <div>
            {m.settings.map(st => st.type === "toggle"
              ? <ToggleSetting key={st.key} manifest={m} setting={st} lang={lang} />
              : <TextSetting key={st.key} manifest={m} setting={st} lang={lang} t={t} />)}
          </div>
        </div>
      ))}
      <div className="text-[length:var(--t11)] leading-relaxed text-muted">{t("extSettingsNote")}</div>
    </div>
  );
}
