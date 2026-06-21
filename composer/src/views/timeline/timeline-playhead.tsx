import { useAudioStore } from "@/stores/audio";
import { useProjectStore } from "@/stores/project";
import { getBannerNodes } from "@/views/timeline/banner-progress-registry";
import { GROUP_HEADER_HEIGHT } from "@/views/timeline/group-header-row";
import { buildPlayheadMask } from "@/views/timeline/timeline-playhead-mask";
import { createPlayheadDrag } from "@/views/timeline/playhead-drag";
import { GUTTER_WIDTH, useTimelineStore, WAVEFORM_HEIGHT } from "@/views/timeline/timeline-store";
import { isLinked } from "@/domain/instance/predicates";
import { effectiveBounds } from "@/domain/line/bounds";
import { computeRowLayout } from "@/views/timeline/utils";
import { useEffect, useMemo, useRef } from "react";

// -- Types ---------------------------------------------------------------------

interface TimelinePlayheadProps {
  containerHeight: number;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
}

// -- Constants -----------------------------------------------------------------

const HIT_BUFFER_PX = 18;

// -- Component -----------------------------------------------------------------

const TimelinePlayhead: React.FC<TimelinePlayheadProps> = ({ containerHeight, scrollContainerRef }) => {
  const duration = useAudioStore((s) => s.duration);
  const seekTo = useAudioStore((s) => s.seekTo);
  const setIsPlaying = useAudioStore((s) => s.setIsPlaying);

  const setDraggingPlayhead = useTimelineStore((s) => s.setDraggingPlayhead);
  const setDragTime = useTimelineStore((s) => s.setDragTime);

  const containerRef = useRef<HTMLDivElement>(null);
  const playheadRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const lastFollowedLineRef = useRef<number>(-1);
  const verticalTargetRef = useRef<number | null>(null);
  const lastMaskRef = useRef<string>("");
  const playheadCenterXLocalRef = useRef<number>(0);
  const containerLeftRef = useRef<number>(0);

  // RAF loop - always runs, reads directly from audio element and stores
  useEffect(() => {
    const update = () => {
      if (!playheadRef.current) {
        rafRef.current = requestAnimationFrame(update);
        return;
      }

      // Read directly from audio element for smooth updates
      const audioEl = useAudioStore.getState().audioElement;
      const isPlaying = useAudioStore.getState().isPlaying;
      const currentTime = audioEl?.currentTime ?? useAudioStore.getState().currentTime;
      const { zoom, scrollLeft, isDraggingPlayhead, dragTime, followEnabled } = useTimelineStore.getState();

      // Auto-scroll to keep playhead centered when follow is enabled
      const container = scrollContainerRef.current;
      if (followEnabled && isPlaying && container && !isDraggingPlayhead) {
        const viewportWidth = container.clientWidth;
        const centerOffset = viewportWidth / 2 - GUTTER_WIDTH;
        const targetScrollLeft = Math.max(0, currentTime * zoom - centerOffset);
        container.scrollLeft = targetScrollLeft;

        const lines = useProjectStore.getState().lines;
        let activeLineIndex = -1;
        for (let i = 0; i < lines.length; i++) {
          const timing = effectiveBounds(lines[i]);
          if (timing && currentTime >= timing.begin && currentTime < timing.end) {
            activeLineIndex = i;
            break;
          }
        }

        if (activeLineIndex >= 0 && activeLineIndex !== lastFollowedLineRef.current) {
          lastFollowedLineRef.current = activeLineIndex;
          const BG_DROP_ZONE_HEIGHT = 24;
          const { rowHeights, defaultRowHeight, collapsedInstances } = useTimelineStore.getState();

          const layout = computeRowLayout({
            lines,
            rowHeights,
            defaultRowHeight,
            collapsedInstances,
            waveformHeight: WAVEFORM_HEIGHT,
            bgDropZoneHeight: BG_DROP_ZONE_HEIGHT,
            groupHeaderHeight: GROUP_HEADER_HEIGHT,
          });

          const activeLine = lines[activeLineIndex];
          const activeInstanceKey = isLinked(activeLine) ? `${activeLine.groupId}:${activeLine.instanceIdx}` : null;
          const isActiveCollapsed = activeInstanceKey !== null && collapsedInstances[activeInstanceKey];

          const target =
            isActiveCollapsed && activeInstanceKey !== null
              ? layout.headerTops.get(activeInstanceKey)
              : layout.lineTops.get(activeLine.id);

          if (target) {
            const viewportHeight = container.clientHeight;
            const rowCenter = target.top + target.height / 2;
            verticalTargetRef.current = Math.max(
              0,
              Math.min(container.scrollHeight - viewportHeight, rowCenter - viewportHeight / 2),
            );
          }
        }

        // Lerp vertical scroll only while animating toward target
        if (verticalTargetRef.current !== null) {
          const diff = verticalTargetRef.current - container.scrollTop;
          if (Math.abs(diff) > 0.5) {
            container.scrollTop += diff * 0.15;
          } else {
            container.scrollTop = verticalTargetRef.current;
            verticalTargetRef.current = null;
          }
        }
      } else {
        lastFollowedLineRef.current = -1;
        verticalTargetRef.current = null;
      }

      container?.parentElement?.classList.toggle("scrollbar-hidden", isPlaying && followEnabled);

      const displayTime = isDraggingPlayhead ? dragTime : currentTime;
      const actualScrollLeft = container?.scrollLeft ?? scrollLeft;
      const position = displayTime * zoom - actualScrollLeft + GUTTER_WIDTH - 1; // -1 to center the 2px wide playhead
      playheadRef.current.style.transform = `translate3d(${position}px, 0, 0)`;

      // Update height to match full scrollable content
      if (container) {
        playheadRef.current.style.height = `${container.scrollHeight}px`;
      }

      const containerRect = containerRef.current?.getBoundingClientRect();
      if (containerRect) {
        const playheadCenterXLocal = displayTime * zoom - actualScrollLeft + GUTTER_WIDTH;
        const playheadCenterXViewport = playheadCenterXLocal + containerRect.left;
        playheadCenterXLocalRef.current = playheadCenterXLocal;
        containerLeftRef.current = containerRect.left;
        const mask = buildPlayheadMask(playheadCenterXViewport, containerRect.top);
        if (mask !== lastMaskRef.current) {
          lastMaskRef.current = mask;
          const style = playheadRef.current.style;
          style.maskImage = mask;
          style.webkitMaskImage = mask;
        }
      }

      // Update progress fill on collapsed banner DOM nodes (registered via mount)
      const banners = getBannerNodes();
      for (const banner of banners) {
        const startStr = banner.dataset.instanceStart;
        const endStr = banner.dataset.instanceEnd;
        if (!startStr || !endStr) continue;
        const startNum = Number.parseFloat(startStr);
        const endNum = Number.parseFloat(endStr);
        const span = endNum - startNum;
        if (!Number.isFinite(span) || span <= 0) {
          banner.style.setProperty("--progress-fill", "0%");
          continue;
        }
        const ratio = (currentTime - startNum) / span;
        const clamped = Math.max(0, Math.min(1, ratio));
        banner.style.setProperty("--progress-fill", `${(clamped * 100).toFixed(2)}%`);
      }

      rafRef.current = requestAnimationFrame(update);
    };

    rafRef.current = requestAnimationFrame(update);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [scrollContainerRef]);

  useEffect(() => {
    let yielded = false;

    const onMove = (e: MouseEvent) => {
      const playhead = playheadRef.current;
      if (!playhead) return;

      const playheadCenterXViewport = containerLeftRef.current + playheadCenterXLocalRef.current;
      const nearPlayhead =
        e.clientX >= playheadCenterXViewport - HIT_BUFFER_PX && e.clientX <= playheadCenterXViewport + HIT_BUFFER_PX;

      if (!nearPlayhead) {
        if (yielded) {
          yielded = false;
          playhead.classList.remove("playhead-yield");
        }
        return;
      }

      const stack = document.elementsFromPoint(e.clientX, e.clientY);
      const overWord = stack.some(
        (el) =>
          el instanceof HTMLElement && el !== playhead && !playhead.contains(el) && el.closest("[data-word-block]"),
      );

      if (overWord !== yielded) {
        yielded = overWord;
        playhead.classList.toggle("playhead-yield", overWord);
      }
    };

    document.addEventListener("mousemove", onMove);
    return () => document.removeEventListener("mousemove", onMove);
  }, []);

  const drag = useMemo(
    () =>
      createPlayheadDrag({
        getContainerRect: () => containerRef.current?.getBoundingClientRect(),
        getScrollContainer: () => scrollContainerRef.current,
        getDuration: () => duration,
        getZoom: () => useTimelineStore.getState().zoom,
        getStoreScrollLeft: () => useTimelineStore.getState().scrollLeft,
        getCurrentTime: () => {
          const audioEl = useAudioStore.getState().audioElement;
          return audioEl?.currentTime ?? useAudioStore.getState().currentTime;
        },
        setIsPlaying,
        setDraggingPlayhead,
        setDragTime,
        seekTo,
      }),
    [duration, seekTo, setIsPlaying, setDraggingPlayhead, setDragTime, scrollContainerRef],
  );

  useEffect(() => drag.dispose, [drag]);

  if (duration === 0) return null;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none overflow-hidden z-50"
      style={{ clipPath: `inset(0 0 0 ${GUTTER_WIDTH}px)` }}
    >
      <div
        ref={playheadRef}
        role="separator"
        aria-label="Playhead"
        aria-orientation="vertical"
        className="timeline-playhead-bar absolute top-0 left-0 w-0.5 bg-composer-accent cursor-ew-resize pointer-events-auto expanded-hit-x-sm"
        style={{ height: containerHeight }}
        onMouseDown={drag.onMouseDown}
      >
        <div className="absolute top-0 -left-1.5 w-3.5 h-3 bg-composer-accent rounded-t expanded-hit-lg" />
      </div>
    </div>
  );
};

// -- Exports -------------------------------------------------------------------

export { TimelinePlayhead };
