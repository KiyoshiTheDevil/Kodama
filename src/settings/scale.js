// Stepped values for the zoom and font-size sliders
export const ZOOM_STEPS      = [0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5];
export const ZOOM_LABELS     = ["80%", "90%", "100%", "110%", "120%", "130%", "140%", "150%"];
export const FONT_STEPS      = [0.85, 0.93, 1.0, 1.10, 1.20, 1.35, 1.50];
export const FONT_LABELS     = FONT_STEPS.map(s => `${Math.round(13 * s)}px`);
