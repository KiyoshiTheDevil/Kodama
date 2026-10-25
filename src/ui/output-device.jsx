// The audio output, as a chip with the device's name: the compact expanded player shows where
// the sound is going and switches it in place, as phone players do. Same list and setting as
// the one in Settings › Playback (audio_outputs / the kiyoshi-audio-output preference).
import { useState, useCallback, useEffect } from "react";
import { DropdownTrigger, DropdownPopover, DropdownMenu, DropdownItem } from "@heroui/react";
import { Dropdown } from "./menu.jsx"; // a sheet from the bottom in the compact layout
import { useLang } from "../context.jsx";
import { SpeakerHigh, Check } from "../icons.jsx";

export function OutputDeviceChip({ value, onChange }) {
  const t = useLang();
  const [devices, setDevices] = useState([]);
  const [systemDefault, setSystemDefault] = useState(null);
  const load = useCallback(async () => {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const info = await invoke("audio_outputs");
      setDevices(info?.devices || []);
      setSystemDefault(info?.systemDefault || null);
    } catch (e) { console.warn("[audio] could not list outputs:", e); }
  }, []);
  useEffect(() => { load(); }, [load]); // the name to show, before the menu is ever opened
  const systemLabel = t("audioOutputSystem") || "System default";
  // The device actually playing: the chosen one, or the system's default when none is chosen.
  const shown = value || systemDefault || systemLabel;
  return (
    <Dropdown onOpenChange={(open) => { if (open) load(); }}>
      <DropdownTrigger aria-label={t("audioOutput") || "Output device"}
        // leading-normal: the row it sits in sets line-height 0 for its icons, which clipped the name away.
        className="min-w-0 max-w-[60%] flex items-center gap-2 h-8 px-2.5 rounded-[var(--r-full)] leading-normal text-[length:var(--t12)] text-secondary hover:text-primary hover:bg-hover"
        onFocus={load}>
        <SpeakerHigh size={14} className="shrink-0 text-accent" />
        <span className="truncate">{shown}</span>
      </DropdownTrigger>
      <DropdownPopover placement="top start" className="[--dd-min-w:15rem]">
        <DropdownMenu aria-label={t("audioOutput") || "Output device"}
          onAction={(key) => onChange?.(key === "__system__" ? "" : String(key))}>
          <DropdownItem id="__system__" textValue={`${systemLabel}${systemDefault ? ` (${systemDefault})` : ""}`}>
            <span className="truncate">{systemLabel}{systemDefault ? ` (${systemDefault})` : ""}</span>
            {!value && <Check size={12} className="ml-auto text-accent shrink-0" />}
          </DropdownItem>
          {devices.map((d) => (
            <DropdownItem key={d} id={d} textValue={d}>
              <span className="truncate">{d}</span>
              {value === d && <Check size={12} className="ml-auto text-accent shrink-0" />}
            </DropdownItem>
          ))}
        </DropdownMenu>
      </DropdownPopover>
    </Dropdown>
  );
}
