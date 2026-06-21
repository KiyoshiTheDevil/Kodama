import { useAudioStore } from "@/stores/audio";
import { useProjectStore } from "@/stores/project";
import { getAgentColor } from "@/domain/agent/colors";
import { backgroundFields, CLEARED_BACKGROUND, manualBackgroundWordEdit } from "@/domain/line/background";
import { Button } from "@/ui/button";
import { createBgWordsFromLine } from "@/utils/sync-helpers";
import { useTimelineStore } from "@/views/timeline/timeline-store";
import { isLineSynced } from "@/domain/line/predicates";
import { getEffectiveLines } from "@/domain/line/effective-words";
import { formatTime } from "@/views/timeline/utils";
import { IconBracketsContainEnd, IconBracketsContainStart, IconLink } from "@tabler/icons-react";
import { useCallback, useMemo, useState } from "react";

// -- Components ----------------------------------------------------------------

const BackgroundTextEditor: React.FC<{ lineId: string; backgroundText?: string }> = ({ lineId, backgroundText }) => {
  const [value, setValue] = useState(() => backgroundText ?? "");
  const [isEditing, setIsEditing] = useState(false);
  const focusOnMount = useCallback((el: HTMLInputElement | null) => {
    el?.focus();
  }, []);
  const updateLineWithHistory = useProjectStore((s) => s.updateLineWithHistory);

  const handleCommit = useCallback(() => {
    const trimmed = value.trim() || undefined;
    if (trimmed) {
      const line = useProjectStore.getState().lines.find((l) => l.id === lineId);
      const bgWords = line ? createBgWordsFromLine({ ...line, backgroundText: trimmed }) : null;
      updateLineWithHistory(lineId, backgroundFields({ text: trimmed, words: bgWords ?? undefined, source: "manual" }));
    } else {
      updateLineWithHistory(lineId, CLEARED_BACKGROUND);
    }
    setIsEditing(false);
  }, [lineId, value, updateLineWithHistory]);

  if (!isEditing) {
    return (
      <button
        type="button"
        onClick={() => {
          setValue(backgroundText ?? "");
          setIsEditing(true);
        }}
        className="text-xs cursor-pointer text-composer-text-muted hover:text-composer-text px-1.5 py-0.5 rounded hover:bg-composer-button"
        title="Edit background vocals"
      >
        {backgroundText ? `BG: ${backgroundText}` : "Add BG"}
      </button>
    );
  }

  return (
    <input
      ref={focusOnMount}
      type="text"
      aria-label="Background vocals text"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleCommit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") handleCommit();
        if (e.key === "Escape") setIsEditing(false);
      }}
      placeholder="Background vocals"
      className="w-32 px-1.5 py-0.5 text-xs border rounded bg-composer-input border-composer-border focus:outline-none focus:border-composer-accent"
    />
  );
};

const TimelineInfoPanel: React.FC = () => {
  const rawLines = useProjectStore((s) => s.lines);
  const groups = useProjectStore((s) => s.groups);
  const updateLineWithHistory = useProjectStore((s) => s.updateLineWithHistory);
  const duration = useAudioStore((s) => s.duration);
  const selectedWords = useTimelineStore((s) => s.selectedWords);
  const selectedWord = selectedWords[0] ?? null;

  const lines = useMemo(() => getEffectiveLines(rawLines), [rawLines]);

  const groupContext = useMemo(() => {
    if (selectedWords.length === 0) return null;
    const rawLinesById = new Map(rawLines.map((l) => [l.id, l] as const));
    const instanceKeys = new Set<string>();
    let firstGroupId: string | undefined;
    let firstInstanceIdx: number | undefined;
    for (const sel of selectedWords) {
      const realLine = rawLinesById.get(sel.lineId);
      if (!realLine?.groupId || realLine.instanceIdx === undefined) return null;
      if (firstGroupId === undefined) {
        firstGroupId = realLine.groupId;
        firstInstanceIdx = realLine.instanceIdx;
      } else if (realLine.groupId !== firstGroupId) {
        return null;
      }
      instanceKeys.add(`${realLine.groupId}:${realLine.instanceIdx}`);
    }
    if (firstGroupId === undefined) return null;
    const group = groups.find((g) => g.id === firstGroupId);
    if (!group) return null;
    const sameInstance = instanceKeys.size === 1;
    const totalInstances = new Set(
      rawLines.flatMap((l) => (l.groupId === firstGroupId && l.instanceIdx !== undefined ? [l.instanceIdx] : [])),
    ).size;
    return {
      group,
      sameInstance,
      instanceIdx: sameInstance ? firstInstanceIdx : undefined,
      totalInstances,
      instanceCount: instanceKeys.size,
    };
  }, [selectedWords, rawLines, groups]);

  const groupHighlight = groupContext
    ? {
        accentColor: groupContext.group.color,
        label:
          groupContext.sameInstance && groupContext.instanceIdx !== undefined
            ? `${groupContext.group.label} · ${groupContext.instanceIdx + 1} of ${groupContext.totalInstances}`
            : `${groupContext.group.label} · ${groupContext.instanceCount} instances`,
      }
    : null;

  const selectedItem = useMemo(() => {
    if (!selectedWord) return null;
    const line = lines[selectedWord.lineIndex];
    if (!line) return null;

    const wordsArray = selectedWord.type === "word" ? line.words : line.backgroundWords;
    if (!wordsArray) return null;

    const word = wordsArray[selectedWord.wordIndex];
    if (!word) return null;

    return { text: word.text, begin: word.begin, end: word.end };
  }, [selectedWord, lines]);

  const multiSelectionInfo = useMemo(() => {
    if (selectedWords.length <= 1) return null;
    const rawLinesById = new Map(rawLines.map((l) => [l.id, l] as const));
    let minBegin = Number.POSITIVE_INFINITY;
    let maxEnd = 0;
    let lineCount = 0;
    const seenLineIds = new Set<string>();
    for (const sel of selectedWords) {
      const line = lines[sel.lineIndex];
      if (!line) continue;
      const wordsArray = sel.type === "word" ? line.words : line.backgroundWords;
      const word = wordsArray?.[sel.wordIndex];
      if (!word) continue;
      minBegin = Math.min(minBegin, word.begin);
      maxEnd = Math.max(maxEnd, word.end);

      if (sel.type === "word" && !seenLineIds.has(line.id)) {
        seenLineIds.add(line.id);
        const realLine = rawLinesById.get(line.id);
        if (realLine && isLineSynced(realLine)) lineCount++;
      }
    }
    if (minBegin === Number.POSITIVE_INFINITY) return null;
    const wordCount = selectedWords.length - lineCount;
    return { count: selectedWords.length, wordCount, lineCount, begin: minBegin, end: maxEnd };
  }, [selectedWords, lines, rawLines]);

  const handleSetBeginToCursor = useCallback(() => {
    if (!selectedWord) return;
    const line = lines[selectedWord.lineIndex];
    if (!line) return;

    const wordsArray = selectedWord.type === "word" ? line.words : line.backgroundWords;
    if (!wordsArray) return;

    const audioEl = useAudioStore.getState().audioElement;
    const currentTime = audioEl?.currentTime ?? useAudioStore.getState().currentTime;

    const wordIndex = selectedWord.wordIndex;
    const word = wordsArray[wordIndex];
    if (!word) return;

    const prevEnd = wordIndex > 0 ? wordsArray[wordIndex - 1].end : 0;
    const maxBegin = word.end - 0.05;
    const clampedBegin = Math.max(prevEnd, Math.min(maxBegin, Math.max(0, currentTime)));

    const updatedWords = [...wordsArray];
    updatedWords[wordIndex] = { ...word, begin: clampedBegin };

    if (selectedWord.type === "word") {
      updateLineWithHistory(line.id, { words: updatedWords }, { propagateToSiblings: false });
    } else {
      updateLineWithHistory(line.id, manualBackgroundWordEdit(updatedWords), { propagateToSiblings: false });
    }
  }, [selectedWord, lines, updateLineWithHistory]);

  const handleSetEndToCursor = useCallback(() => {
    if (!selectedWord) return;
    const line = lines[selectedWord.lineIndex];
    if (!line) return;

    const wordsArray = selectedWord.type === "word" ? line.words : line.backgroundWords;
    if (!wordsArray) return;

    const audioEl = useAudioStore.getState().audioElement;
    const currentTime = audioEl?.currentTime ?? useAudioStore.getState().currentTime;

    const wordIndex = selectedWord.wordIndex;
    const word = wordsArray[wordIndex];
    if (!word) return;

    const minEnd = word.begin + 0.05;
    const nextBegin = wordIndex < wordsArray.length - 1 ? wordsArray[wordIndex + 1].begin : duration;
    const clampedEnd = Math.min(nextBegin, Math.max(minEnd, Math.min(duration, currentTime)));

    const updatedWords = [...wordsArray];
    updatedWords[wordIndex] = { ...word, end: clampedEnd };

    if (selectedWord.type === "word") {
      updateLineWithHistory(line.id, { words: updatedWords }, { propagateToSiblings: false });
    } else {
      updateLineWithHistory(line.id, manualBackgroundWordEdit(updatedWords), { propagateToSiblings: false });
    }
  }, [selectedWord, lines, duration, updateLineWithHistory]);

  if (multiSelectionInfo) {
    const spanDuration = multiSelectionInfo.end - multiSelectionInfo.begin;
    return (
      <div className="relative flex items-center gap-6 px-6 h-[54px] border-t border-composer-border bg-composer-bg-elevated">
        {groupHighlight && (
          <span
            className="flex items-center gap-1 px-2 h-5 rounded-md text-[11px] font-medium select-none"
            style={{
              background: `color-mix(in srgb, ${groupHighlight.accentColor} 22%, transparent)`,
              color: groupHighlight.accentColor,
            }}
            title="Selected words belong to this linked group"
          >
            <IconLink className="size-3" />
            <span className="tabular-nums">{groupHighlight.label}</span>
          </span>
        )}
        <span className="text-sm font-medium text-composer-text">
          {multiSelectionInfo.lineCount > 0 && multiSelectionInfo.wordCount > 0
            ? `${multiSelectionInfo.wordCount} words, ${multiSelectionInfo.lineCount} lines selected`
            : multiSelectionInfo.lineCount > 0
              ? `${multiSelectionInfo.lineCount} lines selected`
              : `${multiSelectionInfo.wordCount} words selected`}
        </span>
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-1">
            <span className="text-composer-text-muted">Range:</span>
            <span className="font-mono text-composer-text select-text">
              {formatTime(multiSelectionInfo.begin)} - {formatTime(multiSelectionInfo.end)}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-composer-text-muted">Span:</span>
            <span className="font-mono text-composer-text select-text">{formatTime(spanDuration)}</span>
          </div>
        </div>
      </div>
    );
  }

  if (!selectedWord || !selectedItem) return null;

  const line = lines[selectedWord.lineIndex];
  if (!line) return null;

  const color = getAgentColor(line.agentId);
  const itemDuration = selectedItem.end - selectedItem.begin;

  return (
    <div className="relative flex items-center gap-6 px-6 py-3 border-t border-composer-border bg-composer-bg-elevated">
      {groupHighlight && (
        <span
          className="flex items-center gap-1 px-2 h-5 rounded-md text-[11px] font-medium select-none"
          style={{
            background: `color-mix(in srgb, ${groupHighlight.accentColor} 22%, transparent)`,
            color: groupHighlight.accentColor,
          }}
          title="This word belongs to a linked group"
        >
          <IconLink className="size-3" />
          <span className="tabular-nums">{groupHighlight.label}</span>
        </span>
      )}
      <div className="flex items-center gap-2">
        <div className="size-2.5 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-sm text-composer-text-muted">Line {selectedWord.lineIndex + 1}</span>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-composer-text">
          {selectedWord.type === "bg" ? `(${selectedItem.text})` : selectedItem.text}
        </span>
      </div>

      <div className="flex items-center gap-4 text-sm">
        <div className="flex items-center gap-1">
          <span className="text-composer-text-muted">Begin:</span>
          <span className="font-mono text-composer-text select-text">{formatTime(selectedItem.begin)}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-composer-text-muted">End:</span>
          <span className="font-mono text-composer-text select-text">{formatTime(selectedItem.end)}</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="text-composer-text-muted">Duration:</span>
          <span className="font-mono text-composer-text select-text">{formatTime(itemDuration)}</span>
        </div>
      </div>

      <BackgroundTextEditor lineId={line.id} backgroundText={line.backgroundText} />

      <div className="flex items-center gap-2 ml-auto">
        <Button variant="secondary" size="sm" hasIcon onClick={handleSetBeginToCursor} title="Set begin to cursor ([)">
          <IconBracketsContainStart className="size-3.5" />
          <span>Set Begin</span>
        </Button>
        <Button variant="secondary" size="sm" hasIcon onClick={handleSetEndToCursor} title="Set end to cursor (])">
          <IconBracketsContainEnd className="size-3.5" />
          <span>Set End</span>
        </Button>
      </div>
    </div>
  );
};

// -- Exports -------------------------------------------------------------------

export { TimelineInfoPanel };
