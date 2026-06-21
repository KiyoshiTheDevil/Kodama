import { getNudgeAmount, formatTimeMs, parseTimeMs } from "@/utils/sync-helpers";
import { useState } from "react";

const focusAndSelectOnMount = (el: HTMLInputElement | null) => {
  if (!el) return;
  el.focus();
  el.select();
};

// -- Interfaces ---------------------------------------------------------------

interface TimeNudgeInputProps {
  value: number;
  currentTime: number;
  canDecrease: boolean;
  canIncrease: boolean;
  onNudge: (delta: number) => void;
  onSetTime: (newTime: number) => void;
}

// -- Components ---------------------------------------------------------------

const TimeNudgeInput: React.FC<TimeNudgeInputProps> = ({
  value,
  currentTime,
  canDecrease,
  canIncrease,
  onNudge,
  onSetTime,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  const handleStartEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
    setEditValue(formatTimeMs(value));
  };

  const handleCommit = () => {
    const parsed = parseTimeMs(editValue);
    if (parsed !== null) {
      onSetTime(parsed);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === "Enter") {
      e.preventDefault();
      handleCommit();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setIsEditing(false);
    } else if (e.key === "Tab") {
      e.preventDefault();
      setEditValue(formatTimeMs(currentTime));
    }
  };

  const handleNudgeClick = (e: React.MouseEvent, delta: number) => {
    e.stopPropagation();
    onNudge(delta);
  };

  return (
    <span className="flex items-center gap-1 font-mono text-[10px] tabular-nums">
      <button
        type="button"
        onClick={(e) => canDecrease && handleNudgeClick(e, -getNudgeAmount())}
        className={`px-1 ${
          canDecrease
            ? "text-composer-text-muted hover:text-composer-text cursor-pointer"
            : "text-composer-text-muted/30 cursor-not-allowed"
        }`}
      >
        -
      </button>
      {isEditing ? (
        <input
          ref={focusAndSelectOnMount}
          type="text"
          aria-label="Edit time"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleCommit}
          onKeyDown={handleKeyDown}
          onClick={(e) => e.stopPropagation()}
          className="w-16 px-1 text-center border rounded select-text bg-composer-bg-elevated border-composer-accent text-composer-accent-text"
        />
      ) : (
        <button
          type="button"
          onClick={handleStartEdit}
          className="text-composer-accent-text hover:underline cursor-text"
        >
          {formatTimeMs(value)}
        </button>
      )}
      <button
        type="button"
        onClick={(e) => canIncrease && handleNudgeClick(e, getNudgeAmount())}
        className={`px-1 ${
          canIncrease
            ? "text-composer-text-muted hover:text-composer-text cursor-pointer"
            : "text-composer-text-muted/30 cursor-not-allowed"
        }`}
      >
        +
      </button>
    </span>
  );
};

// -- Exports ------------------------------------------------------------------

export { TimeNudgeInput };
