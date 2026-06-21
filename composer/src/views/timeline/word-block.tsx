import { cn } from "@/utils/cn";
import type { SyllablePosition } from "@/domain/word/syllable-groups";
import { selfKey } from "@/views/timeline/snap";
import { useTimelineStore } from "@/views/timeline/timeline-store";
import { useDraggable } from "@dnd-kit/core";

// -- Types ---------------------------------------------------------------------

interface WordBlockProps {
  id: string;
  lineId: string;
  lineIndex: number;
  wordIndex: number;
  trackType: "word" | "bg";
  text: string;
  begin: number;
  end: number;
  color: string;
  zoom: number;
  isDimmed: boolean;
  isSelected: boolean;
  isExplicit?: boolean;
  syllablePosition?: SyllablePosition;
  gapBefore?: boolean;
  leftHighlighted?: boolean;
  rightHighlighted?: boolean;
  leftConjoined?: boolean;
  rightConjoined?: boolean;
  onClick: (e: React.MouseEvent) => void;
  onResizeStart: (edge: "left" | "right", startX: number) => void;
  onEdgeHover?: (edge: "left" | "right", hovering: boolean) => void;
  onDoubleClick?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

// -- Component -----------------------------------------------------------------

const SYLLABLE_RADIUS: Record<SyllablePosition, string> = {
  none: "rounded-xl",
  first: "rounded-l-xl rounded-r-none",
  middle: "rounded-none",
  last: "rounded-r-xl rounded-l-none",
};

const WordBlock: React.FC<WordBlockProps> = ({
  id,
  lineId,
  lineIndex,
  wordIndex,
  trackType,
  text,
  begin,
  end,
  color,
  zoom,
  isDimmed,
  isSelected,
  isExplicit,
  syllablePosition = "none",
  gapBefore,
  leftHighlighted,
  rightHighlighted,
  leftConjoined,
  rightConjoined,
  onClick,
  onResizeStart,
  onEdgeHover,
  onDoubleClick,
  onContextMenu,
}) => {
  const left = begin * zoom;
  const naturalWidth = (end - begin) * zoom;
  const width = Math.max(naturalWidth, 4);
  const showText = naturalWidth >= 20;

  const myKey = selfKey(lineId, wordIndex, trackType);
  const isSnapped = useTimelineStore((s) => s.snappedBlockId === myKey);

  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id,
    data: {
      lineId,
      lineIndex,
      wordIndex,
      trackType,
      text,
      begin,
      end,
      snap: { edgesAtStart: [begin, end] },
    },
  });

  const handleResizeStart = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    const edge = e.currentTarget.dataset.edge as "left" | "right";
    onResizeStart(edge, e.clientX);
  };

  const syllableBorder: React.CSSProperties = {};
  if (!isSelected && (syllablePosition === "first" || syllablePosition === "middle")) {
    syllableBorder.borderRightStyle = "dashed";
  }
  if (!isSelected && (syllablePosition === "middle" || syllablePosition === "last")) {
    if (gapBefore) {
      syllableBorder.borderLeftStyle = "dashed";
    } else {
      syllableBorder.borderLeftWidth = 0;
    }
  }

  return (
    <div
      ref={setNodeRef}
      id={id}
      data-word-block
      data-syllable-position={syllablePosition}
      className={cn(
        "absolute top-1 bottom-1 flex items-center justify-center",
        "text-xs text-white truncate select-none cursor-grab",
        "border transition-opacity duration-100",
        SYLLABLE_RADIUS[syllablePosition],
        isDimmed && "opacity-30",
        isDragging && "opacity-50 cursor-grabbing z-50",
        isExplicit && "is-explicit-word",
        isSnapped && !isDragging && "is-snapped",
      )}
      style={{
        left,
        width,
        backgroundColor: isSelected ? `${color}60` : `${color}40`,
        borderColor: isSelected ? `${color}B0` : `${color}70`,
        ...syllableBorder,
      }}
      onClick={(e) => {
        e.stopPropagation();
        onClick(e);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick?.(e);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu?.(e);
      }}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={-1}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick(e as unknown as React.MouseEvent);
      }}
    >
      <div
        data-edge="left"
        role="separator"
        aria-orientation="vertical"
        aria-hidden="true"
        className={cn(
          "absolute left-0 top-0 bottom-0 w-2 z-10 hover:bg-white/10",
          syllablePosition === "middle" || syllablePosition === "last" || leftConjoined
            ? "cursor-col-resize"
            : "cursor-ew-resize",
          leftHighlighted && "bg-white/10",
        )}
        onMouseDown={handleResizeStart}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseEnter={() => onEdgeHover?.("left", true)}
        onMouseLeave={() => onEdgeHover?.("left", false)}
      />

      {showText && <span className="px-1 pointer-events-none truncate">{text}</span>}

      <div
        data-edge="right"
        role="separator"
        aria-orientation="vertical"
        aria-hidden="true"
        className={cn(
          "absolute right-0 top-0 bottom-0 w-2 z-10 hover:bg-white/10",
          syllablePosition === "first" || syllablePosition === "middle" || rightConjoined
            ? "cursor-col-resize"
            : "cursor-ew-resize",
          rightHighlighted && "bg-white/10",
        )}
        onMouseDown={handleResizeStart}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseEnter={() => onEdgeHover?.("right", true)}
        onMouseLeave={() => onEdgeHover?.("right", false)}
      />
    </div>
  );
};

// -- Exports -------------------------------------------------------------------

export { WordBlock };
