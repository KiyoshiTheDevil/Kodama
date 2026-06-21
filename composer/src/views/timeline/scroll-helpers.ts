import { instanceBounds } from "@/domain/instance/bounds";
import { linesOfInstance } from "@/domain/instance/enumerate";
import { useProjectStore } from "@/stores/project";
import { GROUP_HEADER_HEIGHT } from "@/views/timeline/group-header-row";
import { GUTTER_WIDTH, useTimelineStore, WAVEFORM_HEIGHT } from "@/views/timeline/timeline-store";
import { computeRowLayout } from "@/views/timeline/utils";

// -- Constants -----------------------------------------------------------------

const BG_DROP_ZONE_HEIGHT = 24;

// -- Functions -----------------------------------------------------------------

function scrollToInstanceHeader(groupId: string, instanceIdx: number): void {
  const container = document.querySelector<HTMLDivElement>("[data-scroll-container]");
  if (!container) return;
  const { rowHeights, defaultRowHeight, collapsedInstances, zoom } = useTimelineStore.getState();
  const projectLines = useProjectStore.getState().lines;
  const layout = computeRowLayout({
    lines: projectLines,
    rowHeights,
    defaultRowHeight,
    collapsedInstances,
    waveformHeight: WAVEFORM_HEIGHT,
    bgDropZoneHeight: BG_DROP_ZONE_HEIGHT,
    groupHeaderHeight: GROUP_HEADER_HEIGHT,
  });
  const target = layout.headerTops.get(`${groupId}:${instanceIdx}`);
  if (!target) return;

  const instanceLines = linesOfInstance(projectLines, groupId, instanceIdx);
  const bounds = instanceBounds(instanceLines);

  const viewportWidth = container.clientWidth;
  const viewportHeight = container.clientHeight;
  const scrollLeft = bounds
    ? Math.max(0, bounds.begin * zoom - viewportWidth / 2 + GUTTER_WIDTH)
    : container.scrollLeft;

  const rowCenter = target.top + target.height / 2;
  const scrollTop = Math.max(0, Math.min(container.scrollHeight - viewportHeight, rowCenter - viewportHeight / 2));

  container.scrollTo({ left: scrollLeft, top: scrollTop, behavior: "smooth" });
}

// -- Exports -------------------------------------------------------------------

export { scrollToInstanceHeader };
