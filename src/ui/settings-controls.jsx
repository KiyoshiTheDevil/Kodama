// Small shared settings/UI primitives extracted from App.jsx. Thin wrappers around HeroUI so
// the many existing call sites ({value,onChange} etc.) stay unchanged.
import React, { Children, cloneElement, isValidElement, useId } from "react";
import { SliderRoot, SliderTrack, SliderFill, SliderThumb, SwitchRoot, SwitchControl, SwitchThumb } from "@heroui/react";
import { groupCorners } from "./corners.js";

export function Slider({
  min, max, step = 1, value, onChange, onChangeCommit, width = 120,
  "aria-label": ariaLabel, "aria-labelledby": ariaLabelledBy,
}) {
  // Thin wrapper around HeroUI Slider so existing {min,max,step,value,onChange,onChangeCommit,width} callers stay unchanged.
  // A control needs a name; inside a SettingRow it gets one from the row's own label, so the
  // fallback below is only for the handful of sliders that sit somewhere else.
  return (
    <SliderRoot
      aria-label={ariaLabelledBy ? undefined : (ariaLabel || "Slider")}
      aria-labelledby={ariaLabelledBy}
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

export function Toggle({ value, onChange, "aria-label": ariaLabel, "aria-labelledby": ariaLabelledBy }) {
  // Thin wrapper around HeroUI Switch so all existing Toggle({value,onChange}) call sites stay unchanged.
  return (
    <SwitchRoot
      isSelected={!!value}
      onChange={onChange}
      aria-label={ariaLabelledBy ? undefined : (ariaLabel || "Toggle")}
      aria-labelledby={ariaLabelledBy}
    >
      <SwitchControl>
        <SwitchThumb />
      </SwitchControl>
    </SwitchRoot>
  );
}

export function SettingRow({ label, description, icon, children, vertical = false }) {
  // The row's visible label also names the control in it. Without this a screen reader reads
  // "switch" or "slider" and stops, on some seventy rows; naming each one by hand would mean
  // seventy strings to keep in step with the labels right beside them.
  //
  // Only a single element child is named, and only one that does not already say what it is:
  // a row holding two buttons has their own text, and one that passes an aria-label meant it.
  // Slider and Toggle above read the attribute; anything else gets a harmless extra attribute
  // it may ignore.
  const labelId = useId();
  const only = Children.count(children) === 1 ? Children.only(children) : null;
  const named = only && isValidElement(only)
    && !only.props["aria-label"] && !only.props["aria-labelledby"]
    ? cloneElement(only, { "aria-labelledby": labelId })
    : children;

  // A plain div rather than CardRoot: the surface, the radius and the spacing all belong to
  // the `.setting-row` rules in index.css, which fuse adjacent rows into one group. Keeping
  // the card here would mean fighting its own radius from a second stylesheet.
  return (
    <div className={`setting-row gap-4 px-[18px] py-4 ${
      vertical ? "flex flex-col items-stretch" : "flex flex-row items-center justify-between"
    }`}>
      <div className="flex items-center gap-3 min-w-0">
        {icon && (
          <div className="w-[30px] h-[30px] rounded-md shrink-0 flex items-center justify-center text-accent">
            {React.cloneElement(icon, { size: 15 })}
          </div>
        )}
        <div className="min-w-0">
          <div id={labelId} className="text-[length:var(--t13)] font-medium text-primary">{label}</div>
          {description && <div className="text-[length:var(--t11)] text-muted mt-0.5 leading-snug">{description}</div>}
        </div>
      </div>
      <div className={vertical ? "" : "shrink-0"}>{named}</div>
    </div>
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

/**
 * A segmented picker in the app's own chip language - the one the overlay editor's File/Edit/
 * View buttons speak: filled surface-2 chips, 30px tall, 6px apart, brightening on hover.
 *
 * The shape is the group's, not each button's: free ends keep the pill radius, touching ends
 * take a small notch, exactly as hdrCorners does it for the window chrome. That is what makes
 * three chips read as one control rather than three buttons that happen to be near each other.
 *
 * Applied through HeroUI's own toggle-button variables rather than by overriding its rules, so
 * the component keeps its focus ring, its pressed scale and its disabled handling.
 *
 * Selected uses accent-dim with accent text, which is how the app already says "this is the
 * active one" in the sidebar's navigation and in the bug report's category picker.
 */
export const SEGMENTED_GROUP = "gap-[6px]";
export const SEGMENTED_STYLE = {
  "--toggle-button-bg": "var(--surface-2)",
  "--toggle-button-bg-hover": "var(--surface-3)",
  "--toggle-button-bg-pressed": "var(--surface-3)",
  "--toggle-button-bg-selected": "var(--accent-dim)",
  "--toggle-button-bg-selected-hover": "var(--accent-dim)",
  "--toggle-button-fg-selected": "var(--accent)",
};
export const SEGMENTED_BUTTON = "h-[30px]! md:h-[30px]! px-4! text-[length:var(--t13)]!";

/**
 * The corners for the button at `index` of `count`, in that grouped shape.
 *
 * Written out rather than left to rounded-full: at 30px tall the pill value IS 15, and stating
 * it keeps the 6px notch at 6. Ask for a radius larger than half the side and the browser
 * scales every corner of the element down to fit - the notch with them.
 */
export function segmentedCorners(index, count, height = 30) {
  const pill = height / 2;
  const notch = 6;
  const l = index === 0 ? pill : notch;
  const r = index === count - 1 ? pill : notch;
  return groupCorners(l, r);
}
