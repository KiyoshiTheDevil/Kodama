import { scrubPreview } from "@/audio/scrub-preview";
import { computeScrubVelocity, DEFAULT_SCRUB_OPTS, type ScrubSample } from "@/audio/scrub-velocity";
import { useAudioStore } from "@/stores/audio";
import { useSettingsStore } from "@/stores/settings";
import { GUTTER_WIDTH, MAX_ZOOM, MIN_ZOOM, useTimelineStore, WAVEFORM_HEIGHT } from "@/views/timeline/timeline-store";
import { computeScrubTime, decideWheelAction, normalizeWheelDelta } from "@/views/timeline/timeline-wheel";
import { type RefObject, useCallback, useEffect, useRef } from "react";

// -- Constants -----------------------------------------------------------------

const WHEEL_IDLE_MS = 120;

// -- Hook ----------------------------------------------------------------------

function useTimelineWheel(scrollContainerRef: RefObject<HTMLDivElement | null>, enabled: boolean) {
  const prevScrubSampleRef = useRef<ScrubSample | null>(null);
  const wheelIdleTimerRef = useRef<number | null>(null);

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      const container = scrollContainerRef.current;
      if (!container) return;
      const duration = useAudioStore.getState().duration;
      if (duration <= 0) return;
      const zoom = useTimelineStore.getState().zoom;

      const rect = container.getBoundingClientRect();
      const overWaveform =
        e.clientY >= rect.top && e.clientY <= rect.top + WAVEFORM_HEIGHT && e.clientX >= rect.left + GUTTER_WIDTH;

      const action = decideWheelAction({
        deltaX: e.deltaX,
        deltaY: e.deltaY,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
        overWaveform,
        horizontalScrollSetting: useSettingsStore.getState().timelineHorizontalScroll,
      });

      if (action.kind === "native") return;
      e.preventDefault();

      if (action.kind === "zoom") {
        const cursorX = e.clientX - rect.left - GUTTER_WIDTH + container.scrollLeft;
        const cursorTime = cursorX / zoom;
        const delta = e.deltaY > 0 ? -20 : 20;
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom + delta));
        if (newZoom === zoom) return;
        const newScrollLeft = Math.max(0, cursorTime * newZoom - (e.clientX - rect.left - GUTTER_WIDTH));
        useTimelineStore.getState().setZoom(newZoom);
        container.scrollLeft = newScrollLeft;
        return;
      }

      if (action.kind === "scrub") {
        const audioEl = useAudioStore.getState().audioElement;
        const currentTime = audioEl?.currentTime ?? useAudioStore.getState().currentTime;
        const newTime = computeScrubTime(currentTime, normalizeWheelDelta(e.deltaY, e.deltaMode), zoom, duration);
        useAudioStore.getState().seekTo(newTime);
        const playheadX = newTime * zoom;
        const viewportInner = container.clientWidth - GUTTER_WIDTH;
        if (playheadX < container.scrollLeft) {
          container.scrollLeft = Math.max(0, playheadX);
        } else if (playheadX > container.scrollLeft + viewportInner) {
          container.scrollLeft = playheadX - viewportInner;
        }

        const curr: ScrubSample = { time: newTime, wallClockMs: performance.now() };
        const velocity = computeScrubVelocity(prevScrubSampleRef.current, curr, DEFAULT_SCRUB_OPTS);
        prevScrubSampleRef.current = curr;
        if (velocity > 0) scrubPreview.play(newTime, velocity);

        if (wheelIdleTimerRef.current !== null) window.clearTimeout(wheelIdleTimerRef.current);
        wheelIdleTimerRef.current = window.setTimeout(() => {
          scrubPreview.stop();
          prevScrubSampleRef.current = null;
          wheelIdleTimerRef.current = null;
        }, WHEEL_IDLE_MS);
        return;
      }

      const dominantDelta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      const scrollAmount = normalizeWheelDelta(dominantDelta, e.deltaMode);
      if (action.axis === "x") {
        container.scrollLeft += scrollAmount;
      } else {
        container.scrollTop += scrollAmount;
      }
    },
    [scrollContainerRef],
  );

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!enabled || !container) return;
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheel);
      if (wheelIdleTimerRef.current !== null) {
        window.clearTimeout(wheelIdleTimerRef.current);
        wheelIdleTimerRef.current = null;
      }
      scrubPreview.stop();
      prevScrubSampleRef.current = null;
    };
  }, [enabled, handleWheel, scrollContainerRef]);
}

// -- Exports -------------------------------------------------------------------

export { useTimelineWheel };
