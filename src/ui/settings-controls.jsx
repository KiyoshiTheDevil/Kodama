// Small shared settings/UI primitives extracted from App.jsx. Thin wrappers around HeroUI so
// the many existing call sites ({value,onChange} etc.) stay unchanged.
import React from "react";
import { SliderRoot, SliderTrack, SliderFill, SliderThumb, SwitchRoot, SwitchControl, SwitchThumb, CardRoot } from "@heroui/react";

export function Slider({ min, max, step = 1, value, onChange, onChangeCommit, width = 120 }) {
  // Thin wrapper around HeroUI Slider so existing {min,max,step,value,onChange,onChangeCommit,width} callers stay unchanged.
  return (
    <SliderRoot
      aria-label="slider"
      value={value}
      minValue={min}
      maxValue={max}
      step={step}
      onChange={onChange}
      onChangeEnd={onChangeCommit}
      className="shrink-0"
      style={{ width }}
    >
      <SliderTrack>
        <SliderFill />
        <SliderThumb />
      </SliderTrack>
    </SliderRoot>
  );
}

export function Toggle({ value, onChange }) {
  // Thin wrapper around HeroUI Switch so all existing Toggle({value,onChange}) call sites stay unchanged.
  return (
    <SwitchRoot isSelected={!!value} onChange={onChange} aria-label="toggle">
      <SwitchControl>
        <SwitchThumb />
      </SwitchControl>
    </SwitchRoot>
  );
}

export function SettingRow({ label, description, icon, children }) {
  return (
    <CardRoot variant="secondary" className="bg-surface-1 flex flex-row items-center justify-between gap-4 px-[18px] py-4 mb-1.5">
      <div className="flex items-center gap-3 min-w-0">
        {icon && (
          <div className="w-[30px] h-[30px] rounded-md shrink-0 flex items-center justify-center text-accent">
            {React.cloneElement(icon, { size: 15 })}
          </div>
        )}
        <div className="min-w-0">
          <div className="text-t13 font-medium text-primary">{label}</div>
          {description && <div className="text-t11 text-muted mt-0.5 leading-snug">{description}</div>}
        </div>
      </div>
      <div className="shrink-0">{children}</div>
    </CardRoot>
  );
}

export function SettingsSectionLabel({ children, style }) {
  return (
    <div style={{
      fontSize: 13,
      fontWeight: 600,
      color: "var(--t1)",
      margin: "24px 0 10px 2px",
      ...style,
    }}>{children}</div>
  );
}

// Explanatory text shown under a section header. Same size as the header (13px),
// muted, for a consistent look across all settings sections.
export function SettingsSectionDesc({ children, style }) {
  return (
    <div style={{
      fontSize: 13,
      color: "var(--text-muted)",
      lineHeight: 1.5,
      margin: "-4px 0 12px 2px",
      ...style,
    }}>{children}</div>
  );
}
