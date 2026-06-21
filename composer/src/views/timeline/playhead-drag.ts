import { scrubPreview } from "@/audio/scrub-preview";
import { computeScrubVelocity, DEFAULT_SCRUB_OPTS, type ScrubSample } from "@/audio/scrub-velocity";
import { computeEdgeScrollVelocity } from "@/views/timeline/edge-scroll";
import { GUTTER_WIDTH } from "@/views/timeline/timeline-store";

// -- Types ---------------------------------------------------------------------

interface PlayheadDragConfig {
  getContainerRect: () => DOMRect | undefined;
  getScrollContainer: () => HTMLElement | null;
  getDuration: () => number;
  getZoom: () => number;
  getStoreScrollLeft: () => number;
  getCurrentTime: () => number;
  setIsPlaying: (playing: boolean) => void;
  setDraggingPlayhead: (dragging: boolean, time?: number) => void;
  setDragTime: (time: number) => void;
  seekTo: (time: number) => void;
}

interface PlayheadDrag {
  onMouseDown: (e: React.MouseEvent) => void;
  dispose: () => void;
}

// -- Constants -----------------------------------------------------------------

const EDGE_SCROLL_ZONE = 60;
const EDGE_SCROLL_MAX_SPEED = 22;

// -- Functions -----------------------------------------------------------------

function createPlayheadDrag(config: PlayheadDragConfig): PlayheadDrag {
  let activeCleanup: (() => void) | null = null;

  const computeTimeFromPointer = (clientX: number): number | null => {
    const parentRect = config.getContainerRect();
    if (!parentRect) return null;
    const scrollLeft = config.getScrollContainer()?.scrollLeft ?? config.getStoreScrollLeft();
    const x = clientX - parentRect.left - GUTTER_WIDTH + scrollLeft;
    return Math.max(0, Math.min(config.getDuration(), x / config.getZoom()));
  };

  const onMouseDown = (e: React.MouseEvent): void => {
    if (e.button !== 0) return;

    e.preventDefault();
    config.setIsPlaying(false);
    activeCleanup?.();

    config.setDraggingPlayhead(true, config.getCurrentTime());

    let pointerX = e.clientX;
    let edgeScrollRaf: number | null = null;
    let prevSample: ScrubSample | null = null;
    const controller = new AbortController();

    const tickScrubPreview = (time: number): void => {
      const curr: ScrubSample = { time, wallClockMs: performance.now() };
      const velocity = computeScrubVelocity(prevSample, curr, DEFAULT_SCRUB_OPTS);
      prevSample = curr;
      if (velocity > 0) scrubPreview.play(time, velocity);
    };

    const tickEdgeScroll = (): void => {
      edgeScrollRaf = requestAnimationFrame(tickEdgeScroll);
      const container = config.getScrollContainer();
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const velocity = computeEdgeScrollVelocity({
        pointerX,
        contentLeft: rect.left + GUTTER_WIDTH,
        contentRight: rect.right,
        edgeSize: EDGE_SCROLL_ZONE,
        maxSpeed: EDGE_SCROLL_MAX_SPEED,
      });
      if (velocity === 0) return;
      const maxScroll = container.scrollWidth - container.clientWidth;
      container.scrollLeft = Math.max(0, Math.min(maxScroll, container.scrollLeft + velocity));
      const time = computeTimeFromPointer(pointerX);
      if (time !== null) {
        config.setDragTime(time);
        tickScrubPreview(time);
      }
    };

    const handleMouseMove = (moveEvent: MouseEvent): void => {
      pointerX = moveEvent.clientX;
      const time = computeTimeFromPointer(pointerX);
      if (time !== null) {
        config.setDragTime(time);
        tickScrubPreview(time);
      }
    };

    const cleanup = (): void => {
      if (edgeScrollRaf !== null) {
        cancelAnimationFrame(edgeScrollRaf);
        edgeScrollRaf = null;
      }
      controller.abort();
      scrubPreview.stop();
      activeCleanup = null;
    };

    const handleMouseUp = (upEvent: MouseEvent): void => {
      const time = computeTimeFromPointer(upEvent.clientX);
      if (time !== null) config.seekTo(time);
      config.setDraggingPlayhead(false);
      cleanup();
    };

    activeCleanup = cleanup;
    document.addEventListener("mousemove", handleMouseMove, { signal: controller.signal });
    document.addEventListener("mouseup", handleMouseUp, { signal: controller.signal });
    tickEdgeScroll();
  };

  const dispose = (): void => {
    activeCleanup?.();
  };

  return { onMouseDown, dispose };
}

// -- Exports -------------------------------------------------------------------

export { createPlayheadDrag };
export type { PlayheadDragConfig, PlayheadDrag };
