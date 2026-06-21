import type { CobaltInstanceStatus } from "@/stores/settings";
import { Button } from "@/ui/button";
import { cn } from "@/utils/cn";
import { displayHostFromUrl } from "@/utils/url";
import {
  IconExternalLink,
  IconLock,
  IconMoodCheck,
  IconMoodHappy,
  IconMoodSadDizzy,
  IconTrash,
} from "@tabler/icons-react";

// -- Helpers ------------------------------------------------------------------

function formatRelativeTime(timestamp: number): string {
  const diffSec = Math.max(1, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  return `${diffDay}d ago`;
}

// -- Cobalt Instances ---------------------------------------------------------

const CobaltDirectoryLink: React.FC = () => (
  <div className="flex flex-col gap-0.5 mt-4 pt-3 border-t border-composer-border">
    <a
      href="https://cobalt.directory/service"
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 text-xs text-composer-text-secondary hover:text-composer-text transition-colors w-fit"
    >
      <IconExternalLink size={12} />
      Find more on cobalt.directory
    </a>
    <span className="text-[11px] text-composer-text-muted">
      Set the Service filter to <strong>YouTube Music</strong> when browsing.
    </span>
  </div>
);

const CobaltInstanceStatusIcon: React.FC<{ status: CobaltInstanceStatus }> = ({ status }) => {
  const tooltip =
    status.status === "success"
      ? `Last attempt worked (${formatRelativeTime(status.at)})`
      : `Last attempt failed: ${status.errorMessage ?? "unknown error"} (${formatRelativeTime(status.at)})`;
  return (
    <span
      title={tooltip}
      aria-label={tooltip}
      className={cn(
        "inline-flex items-center justify-center shrink-0",
        status.status === "success" ? "text-emerald-400" : "text-amber-400",
      )}
    >
      {status.status === "success" ? <IconMoodCheck size={14} /> : <IconMoodSadDizzy size={14} />}
    </span>
  );
};

const CobaltInstanceRow: React.FC<{
  instance: { id: string; label: string; url: string };
  isSelected: boolean;
  onSelect: () => void;
  onRemove?: () => void;
  onEdit?: () => void;
  status?: CobaltInstanceStatus;
}> = ({ instance, isSelected, onSelect, onRemove, onEdit, status }) => {
  const activate = () => {
    if (isSelected && onEdit) onEdit();
    else onSelect();
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={activate}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          activate();
        }
      }}
      onDoubleClick={
        onEdit
          ? (e) => {
              e.preventDefault();
              e.stopPropagation();
              onEdit();
            }
          : undefined
      }
      className={cn(
        "group flex items-center gap-3 px-3 py-2 rounded-lg border transition-colors cursor-pointer text-left min-w-0",
        isSelected
          ? "bg-composer-accent/15 border-composer-accent/50"
          : "bg-composer-input border-transparent hover:bg-composer-button",
      )}
    >
      <span
        className={cn(
          "size-3.5 rounded-full border-[1.5px] shrink-0 relative transition-colors",
          isSelected ? "border-composer-accent" : "border-composer-text opacity-50",
        )}
      >
        {isSelected && <span className="absolute inset-[2.5px] rounded-full bg-composer-accent" />}
      </span>
      <span className="flex items-center gap-1.5 min-w-0 max-w-[50%]">
        <span className="text-sm font-medium text-composer-text truncate">{instance.label}</span>
        {!onRemove ? (
          <span
            aria-label="Composer's default instance"
            title="Composer's default instance"
            className="inline-flex items-center justify-center shrink-0 text-composer-text-faint"
          >
            <IconMoodHappy size={14} />
          </span>
        ) : status ? (
          <CobaltInstanceStatusIcon status={status} />
        ) : null}
      </span>
      <span className="text-[11px] text-composer-text-muted font-mono truncate ml-auto text-right min-w-0">
        {displayHostFromUrl(instance.url)}
      </span>
      {onRemove ? (
        <Button
          variant="ghost"
          size="icon"
          aria-label="Remove instance"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="size-6 rounded text-composer-text-faint hover:text-composer-error hover:bg-transparent shrink-0"
        >
          <IconTrash size={14} />
        </Button>
      ) : (
        <span aria-hidden className="size-6 shrink-0 flex items-center justify-center text-composer-text-faint">
          <IconLock size={13} />
        </span>
      )}
    </div>
  );
};

// -- Exports ------------------------------------------------------------------

export { CobaltDirectoryLink, CobaltInstanceRow };
