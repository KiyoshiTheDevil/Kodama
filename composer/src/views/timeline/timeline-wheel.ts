// -- Types ---------------------------------------------------------------------

type WheelAction = { kind: "zoom" } | { kind: "scrub" } | { kind: "scroll"; axis: "x" | "y" } | { kind: "native" };

interface WheelDecisionInput {
  deltaX: number;
  deltaY: number;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  overWaveform: boolean;
  horizontalScrollSetting: boolean;
}

// -- Constants -----------------------------------------------------------------

const DOM_DELTA_LINE = 1;
const DOM_DELTA_PAGE = 2;
const WHEEL_LINE_HEIGHT = 40;
const WHEEL_PAGE_HEIGHT = 800;

// -- Functions -----------------------------------------------------------------

function decideWheelAction(input: WheelDecisionInput): WheelAction {
  if (input.ctrlKey || input.metaKey) return { kind: "zoom" };
  if (input.overWaveform) return { kind: "scrub" };
  if (input.horizontalScrollSetting) {
    if (input.shiftKey) return { kind: "scroll", axis: "y" };
    if (Math.abs(input.deltaX) > Math.abs(input.deltaY)) return { kind: "native" };
    return { kind: "scroll", axis: "x" };
  }
  return { kind: "native" };
}

function computeScrubTime(currentTime: number, deltaY: number, zoom: number, duration: number): number {
  if (zoom <= 0) return currentTime;
  const next = currentTime + deltaY / zoom;
  return Math.max(0, Math.min(duration, next));
}

function normalizeWheelDelta(delta: number, deltaMode: number): number {
  if (deltaMode === DOM_DELTA_LINE) return delta * WHEEL_LINE_HEIGHT;
  if (deltaMode === DOM_DELTA_PAGE) return delta * WHEEL_PAGE_HEIGHT;
  return delta;
}

// -- Exports -------------------------------------------------------------------

export { decideWheelAction, computeScrubTime, normalizeWheelDelta };
export type { WheelAction };
