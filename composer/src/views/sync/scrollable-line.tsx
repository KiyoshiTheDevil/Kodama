import { getAgentColor } from "@/domain/agent/colors";
import type { WordTiming } from "@/domain/word/timing";
import { useSettingsStore } from "@/stores/settings";
import { computeSyllableGroups } from "@/domain/word/syllable-groups";
import { stripSplitCharacter } from "@/utils/split-character";
import { splitIntoWords } from "@/utils/sync-helpers";
import { TimeNudgeInput } from "@/views/sync/time-nudge-input";
import { WordRenderer, type WordHandlers } from "@/views/sync/word-renderer";
import { IconLink } from "@tabler/icons-react";
import { memo, useEffect, useMemo, useRef } from "react";

// -- Interfaces ---------------------------------------------------------------

interface ScrollableLineLinkInfo {
  color: string;
  label: string;
  instanceIdx: number;
  totalInstances: number;
}

interface ScrollableLineProps {
  lineId: string;
  text: string;
  lineNumber: number;
  isCurrent: boolean;
  agentId?: string;
  backgroundText?: string;
  backgroundWords?: WordTiming[];
  words?: WordTiming[];
  lineBegin?: number;
  lineEnd?: number;
  granularity: "line" | "word";
  currentTime: number;
  editMode: boolean;
  linkInfo?: ScrollableLineLinkInfo;
  onClick: () => void;
  onNudgeWord?: (wordIndex: number, delta: number) => void;
  onSetWordTime?: (wordIndex: number, newBegin: number) => void;
  onNudgeWordEnd?: (wordIndex: number, delta: number) => void;
  onSetWordEndTime?: (wordIndex: number, newEnd: number) => void;
  onNudgeLine?: (delta: number) => void;
  onSetLineTime?: (newBegin: number) => void;
  onSplitWord?: (wordIndex: number, newWords: WordTiming[]) => void;
  onNudgeBgWord?: (wordIndex: number, delta: number) => void;
  onSetBgWordTime?: (wordIndex: number, newBegin: number) => void;
  onNudgeBgWordEnd?: (wordIndex: number, delta: number) => void;
  onSetBgWordEndTime?: (wordIndex: number, newEnd: number) => void;
}

// -- Component ----------------------------------------------------------------

const ScrollableLineInner: React.FC<ScrollableLineProps> = ({
  lineId,
  text,
  lineNumber,
  isCurrent,
  agentId,
  backgroundText,
  backgroundWords,
  words,
  lineBegin,
  lineEnd,
  granularity,
  currentTime,
  editMode,
  linkInfo,
  onClick,
  onNudgeWord,
  onSetWordTime,
  onNudgeWordEnd,
  onSetWordEndTime,
  onNudgeLine,
  onSetLineTime,
  onSplitWord,
  onNudgeBgWord,
  onSetBgWordTime,
  onNudgeBgWordEnd,
  onSetBgWordEndTime,
}) => {
  const lineRef = useRef<HTMLDivElement>(null);
  const wordTexts = useMemo(() => (words?.length ? words.map((w) => w.text) : splitIntoWords(text)), [text, words]);
  const bgWordTexts = useMemo(
    () =>
      backgroundWords?.length
        ? backgroundWords.map((w) => w.text)
        : backgroundText
          ? splitIntoWords(backgroundText)
          : [],
    [backgroundText, backgroundWords],
  );

  useEffect(() => {
    if (isCurrent && lineRef.current) {
      lineRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [isCurrent]);

  const renderLineContent = () => {
    const displayText = stripSplitCharacter(text);
    if (editMode && lineBegin !== undefined && lineEnd !== undefined) {
      return (
        <span className="relative inline-block">
          <span className="text-composer-text-muted">{displayText}</span>
          <span
            className="absolute inset-0 overflow-hidden text-composer-accent-text"
            data-word-begin={lineBegin}
            data-word-end={lineEnd}
            style={{ width: "0%" }}
          >
            {displayText}
          </span>
        </span>
      );
    }
    return (
      <span className={lineBegin !== undefined ? "text-composer-text-muted" : "text-composer-text"}>{displayText}</span>
    );
  };

  const showSyllableIndicators = useSettingsStore((s) => s.showSyllableIndicators);

  const mainSyllableGroups = useMemo(
    () => (showSyllableIndicators && words?.length ? computeSyllableGroups(words) : []),
    [words, showSyllableIndicators],
  );

  const bgSyllableGroups = useMemo(
    () => (showSyllableIndicators && backgroundWords?.length ? computeSyllableGroups(backgroundWords) : []),
    [backgroundWords, showSyllableIndicators],
  );

  const mainWordHandlers: WordHandlers = {
    onNudge: onNudgeWord,
    onSetTime: onSetWordTime,
    onNudgeEnd: onNudgeWordEnd,
    onSetEndTime: onSetWordEndTime,
    onSplit: onSplitWord,
  };

  const bgWordHandlers: WordHandlers = {
    onNudge: onNudgeBgWord,
    onSetTime: onSetBgWordTime,
    onNudgeEnd: onNudgeBgWordEnd,
    onSetEndTime: onSetBgWordEndTime,
  };

  const renderWordList = (
    texts: string[],
    timings: WordTiming[] | undefined,
    handlers: WordHandlers,
    groups: ReturnType<typeof computeSyllableGroups>,
    prefix: string,
    isBackground?: boolean,
  ) => {
    if (groups.length === 0) {
      return texts.map((word, idx) => (
        <WordRenderer
          // biome-ignore lint/suspicious/noArrayIndexKey: index is stable for word position
          key={`${lineNumber}-${prefix}-${idx}`}
          lineId={lineId}
          word={word}
          idx={idx}
          timing={timings?.[idx]}
          allWords={timings}
          handlers={handlers}
          isBackground={isBackground}
          editMode={editMode}
          currentTime={currentTime}
        />
      ));
    }

    const groupByStart = new Map(groups.map((g) => [g.startIndex, g]));
    const inGroup = new Set(
      groups.flatMap((g) => Array.from({ length: g.endIndex - g.startIndex + 1 }, (_, i) => g.startIndex + i)),
    );
    const elements: React.ReactNode[] = [];
    let i = 0;

    while (i < texts.length) {
      const group = groupByStart.get(i);
      if (group) {
        elements.push(
          <span
            key={`${lineNumber}-${prefix}-group-${group.startIndex}`}
            className="inline-flex flex-col items-center shrink-0"
          >
            <span className="w-full text-center text-sm text-composer-text-muted border-t border-l border-r border-composer-border rounded-t-lg px-1.5 leading-relaxed">
              {group.originalWord}
            </span>
            <span className="inline-flex flex-nowrap gap-x-3 bg-composer-button/30 rounded-b-lg px-1.5 py-0.5 border border-composer-border">
              {texts.slice(group.startIndex, group.endIndex + 1).map((word, j) => {
                const idx = group.startIndex + j;
                return (
                  <WordRenderer
                    key={`${lineNumber}-${prefix}-${idx}`}
                    lineId={lineId}
                    word={word}
                    idx={idx}
                    timing={timings?.[idx]}
                    allWords={timings}
                    handlers={handlers}
                    isBackground={isBackground}
                    editMode={editMode}
                    currentTime={currentTime}
                  />
                );
              })}
            </span>
          </span>,
        );
        i = group.endIndex + 1;
      } else if (!inGroup.has(i)) {
        elements.push(
          <WordRenderer
            key={`${lineNumber}-${prefix}-${i}`}
            lineId={lineId}
            word={texts[i]}
            idx={i}
            timing={timings?.[i]}
            allWords={timings}
            handlers={handlers}
            isBackground={isBackground}
            editMode={editMode}
            currentTime={currentTime}
          />,
        );
        i++;
      } else {
        i++;
      }
    }

    return elements;
  };

  return (
    <div
      ref={lineRef}
      role="button"
      tabIndex={-1}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter") onClick();
      }}
      className={`flex items-start gap-3 px-4 py-2 w-full text-left cursor-pointer transition-colors hover:bg-composer-button/50 border-l ${
        isCurrent ? "bg-composer-accent/10 border-composer-accent" : "border-transparent"
      }`}
    >
      <span className="flex flex-col items-center gap-1 mt-1 w-10 shrink-0">
        <span className="flex items-center gap-1.5 w-full">
          <span
            className="size-2 rounded-full shrink-0"
            style={{
              backgroundColor: agentId ? getAgentColor(agentId) : "transparent",
            }}
            title={agentId}
          />
          <span className="flex-1 font-mono text-xs text-right text-composer-text-muted tabular-nums">
            {lineNumber}
          </span>
        </span>
        {linkInfo && (
          <span
            className="flex items-center gap-1 px-1.5 h-4 text-[10px] rounded-md select-none"
            title={`Linked: ${linkInfo.label} ${linkInfo.instanceIdx + 1}/${linkInfo.totalInstances}`}
            style={{
              background: `color-mix(in srgb, ${linkInfo.color} 18%, transparent)`,
              color: linkInfo.color,
            }}
          >
            <IconLink className="size-2.5" />
            <span className="tabular-nums">
              {linkInfo.instanceIdx + 1}/{linkInfo.totalInstances}
            </span>
          </span>
        )}
      </span>
      <div className="flex flex-col flex-1 gap-1">
        {granularity === "line" ? (
          <div className="flex items-start justify-between gap-2">
            {renderLineContent()}
            {lineBegin !== undefined && onNudgeLine && onSetLineTime && (
              <TimeNudgeInput
                value={lineBegin}
                currentTime={currentTime}
                canDecrease
                canIncrease
                onNudge={onNudgeLine}
                onSetTime={onSetLineTime}
              />
            )}
          </div>
        ) : (
          <div className="flex flex-wrap gap-x-3 gap-y-1 items-end">
            {renderWordList(wordTexts, words, mainWordHandlers, mainSyllableGroups, "main")}
          </div>
        )}
        {bgWordTexts.length > 0 && (
          <div className="flex flex-wrap gap-x-3 gap-y-1 items-end">
            {renderWordList(bgWordTexts, backgroundWords, bgWordHandlers, bgSyllableGroups, "bg", true)}
          </div>
        )}
      </div>
    </div>
  );
};

const ScrollableLine = memo(ScrollableLineInner, (prev, next) => {
  return (
    prev.text === next.text &&
    prev.lineNumber === next.lineNumber &&
    prev.isCurrent === next.isCurrent &&
    prev.agentId === next.agentId &&
    prev.backgroundText === next.backgroundText &&
    prev.backgroundWords === next.backgroundWords &&
    prev.granularity === next.granularity &&
    prev.editMode === next.editMode &&
    prev.lineBegin === next.lineBegin &&
    prev.lineEnd === next.lineEnd &&
    prev.words === next.words &&
    prev.linkInfo?.color === next.linkInfo?.color &&
    prev.linkInfo?.label === next.linkInfo?.label &&
    prev.linkInfo?.instanceIdx === next.linkInfo?.instanceIdx &&
    prev.linkInfo?.totalInstances === next.linkInfo?.totalInstances
  );
});

// -- Exports ------------------------------------------------------------------

export { ScrollableLine };
