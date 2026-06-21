import type { LyricsSearchResult, ProviderName } from "@/domain/lyrics-search/result";
import { IconMusicExclamation, IconSearch } from "@tabler/icons-react";
import { ResultRow } from "@/views/lyrics-import-modal/result-row";
import type { LyricsSearchError } from "@/utils/lyrics-search/types";

// -- Types --------------------------------------------------------------------

interface SearchResultsProps {
  results: LyricsSearchResult[];
  errors: Map<ProviderName, LyricsSearchError>;
  isFetching: boolean;
  hasQuery: boolean;
  focusedIndex: number;
  hoveredIndex: number;
  selectingId: string | null;
  expectedDurationSec: number | undefined;
  listboxRef?: React.Ref<HTMLDivElement>;
  onHover: (index: number) => void;
  onSelect: (result: LyricsSearchResult) => void;
  providerDisplayName: (name: string) => string;
}

// -- Constants ----------------------------------------------------------------

const SKELETON_ROW_COUNT = 3;

// -- Component ----------------------------------------------------------------

const SearchResults: React.FC<SearchResultsProps> = ({
  results,
  errors,
  isFetching,
  hasQuery,
  focusedIndex,
  hoveredIndex,
  selectingId,
  expectedDurationSec,
  listboxRef,
  onHover,
  onSelect,
  providerDisplayName,
}) => {
  if (errors.size > 0 && results.length === 0 && !isFetching) {
    return (
      <div className="flex flex-col items-center gap-1.5 py-8 text-center" role="alert">
        <span className="text-xs text-composer-error-text">
          {[...errors.values()].map((err) => `${providerDisplayName(err.provider)}: ${err.message}`).join(" ・ ")}
        </span>
        <span className="text-[11px] text-composer-text-muted">Try adjusting your search.</span>
      </div>
    );
  }
  if (results.length > 0) {
    return (
      // react-doctor-disable-next-line react-doctor/prefer-tag-over-role
      <div ref={listboxRef} role="listbox" aria-label="Search results" className="flex flex-col gap-1.5">
        {results.map((result, index) => (
          <ResultRow
            key={result.id}
            result={result}
            isHovered={hoveredIndex === index}
            isFocused={focusedIndex === index}
            isSelecting={selectingId === result.id}
            expectedDurationSec={expectedDurationSec}
            onHover={() => onHover(index)}
            onSelect={() => onSelect(result)}
          />
        ))}
      </div>
    );
  }
  if (isFetching) {
    return (
      <div className="flex flex-col gap-1.5" aria-busy="true">
        {Array.from({ length: SKELETON_ROW_COUNT }).map((_, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: fixed-count decorative skeleton
            key={i}
            data-testid="result-skeleton"
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-1.5 rounded-lg animate-pulse"
          >
            <span className="min-w-0 flex flex-col gap-0.5">
              <span className="flex items-center h-5">
                <span className="block h-3 rounded bg-white/4 w-3/4" />
              </span>
              <span className="flex items-center h-4">
                <span className="block h-2.5 rounded bg-white/4 w-1/2" />
              </span>
            </span>
            <span className="flex items-center h-5">
              <span className="block h-3 rounded bg-white/4 w-20" />
            </span>
          </div>
        ))}
      </div>
    );
  }
  if (hasQuery) {
    return (
      <output className="m-auto flex flex-col items-center px-4 text-center">
        <IconMusicExclamation size={22} className="text-composer-text opacity-25 mb-2" aria-hidden="true" />
        <span className="text-xs font-medium text-composer-text-secondary">No matches</span>
        <span className="text-[11px] text-composer-text-muted mt-0.5">
          Try a different track or artist, or check the spelling.
        </span>
      </output>
    );
  }
  return (
    <div className="m-auto flex flex-col items-center px-4 text-center">
      <IconSearch size={22} className="text-composer-text opacity-25 mb-2" aria-hidden="true" />
      <span className="text-xs font-medium text-composer-text-secondary">Type a track or paste a video ID</span>
      <span className="text-[11px] text-composer-text-muted mt-0.5">
        Artist narrows results. Album, duration, video ID are optional but help.
      </span>
    </div>
  );
};

// -- Exports ------------------------------------------------------------------

export { SearchResults };
export type { SearchResultsProps };
