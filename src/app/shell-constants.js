import { storageCodecs } from "../shared/hooks/use-persisted-state.js";

// Shell layout geometry — sidebar / queue / fullscreen-split dimensions and the persisted-width
// codecs that clamp them. Shared by AppShell and the layout pieces extracted from it (Step 14).
export const SIDEBAR_EXPANDED = 288; // default expanded width
export const SIDEBAR_COLLAPSED = 56;
export const SIDEBAR_MIN = 230; // min when dragging
export const SIDEBAR_MAX = 440; // max when dragging
export const SPLIT_MIN = 0.22; // min/max cover-pane fraction in the fullscreen split view
export const SPLIT_MAX = 0.78;
export const QUEUE_DEFAULT = 360; // default queue panel width
export const QUEUE_MIN = 320; // min when dragging
export const QUEUE_MAX = 620; // max when dragging

export const SIDEBAR_WIDTH_STORAGE = {
  serialize: storageCodecs.integer.serialize,
  deserialize: (raw) =>
    Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, storageCodecs.integer.deserialize(raw))),
};
export const QUEUE_WIDTH_STORAGE = {
  serialize: storageCodecs.integer.serialize,
  deserialize: (raw) =>
    Math.min(QUEUE_MAX, Math.max(QUEUE_MIN, storageCodecs.integer.deserialize(raw))),
};
