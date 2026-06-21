import { cn } from "@/utils/cn";
import { useCallback, useRef } from "react";

// -- Types --------------------------------------------------------------------

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  "aria-label"?: string;
  className?: string;
}

// -- Component ----------------------------------------------------------------

const Slider: React.FC<SliderProps> = ({
  value,
  min,
  max,
  step = 1,
  onChange,
  "aria-label": ariaLabel,
  className = "",
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const percent = max > min ? ((value - min) / (max - min)) * 100 : 0;

  const calculateValue = useCallback(
    (clientX: number) => {
      const track = trackRef.current;
      if (!track) return value;

      const rect = track.getBoundingClientRect();
      const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
      const rawValue = min + (x / rect.width) * (max - min);

      if (step) {
        const stepped = Math.round(rawValue / step) * step;
        return Math.max(min, Math.min(max, stepped));
      }
      return Math.max(min, Math.min(max, rawValue));
    },
    [min, max, step, value],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      isDraggingRef.current = true;
      onChange(calculateValue(e.clientX));

      const handleMouseMove = (e: MouseEvent) => {
        if (isDraggingRef.current) {
          onChange(calculateValue(e.clientX));
        }
      };

      const handleMouseUp = () => {
        isDraggingRef.current = false;
        document.removeEventListener("mousemove", handleMouseMove);
        document.removeEventListener("mouseup", handleMouseUp);
      };

      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
    },
    [calculateValue, onChange],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      const largeStep = (max - min) * 0.1;
      const smallStep = step || (max - min) * 0.01;

      switch (e.key) {
        case "ArrowLeft":
        case "ArrowDown":
          e.preventDefault();
          onChange(Math.max(min, value - smallStep));
          break;
        case "ArrowRight":
        case "ArrowUp":
          e.preventDefault();
          onChange(Math.min(max, value + smallStep));
          break;
        case "PageDown":
          e.preventDefault();
          onChange(Math.max(min, value - largeStep));
          break;
        case "PageUp":
          e.preventDefault();
          onChange(Math.min(max, value + largeStep));
          break;
        case "Home":
          e.preventDefault();
          onChange(min);
          break;
        case "End":
          e.preventDefault();
          onChange(max);
          break;
      }
    },
    [min, max, step, value, onChange],
  );

  return (
    <div
      ref={trackRef}
      role="slider"
      tabIndex={0}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={ariaLabel}
      className={cn("group relative h-1 cursor-pointer rounded-full bg-composer-button", className)}
      onMouseDown={handleMouseDown}
      onKeyDown={handleKeyDown}
    >
      <div className="absolute inset-y-0 left-0 rounded-full bg-composer-accent" style={{ width: `${percent}%` }} />
      <div
        className="absolute top-1/2 size-3 -translate-y-1/2 rounded-full bg-composer-text opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ left: `calc(${percent}% - 6px)` }}
      />
    </div>
  );
};

export { Slider };
