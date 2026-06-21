import { useCallback, useMemo, useRef, useState } from "react";
import type { LyricsSearchResult } from "@/domain/lyrics-search/result";
import { useLyricsSearch } from "@/hooks/useLyricsSearch";
import { useImportModalStore } from "@/stores/import-modal-store";
import type { LyricsSearchQuery } from "@/utils/lyrics-search/types";
import { formatDuration, parseDurationInput } from "@/views/lyrics-import-modal/duration-input-utils";
import { SearchField } from "@/views/lyrics-import-modal/search-field";
import { SearchResults } from "@/views/lyrics-import-modal/search-results";
import {
  IconAlbum,
  IconBrandYoutube,
  IconClock,
  IconFileText,
  IconMicrophone,
  IconUpload,
  IconUser,
} from "@tabler/icons-react";

// -- Types --------------------------------------------------------------------

interface SearchSectionProps {
  initialPrefill: LyricsSearchQuery | null;
  expectedDurationSec?: number;
  onSelect: (result: LyricsSearchResult) => void;
  onSwitchToPaste: () => void;
  onSwitchToUpload: () => void;
}

interface InputState {
  track: string;
  artist: string;
  album: string;
  duration: string;
  videoId: string;
}

// -- Constants ----------------------------------------------------------------

const PROVIDER_DISPLAY_NAMES: Record<string, string> = {
  lrclib: "LRCLib",
  binimum: "Binimum",
  "boidu-lyrics": "Better Lyrics",
};

// -- Helpers ------------------------------------------------------------------

function buildInitialInputState(prefill: LyricsSearchQuery | null): InputState {
  return {
    track: prefill?.track ?? "",
    artist: prefill?.artist ?? "",
    album: prefill?.album ?? "",
    duration: typeof prefill?.durationSec === "number" ? formatDuration(prefill.durationSec) : "",
    videoId: prefill?.videoId ?? "",
  };
}

function buildQuery(inputs: InputState, isrc: string | undefined): LyricsSearchQuery {
  return {
    track: inputs.track.trim() || undefined,
    artist: inputs.artist.trim() || undefined,
    album: inputs.album.trim() || undefined,
    durationSec: parseDurationInput(inputs.duration),
    videoId: inputs.videoId.trim() || undefined,
    isrc,
  };
}

function formatProviderName(name: string): string {
  return PROVIDER_DISPLAY_NAMES[name] ?? name;
}

// -- Component ----------------------------------------------------------------

const SearchSection: React.FC<SearchSectionProps> = ({
  initialPrefill,
  expectedDurationSec,
  onSelect,
  onSwitchToPaste,
  onSwitchToUpload,
}) => {
  const [inputs, setInputs] = useState<InputState>(() => buildInitialInputState(initialPrefill));
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [hoveredIndex, setHoveredIndex] = useState(-1);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const trackInputRef = useRef<HTMLInputElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const isrcRef = useRef(initialPrefill?.isrc);

  const query = useMemo(() => buildQuery(inputs, isrcRef.current), [inputs]);
  const effectiveExpectedDuration = expectedDurationSec ?? parseDurationInput(inputs.duration);
  const { results, isFetching, errors } = useLyricsSearch(query, {
    expectedDurationSec: effectiveExpectedDuration,
  });

  const handleDurationBlur = useCallback(() => {
    const parsed = parseDurationInput(inputs.duration);
    if (parsed === undefined) return;
    const formatted = formatDuration(parsed);
    if (formatted !== inputs.duration) {
      setInputs((prev) => ({ ...prev, duration: formatted }));
    }
  }, [inputs.duration]);

  const handleInputChange = useCallback(<K extends keyof InputState>(key: K) => {
    return (value: string) => {
      setInputs((prev) => ({ ...prev, [key]: value }));
      setFocusedIndex(-1);
    };
  }, []);

  const handleClearAll = useCallback(() => {
    setInputs({ track: "", artist: "", album: "", duration: "", videoId: "" });
    isrcRef.current = undefined;
    setFocusedIndex(-1);
    useImportModalStore.getState().clearDefaultPrefill();
    trackInputRef.current?.focus();
  }, []);

  const hasAnyInput = Boolean(inputs.track || inputs.artist || inputs.album || inputs.duration || inputs.videoId);

  const handleSelectResult = useCallback(
    (result: LyricsSearchResult) => {
      setSelectingId(result.id);
      onSelect(result);
    },
    [onSelect],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (results.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = Math.min(focusedIndex + 1, results.length - 1);
        setFocusedIndex(next);
        (listboxRef.current?.children[next] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        const next = Math.max(focusedIndex - 1, 0);
        setFocusedIndex(next);
        (listboxRef.current?.children[next] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
        return;
      }
      if (e.key === "Enter") {
        if (focusedIndex < 0) return;
        e.preventDefault();
        const target = results[focusedIndex];
        if (!target) return;
        handleSelectResult(target);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setFocusedIndex(-1);
        trackInputRef.current?.focus();
      }
    },
    [results, focusedIndex, handleSelectResult],
  );

  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => e.preventDefault()} role="search">
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-[1.4fr_1fr] gap-2">
          <SearchField
            label="Track"
            icon={<IconMicrophone size={14} stroke={1.75} />}
            value={inputs.track}
            placeholder="Bohemian Rhapsody"
            onChange={handleInputChange("track")}
            onKeyDown={handleKeyDown}
            inputRef={trackInputRef}
          />
          <SearchField
            label="Artist"
            icon={<IconUser size={14} stroke={1.75} />}
            value={inputs.artist}
            placeholder="Queen"
            onChange={handleInputChange("artist")}
            onKeyDown={handleKeyDown}
          />
          <SearchField
            label="Album"
            optional
            icon={<IconAlbum size={14} stroke={1.75} />}
            value={inputs.album}
            placeholder="A Night at the Opera"
            onChange={handleInputChange("album")}
            onKeyDown={handleKeyDown}
          />
          <SearchField
            label="Duration"
            optional
            mono
            icon={<IconClock size={14} stroke={1.75} />}
            value={inputs.duration}
            placeholder="3:45"
            onChange={handleInputChange("duration")}
            onBlur={handleDurationBlur}
            onKeyDown={handleKeyDown}
          />
          <SearchField
            label="Video ID"
            optional
            mono
            fullWidth
            icon={<IconBrandYoutube size={14} stroke={1.75} />}
            value={inputs.videoId}
            placeholder="dQw4w9WgXcQ"
            onChange={handleInputChange("videoId")}
            onKeyDown={handleKeyDown}
          />
        </div>
      </div>

      {hasAnyInput && (
        <div className="flex items-center justify-between px-1">
          <span className="text-[11px] text-composer-text-muted">
            {isFetching && results.length === 0
              ? "Searching"
              : errors.size > 0 && results.length === 0
                ? "Search failed"
                : results.length === 0
                  ? "No results"
                  : `${results.length} result${results.length === 1 ? "" : "s"}`}
          </span>
          <button
            type="button"
            onClick={handleClearAll}
            className="text-[11px] text-composer-text-muted hover:text-composer-text cursor-pointer transition-colors"
          >
            Reset fields
          </button>
        </div>
      )}

      <div className="flex flex-col gap-1.5 p-1.5 bg-composer-input border border-composer-border rounded-xl min-h-[192px] max-h-[256px] overflow-y-auto">
        <SearchResults
          results={results}
          errors={errors}
          isFetching={isFetching}
          hasQuery={Boolean(query.track || query.videoId || query.isrc)}
          focusedIndex={focusedIndex}
          hoveredIndex={hoveredIndex}
          selectingId={selectingId}
          expectedDurationSec={effectiveExpectedDuration}
          listboxRef={listboxRef}
          onHover={setHoveredIndex}
          onSelect={handleSelectResult}
          providerDisplayName={formatProviderName}
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={onSwitchToPaste}
          className="inline-flex items-center justify-center gap-2 px-3 py-2.5 bg-composer-input rounded-xl text-composer-text-secondary text-xs font-medium cursor-pointer hover:bg-composer-button-hover hover:text-composer-text transition-colors"
        >
          <IconFileText size={14} stroke={1.75} className="text-composer-text opacity-50" />
          Paste lyrics instead
        </button>
        <button
          type="button"
          onClick={onSwitchToUpload}
          className="inline-flex items-center justify-center gap-2 px-3 py-2.5 bg-composer-input rounded-xl text-composer-text-secondary text-xs font-medium cursor-pointer hover:bg-composer-button-hover hover:text-composer-text transition-colors"
        >
          <IconUpload size={14} stroke={1.75} className="text-composer-text opacity-50" />
          Upload file
        </button>
      </div>
    </form>
  );
};

// -- Exports ------------------------------------------------------------------

export { SearchSection };
export type { SearchSectionProps };
