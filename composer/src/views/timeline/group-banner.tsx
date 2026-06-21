import { useProjectStore } from "@/stores/project";
import type { LinkGroup } from "@/domain/group/template";
import { Button } from "@/ui/button";
import { buildGroupPingVariants } from "@/utils/animationVariants";
import { cn } from "@/utils/cn";
import { registerBanner } from "@/views/timeline/banner-progress-registry";
import { useTimelineStore } from "@/views/timeline/timeline-store";
import { getWordsInInstance } from "@/views/timeline/utils";
import { IconChevronDown, IconLink } from "@tabler/icons-react";
import { m } from "motion/react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

// -- Types ---------------------------------------------------------------------

interface GroupBannerProps {
  group: LinkGroup;
  instanceIdx: number;
  totalInstances: number;
  instanceStart: number;
  instanceEnd: number;
  isCollapsed: boolean;
  zoom: number;
}

// -- Constants -----------------------------------------------------------------

const BANNER_MIN_WIDTH = 80;
const DRAG_THRESHOLD_PX = 3;

// -- Component -----------------------------------------------------------------

const GroupBannerComponent: React.FC<GroupBannerProps> = ({
  group,
  instanceIdx,
  totalInstances,
  instanceStart,
  instanceEnd,
  isCollapsed,
  zoom,
}) => {
  const pingingGroupId = useTimelineStore((s) => s.pingingGroupId);
  const isPinging = pingingGroupId === group.id;
  const pingVariants = useMemo(() => buildGroupPingVariants(group.color), [group.color]);
  const setDraggedGroupShift = useTimelineStore((s) => s.setDraggedGroupShift);
  const setSelectedWords = useTimelineStore((s) => s.setSelectedWords);

  const [dragOffsetPx, setDragOffsetPx] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragStateRef = useRef<{ startX: number; moved: boolean; cleanup: () => void } | null>(null);
  const bannerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const node = bannerRef.current;
    if (!node) return;
    return registerBanner(node);
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      const startX = e.clientX;

      const handleMove = (moveEvent: PointerEvent) => {
        const dx = moveEvent.clientX - startX;
        if (!dragStateRef.current) return;
        if (!dragStateRef.current.moved && Math.abs(dx) >= DRAG_THRESHOLD_PX) {
          dragStateRef.current.moved = true;
          setIsDragging(true);
        }
        if (dragStateRef.current.moved) {
          setDragOffsetPx(dx);
          setDraggedGroupShift({ groupId: group.id, instanceIdx, offsetPx: dx });
        }
      };

      const handleUp = (upEvent: PointerEvent) => {
        const wasDrag = dragStateRef.current?.moved ?? false;
        const dx = upEvent.clientX - startX;
        const cleanup = dragStateRef.current?.cleanup;
        dragStateRef.current = null;
        cleanup?.();
        setIsDragging(false);
        setDragOffsetPx(0);
        setDraggedGroupShift(null);

        if (wasDrag && useProjectStore.getState().groups.find((g) => g.id === group.id)) {
          const deltaSeconds = dx / zoom;
          if (Math.abs(deltaSeconds) > 0.001) {
            useProjectStore.getState().shiftInstance(group.id, instanceIdx, deltaSeconds);
          }
        } else {
          // treat as click: select all words in this instance (so nudge works on it)
          const lines = useProjectStore.getState().lines;
          setSelectedWords(getWordsInInstance(lines, group.id, instanceIdx));
        }
      };

      const cleanup = () => {
        document.removeEventListener("pointermove", handleMove);
        document.removeEventListener("pointerup", handleUp);
      };

      dragStateRef.current = { startX, moved: false, cleanup };
      document.addEventListener("pointermove", handleMove);
      document.addEventListener("pointerup", handleUp);
    },
    [group.id, instanceIdx, setSelectedWords, setDraggedGroupShift, zoom],
  );

  const setPingingGroupId = useTimelineStore((s) => s.setPingingGroupId);
  const handleBadgeMouseEnter = useCallback(() => setPingingGroupId(group.id), [group.id, setPingingGroupId]);
  const handleBadgeMouseLeave = useCallback(() => setPingingGroupId(null), [setPingingGroupId]);

  const setContextMenu = useTimelineStore((s) => s.setContextMenu);
  const toggleInstanceCollapsed = useTimelineStore((s) => s.toggleInstanceCollapsed);
  const handleChevronPointerDown = useCallback((e: React.PointerEvent) => {
    e.stopPropagation();
  }, []);
  const handleChevronClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      toggleInstanceCollapsed(`${group.id}:${instanceIdx}`);
    },
    [group.id, instanceIdx, toggleInstanceCollapsed],
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        target: { kind: "group-banner", groupId: group.id, instanceIdx, source: "banner" },
      });
    },
    [group.id, instanceIdx, setContextMenu],
  );

  const left = instanceStart * zoom;
  const width = Math.max(BANNER_MIN_WIDTH, (instanceEnd - instanceStart) * zoom);
  const deltaSecondsLive = dragOffsetPx / Math.max(zoom, 1);

  // Reactive subscription to lines so word edits inside a collapsed banner
  // update the tick positions automatically. Filter in useMemo to avoid
  // returning a new array reference from the store selector (which would
  // cause infinite re-renders).
  const allLines = useProjectStore((s) => s.lines);
  const wordTicks = useMemo(() => {
    if (!isCollapsed) return [];
    const span = instanceEnd - instanceStart;
    if (span <= 0) return [];
    const ticks: Array<{ idx: number; leftPct: number; widthPct: number }> = [];
    for (const line of allLines) {
      if (line.groupId !== group.id || line.instanceIdx !== instanceIdx) continue;
      if (!line.words?.length) continue;
      for (const w of line.words) {
        const startPct = ((w.begin - instanceStart) / span) * 100;
        const endPct = ((w.end - instanceStart) / span) * 100;
        const widthPct = Math.max(0.4, endPct - startPct);
        ticks.push({ idx: ticks.length, leftPct: startPct, widthPct });
      }
    }
    return ticks;
  }, [isCollapsed, instanceStart, instanceEnd, allLines, group.id, instanceIdx]);

  return (
    <m.div
      ref={bannerRef}
      data-banner-progress=""
      data-instance-key={`${group.id}:${instanceIdx}`}
      data-instance-start={instanceStart}
      data-instance-end={instanceEnd}
      variants={pingVariants}
      animate={isPinging ? "ping" : "idle"}
      className={cn(
        "absolute top-1 bottom-1 flex items-center gap-1 rounded-md select-none pl-1.5 pr-2.5",
        "border text-[10px] font-medium text-composer-text z-[30]",
        isDragging ? "cursor-grabbing" : "cursor-grab",
      )}
      onPointerDown={handlePointerDown}
      onMouseDown={(e) => e.stopPropagation()}
      onContextMenu={handleContextMenu}
      style={{
        left,
        width,
        background: `color-mix(in srgb, ${group.color} 18%, transparent)`,
        borderColor: `color-mix(in srgb, ${group.color} 60%, transparent)`,
        transform: isDragging ? `translateX(${dragOffsetPx}px)` : undefined,
      }}
    >
      <Button
        variant="ghost"
        size="icon"
        aria-label={isCollapsed ? "Expand instance" : "Collapse instance"}
        onClick={handleChevronClick}
        onPointerDown={handleChevronPointerDown}
        onDoubleClick={(e) => e.stopPropagation()}
        className="shrink-0 w-auto h-auto p-0.5 opacity-70 hover:opacity-100 hover:bg-transparent text-current relative before:content-[''] before:absolute before:-inset-2"
      >
        <IconChevronDown
          className={cn("size-3 transition-transform duration-200 ease-out", isCollapsed && "-rotate-90")}
        />
      </Button>
      <span className="font-semibold whitespace-nowrap">{group.label}</span>
      <span
        className="flex items-center gap-1 text-composer-text-muted tabular-nums whitespace-nowrap ml-auto"
        onMouseEnter={handleBadgeMouseEnter}
        onMouseLeave={handleBadgeMouseLeave}
      >
        <IconLink className="size-2.5" />
        {instanceIdx + 1} of {totalInstances}
        {isDragging && (
          <span className="ml-1 text-composer-text">
            {deltaSecondsLive >= 0 ? "+" : ""}
            {deltaSecondsLive.toFixed(1)}s
          </span>
        )}
      </span>
      {isCollapsed && (
        <>
          <span
            aria-hidden
            className="absolute inset-0 rounded-md pointer-events-none overflow-hidden"
            style={{
              background: `linear-gradient(to right, color-mix(in srgb, ${group.color} 35%, transparent) var(--progress-fill, 0%), transparent var(--progress-fill, 0%))`,
            }}
          />
          <span
            aria-hidden
            className="absolute left-1.5 right-1.5 bottom-0.5 h-[3px] pointer-events-none overflow-hidden"
          >
            {wordTicks.map((t) => (
              <span
                key={`${t.idx}-${t.leftPct}-${t.widthPct}`}
                className="absolute top-0 bottom-0 rounded-[1px]"
                style={{
                  left: `${t.leftPct}%`,
                  width: `${t.widthPct}%`,
                  background: group.color,
                  opacity: 0.6,
                }}
              />
            ))}
          </span>
        </>
      )}
    </m.div>
  );
};

const GroupBanner = memo(GroupBannerComponent);

// -- Exports -------------------------------------------------------------------

export { GroupBanner };
