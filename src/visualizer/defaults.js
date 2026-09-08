// Canonical visualizer settings. Shared by the renderer (CoverView), the settings tab's
// preset/reset buttons, and the stored-config merge in App().
export const VIZ_DEFAULTS = {
  shape: "frame",          // "frame" | "ring" | "linear"
  linearPos: "bottom",     // (linear only) "bottom" = over the seek bar | "center" = behind cover
  barCount: 56,
  barLength: 90,
  barThickness: 3,
  gap: 8,
  responsiveness: 0.75,    // 0..1, higher = snappier (less release smoothing)
  mirror: false,
  floor: 0,                // 0..1 — gate below
  ceiling: 1,              // 0..1 — clip above (remap [floor,ceiling] → [0,1])
  tilt: 0,                 // 0..1 — high-frequency boost
  smoothBands: 0,          // 0..1 — gaussian smoothing across bands
  render: "bars",          // "bars" | "curve"
  // Canvas draws the bars, so no corner token reaches them - they need a setting of
  // their own. "square" is the counterpart to "round" rather than "butt": both extend
  // the stroke by half its width at each end, so switching does not shorten every bar.
  barCap: "round",         // "round" | "square"
  peakHold: false,         // hold peaks + slow decay
  gradient: false,         // colour by bar height (base → gradColor)
  gradColor: "#ffffff",
  color: "accent",         // "accent" | "custom" | "cover"
  customColor: "#e040fb",
  coverPulse: true, coverPulseStrength: 0.3,
  blobs: true,
};

// Colour helpers for the gradient mode (handle #hex and rgb()).
