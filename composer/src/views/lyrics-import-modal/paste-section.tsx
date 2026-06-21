import { IconArrowLeft, IconUpload } from "@tabler/icons-react";
import { Button } from "@/ui/button";
import { cn } from "@/utils/cn";

// -- Types --------------------------------------------------------------------

interface PasteSectionProps {
  value: string;
  onChange: (text: string) => void;
  onSwitchToSearch: () => void;
  onSwitchToUpload: () => void;
}

// -- Helpers ------------------------------------------------------------------

const focusOnMount: React.RefCallback<HTMLTextAreaElement> = (el) => {
  el?.focus();
};

function countNonEmptyLines(text: string): number {
  if (text === "") return 0;
  let count = 0;
  for (const line of text.split("\n")) {
    if (line.trim() !== "") count++;
  }
  return count;
}

// -- Component ----------------------------------------------------------------

const PasteSection: React.FC<PasteSectionProps> = ({ value, onChange, onSwitchToSearch, onSwitchToUpload }) => {
  const lineCount = countNonEmptyLines(value);

  return (
    <div className={cn("flex flex-col gap-2.5 p-3 rounded-lg", "bg-composer-input border border-composer-border")}>
      <div className="flex items-center justify-between gap-2">
        <Button variant="secondary" size="sm" hasIcon onClick={onSwitchToSearch}>
          <IconArrowLeft size={14} stroke={2} />
          Back to search
        </Button>
        <button
          type="button"
          onClick={onSwitchToUpload}
          className="inline-flex items-center gap-1.5 text-[11px] font-medium cursor-pointer bg-transparent border-none px-1 py-0.5 rounded text-composer-text-secondary hover:text-composer-text transition-colors"
        >
          <IconUpload size={12} stroke={2} className="text-composer-text opacity-60" />
          Upload file instead
        </button>
      </div>
      <textarea
        ref={focusOnMount}
        aria-label="Lyrics text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.stopPropagation()}
        placeholder="Paste lyrics here, one line per line. Use | to split syllables"
        spellCheck={false}
        className={cn(
          "h-32 p-3 text-sm rounded-lg resize-none",
          "bg-composer-overlay border border-composer-border",
          "text-composer-text placeholder:text-composer-text-muted",
          "focus:outline-none focus:border-composer-accent",
        )}
      />
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-composer-text-muted">
          Use{" "}
          <code className="font-mono text-[10.5px] px-1 py-px rounded bg-composer-input-hover text-composer-text-secondary">
            |
          </code>{" "}
          to split syllables (e.g. beau|ti|ful)
        </span>
        {lineCount > 0 && (
          <span className="text-xs text-composer-text-muted select-text">
            {lineCount} line{lineCount !== 1 ? "s" : ""}
          </span>
        )}
      </div>
    </div>
  );
};

// -- Exports ------------------------------------------------------------------

export { PasteSection };
export type { PasteSectionProps };
