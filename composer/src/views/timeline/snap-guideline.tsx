import { GUTTER_WIDTH, useTimelineStore } from "@/views/timeline/timeline-store";

// -- Component ----------------------------------------------------------------

const SnapGuideline: React.FC = () => {
  const snappedAnchorTime = useTimelineStore((s) => s.snappedAnchorTime);
  const zoom = useTimelineStore((s) => s.zoom);
  const scrollLeft = useTimelineStore((s) => s.scrollLeft);

  if (snappedAnchorTime === null) return null;

  const position = snappedAnchorTime * zoom - scrollLeft + GUTTER_WIDTH;

  return (
    <div
      className="absolute inset-0 pointer-events-none overflow-hidden z-40"
      style={{ clipPath: `inset(0 0 0 ${GUTTER_WIDTH}px)` }}
    >
      <div
        className="absolute top-0 bottom-0 pointer-events-none"
        style={{
          left: position,
          width: 0,
          borderLeft: "1px dashed rgba(255, 214, 107, 0.7)",
        }}
      />
    </div>
  );
};

// -- Exports ------------------------------------------------------------------

export { SnapGuideline };
