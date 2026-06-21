import type { MarqueeRect } from "@/views/timeline/use-marquee";

// -- Types ---------------------------------------------------------------------

interface MarqueeSelectionProps {
  rect: MarqueeRect;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
}

// -- Component -----------------------------------------------------------------

const MarqueeSelection: React.FC<MarqueeSelectionProps> = ({ rect, scrollContainerRef }) => {
  const container = scrollContainerRef.current;
  if (!container) return null;

  const scrollLeft = container.scrollLeft;
  const scrollTop = container.scrollTop;

  return (
    <div
      className="absolute pointer-events-none z-35 border border-dashed border-composer-accent bg-composer-accent/10 rounded-lg"
      style={{
        left: rect.x - scrollLeft,
        top: rect.y - scrollTop,
        width: rect.width,
        height: rect.height,
      }}
    />
  );
};

// -- Exports -------------------------------------------------------------------

export { MarqueeSelection };
