import type { LyricsSearchResult } from "@/domain/lyrics-search/result";
import { cn } from "@/utils/cn";
import { formatDuration } from "@/views/lyrics-import-modal/duration-input-utils";
import { SyncTypeBadge } from "@/views/lyrics-import-modal/sync-type-badge";
import { IconLoader2 } from "@tabler/icons-react";

// -- Constants ----------------------------------------------------------------

const MATCH_TOLERANCE_SEC = 2;

// -- Types --------------------------------------------------------------------

interface ResultRowProps {
  result: LyricsSearchResult;
  isHovered: boolean;
  isFocused: boolean;
  isSelecting: boolean;
  expectedDurationSec?: number;
  onHover: () => void;
  onSelect: () => void;
}

type DurationMatch =
  | { kind: "neutral" }
  | { kind: "exact" }
  | { kind: "close"; delta: number }
  | { kind: "mismatch"; delta: number };

// -- Helpers ------------------------------------------------------------------

function describeDurationMatch(actual: number, expected: number | undefined): DurationMatch {
  if (expected === undefined || !Number.isFinite(expected)) return { kind: "neutral" };
  const delta = Math.round(actual) - Math.round(expected);
  const abs = Math.abs(delta);
  if (abs === 0) return { kind: "exact" };
  if (abs <= MATCH_TOLERANCE_SEC) return { kind: "close", delta };
  return { kind: "mismatch", delta };
}

function formatDelta(delta: number): string {
  const sign = delta > 0 ? "+" : "−";
  return `${sign}${Math.abs(delta)}s`;
}

function joinArtistAlbum(artist: string, album: string | undefined): string {
  if (album && album.trim().length > 0) return `${artist} ・ ${album}`;
  return artist;
}

// -- Sub-components -----------------------------------------------------------

interface DurationDisplayProps {
  match: DurationMatch;
  actualSec: number;
}

const DurationDisplay: React.FC<DurationDisplayProps> = ({ match, actualSec }) => {
  const text = formatDuration(actualSec);
  if (match.kind === "exact") {
    return (
      <span
        title="Matches your duration"
        className="inline-flex items-baseline gap-1 px-1.5 py-0.5 rounded-md bg-composer-accent/22 text-white font-mono text-[11px] font-medium tabular-nums select-text"
      >
        {text}
      </span>
    );
  }
  if (match.kind === "close") {
    return (
      <span
        title={`Off by ${Math.abs(match.delta)}s`}
        className="inline-flex items-baseline gap-1 px-1.5 py-0.5 rounded-md bg-composer-accent/12 text-composer-accent-text font-mono text-[11px] font-medium tabular-nums select-text"
      >
        {text}
        <span className="text-[9.5px] opacity-85">{formatDelta(match.delta)}</span>
      </span>
    );
  }
  if (match.kind === "mismatch") {
    return (
      <span
        title={`Off by ${Math.abs(match.delta)}s`}
        className="font-mono text-[11px] text-composer-text-muted opacity-60 tabular-nums select-text"
      >
        {text}
      </span>
    );
  }
  return <span className="font-mono text-[11px] text-composer-text-secondary tabular-nums select-text">{text}</span>;
};

// -- Component ----------------------------------------------------------------

const ResultRow: React.FC<ResultRowProps> = ({
  result,
  isHovered,
  isFocused,
  isSelecting,
  expectedDurationSec,
  onHover,
  onSelect,
}) => {
  const isActive = isHovered || isFocused;
  const match = describeDurationMatch(result.durationSec, expectedDurationSec);

  const selectIfIdle = () => {
    if (isSelecting) return;
    onSelect();
  };

  return (
    <button
      type="button"
      role="option"
      aria-selected={isActive}
      onClick={selectIfIdle}
      onMouseEnter={onHover}
      onFocus={onHover}
      aria-busy={isSelecting}
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-1.5 rounded-lg w-full text-left cursor-pointer transition-colors",
        isActive && "bg-composer-button/30",
        isSelecting && "opacity-60 cursor-progress",
      )}
    >
      <span className="min-w-0 flex flex-col gap-0.5">
        <span className="truncate text-[13px] font-medium text-composer-text select-text">{result.track}</span>
        <span className="truncate text-[11px] text-composer-text-muted select-text">
          {joinArtistAlbum(result.artist, result.album)}
        </span>
      </span>

      <span className="flex items-center gap-1.5 shrink-0">
        <DurationDisplay match={match} actualSec={result.durationSec} />
        <SyncTypeBadge syncType={result.syncType} sourceLabel={result.sourceLabel} />
        {isSelecting ? (
          <IconLoader2 size={12} className="animate-spin text-composer-accent-text" aria-label="Loading" />
        ) : null}
      </span>
    </button>
  );
};

// -- Exports ------------------------------------------------------------------

export { ResultRow };
export type { ResultRowProps };
