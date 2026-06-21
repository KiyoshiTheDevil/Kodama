import { isLinked } from "@/domain/instance/predicates";
import { useDualClickImport } from "@/hooks/useDualClickImport";
import { useAudioStore } from "@/stores/audio";
import { useConfirm } from "@/stores/confirm-store";
import { useImportModal, useImportModalStore, useLastImportResult } from "@/stores/import-modal-store";
import { isAnyModalOpen } from "@/stores/modal-stack";
import { useProjectStore } from "@/stores/project";
import { useSettingsStore } from "@/stores/settings";
import { getAgentColor } from "@/domain/agent/colors";
import { backgroundFields } from "@/domain/line/background";
import type { LinkGroup } from "@/domain/group/template";
import type { LyricLine } from "@/domain/line/model";
import type { WordTiming } from "@/domain/word/timing";
import { Button } from "@/ui/button";
import { Popover } from "@/ui/popover";
import { Scroll } from "@/ui/scroll";
import { classifyLine, extractBackgroundVocals, extractInlineFromLine } from "@/utils/background-vocal-extraction";
import { type ParseResult, parseLyricsFile } from "@/utils/lyrics-parsers";
import { remapWordTextsPreservingTiming } from "@/domain/word/remap-text";
import { stripSplitCharacter } from "@/utils/split-character";
import { AgentManager } from "@/views/edit/agent-manager";
import { decideEditTextAction } from "@/views/edit/decide-edit-text-action";
import { detachInstancesFromLines } from "@/views/edit/diff-edit-text";
import { parseLyrics } from "@/views/edit/parse-lyrics";
import type { ParsedLine } from "@/views/edit/parse-lyrics";
import {
  importParsedLyrics,
  type ImportParsedLyricsContext,
} from "@/views/lyrics-import-modal/use-import-modal-actions";
import { IconAlertTriangle, IconFileImport, IconMicrophone, IconX } from "@tabler/icons-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

// -- Constants ----------------------------------------------------------------

const RUN_DEBOUNCE_MS = 500;

const preventDefaultDragOver = (e: React.DragEvent) => e.preventDefault();

// -- Components ---------------------------------------------------------------

const BracketWarning: React.FC<{ count: number }> = ({ count }) => {
  if (count === 0) return null;

  return (
    <div className="flex items-center gap-2 px-3 py-2 text-sm rounded-lg bg-composer-error/10 text-composer-error">
      <IconAlertTriangle className="size-4 shrink-0" />
      <span>
        {count} line{count > 1 ? "s" : ""} contain{count === 1 ? "s" : ""} [brackets]
      </span>
    </div>
  );
};

const ImportSuccessBanner: React.FC<{
  result: ParseResult;
  filename: string;
  onDismiss: () => void;
}> = ({ result, filename, onDismiss }) => {
  const lineCount = result.lines.length;
  const timedLineCount = result.lines.filter((l) => l.begin !== undefined).length;
  const wordTimedCount = result.lines.filter((l) => l.words?.length).length;

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-2 text-sm rounded-lg bg-composer-accent/10 text-composer-accent-text">
      <div className="flex items-center gap-2">
        <IconFileImport className="size-4 shrink-0" />
        <span>
          Imported {lineCount} lines from {filename}
          {result.hasTimingData && (
            <> with {wordTimedCount > 0 ? `${wordTimedCount} word-timed` : `${timedLineCount} timed`} lines</>
          )}
        </span>
      </div>
      <Button size="icon" variant="ghost" onClick={onDismiss} className="size-6">
        <IconX className="size-4" />
      </Button>
    </div>
  );
};

const LinePreview: React.FC<{
  line: ParsedLine;
  agents: { id: string; name?: string }[];
  isSelected: boolean;
  hasMultipleSelected: boolean;
  groupColor?: string;
  groupTooltip?: string;
  onSelect: (lineNumber: number, shiftKey: boolean) => void;
  onAgentChange: (lineId: string, agentId: string) => void;
  onBulkAgentChange: (agentId: string) => void;
  onBackgroundChange: (lineId: string, text: string) => void;
  onExtractLine: (lineId: string) => void;
  onGutterMouseDown: (lineNumber: number, e: React.MouseEvent) => void;
  onGutterMouseEnter: (lineNumber: number, e: React.MouseEvent) => void;
  didDragRef: React.MutableRefObject<boolean>;
}> = ({
  line,
  agents,
  isSelected,
  hasMultipleSelected,
  groupColor,
  groupTooltip,
  onSelect,
  onAgentChange,
  onBulkAgentChange,
  onBackgroundChange,
  onExtractLine,
  onGutterMouseDown,
  onGutterMouseEnter,
  didDragRef,
}) => {
  const [bgInput, setBgInput] = useState(line.backgroundText ?? "");
  const agentColor = getAgentColor(line.agentId);

  const handleBgBlur = useCallback(() => {
    if (line.lineId) {
      onBackgroundChange(line.lineId, bgInput);
    }
  }, [line.lineId, bgInput, onBackgroundChange]);

  const selectLineForBulkEdit = useCallback(
    (e: React.MouseEvent) => {
      if ((e.target as HTMLElement).closest("select, button")) return;
      if (e.shiftKey) window.getSelection()?.removeAllRanges();
      onSelect(line.lineNumber, e.shiftKey);
    },
    [line.lineNumber, onSelect],
  );

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!e.shiftKey) return;
    if ((e.target as HTMLElement).closest("select, button")) return;
    e.preventDefault();
  }, []);

  const handleGutterClick = useCallback(
    (e: React.MouseEvent) => {
      if (didDragRef.current) {
        didDragRef.current = false;
        e.stopPropagation();
      }
    },
    [didDragRef],
  );

  if (line.isEmpty) {
    return (
      <div className="flex items-baseline gap-2 px-3 py-0.5 opacity-50">
        <span
          className="w-8 font-mono text-xs text-right shrink-0 text-composer-text-muted tabular-nums select-none"
          onMouseEnter={(e) => onGutterMouseEnter(line.lineNumber, e)}
        >
          {line.lineNumber}
        </span>
        <span className="flex-1 text-sm italic text-composer-text-muted">(empty line)</span>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={-1}
      className={`relative flex items-center gap-2 px-3 py-0.5 group cursor-pointer ${
        isSelected ? "bg-composer-accent/15" : line.hasBrackets ? "bg-composer-error/5" : "hover:bg-composer-button/30"
      }`}
      onMouseDown={handleMouseDown}
      onClick={selectLineForBulkEdit}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSelect(line.lineNumber, e.shiftKey);
      }}
      title={groupTooltip}
    >
      {groupColor && (
        <span
          aria-hidden
          className="absolute top-0 bottom-0 left-0 w-0.5 pointer-events-none"
          style={{ backgroundColor: groupColor }}
        />
      )}
      <span
        role="button"
        tabIndex={-1}
        className="w-8 font-mono text-xs text-right shrink-0 text-composer-text-muted tabular-nums select-none cursor-pointer"
        onMouseDown={(e) => onGutterMouseDown(line.lineNumber, e)}
        onMouseEnter={(e) => onGutterMouseEnter(line.lineNumber, e)}
        onClick={handleGutterClick}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleGutterClick(e as unknown as React.MouseEvent);
        }}
      >
        {line.lineNumber}
      </span>

      <span
        data-testid="line-preview-text"
        className={`text-sm ${line.hasBrackets ? "text-composer-error" : "text-composer-text"}`}
        style={{ borderLeft: `2px solid ${agentColor}`, paddingLeft: "6px" }}
      >
        {stripSplitCharacter(line.text)}
      </span>

      {line.backgroundText && (
        <span data-testid="line-preview-background" className="text-xs italic text-composer-text-muted">
          {line.backgroundText}
        </span>
      )}

      <div className="flex items-center gap-1.5 ml-auto transition-opacity opacity-0 group-hover:opacity-100">
        {agents.length > 1 && line.lineId && (
          <select
            value={line.agentId}
            onChange={(e) => {
              if (isSelected && hasMultipleSelected) {
                onBulkAgentChange(e.target.value);
              } else {
                onAgentChange(line.lineId, e.target.value);
              }
            }}
            onMouseDown={(e) => e.stopPropagation()}
            className="h-5 px-1 text-xs border rounded cursor-pointer bg-composer-input border-composer-border focus:outline-none focus:border-composer-accent"
            style={{ borderLeftColor: agentColor, borderLeftWidth: "2px" }}
          >
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>
                {agent.name || agent.id}
              </option>
            ))}
          </select>
        )}

        {line.lineId && (
          <Popover
            placement="bottom-start"
            trigger={
              <button
                type="button"
                className="flex items-center gap-1 px-1.5 h-5 text-xs rounded cursor-pointer bg-composer-button hover:bg-composer-button-hover text-composer-text-muted hover:text-composer-text"
              >
                <IconMicrophone className="size-3" />
                BG
              </button>
            }
          >
            {(close) => (
              <div className="p-2 w-48">
                <p className="mb-1 text-xs text-composer-text-secondary">Background vocals</p>
                {classifyLine(line.text).kind === "inline" && (
                  <button
                    type="button"
                    onClick={() => {
                      if (line.lineId) onExtractLine(line.lineId);
                      close();
                    }}
                    className="mb-1 flex w-full items-center gap-1 text-xs cursor-pointer text-composer-accent-text hover:text-composer-accent"
                  >
                    Pull from ( )
                  </button>
                )}
                <input
                  type="text"
                  aria-label="Background vocals text"
                  value={bgInput}
                  onChange={(e) => setBgInput(e.target.value)}
                  onBlur={handleBgBlur}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") {
                      handleBgBlur();
                      close();
                    }
                  }}
                  placeholder="ooh, ah, etc."
                  className="w-full px-2 py-1 text-sm border rounded bg-composer-input border-composer-border focus:outline-none focus:border-composer-accent"
                />
              </div>
            )}
          </Popover>
        )}

        {line.hasTiming && <span className="text-xs text-composer-accent-text">synced</span>}
        {line.hasBrackets && <IconAlertTriangle className="size-4 text-composer-error" />}
      </div>
    </div>
  );
};

const EditPanel: React.FC = () => {
  const textareaId = useId();
  const agents = useProjectStore((s) => s.agents);
  const lines = useProjectStore((s) => s.lines);
  const groups = useProjectStore((s) => s.groups);
  const activeTab = useProjectStore((s) => s.activeTab);
  const setLines = useProjectStore((s) => s.setLines);
  const confirm = useConfirm();
  const openImportModal = useImportModal();
  const lastImportResult = useLastImportResult();
  const autoExtractBackgroundVocals = useSettingsStore((s) => s.autoExtractBackgroundVocals);
  const mergeStandaloneBackgroundLines = useSettingsStore((s) => s.mergeStandaloneBackgroundLines);
  const preserveBracketsOnExtraction = useSettingsStore((s) => s.preserveBracketsOnExtraction);

  const [rawText, setRawText] = useState(() => (lines.length > 0 ? lines.map((l) => l.text).join("\n") : ""));
  const rawTextRef = useRef(rawText);
  rawTextRef.current = rawText;
  const linesSetByUs = useRef<LyricLine[] | null>(null);
  const modalPendingRef = useRef(false);
  const pastedRef = useRef(false);
  const runBaselineRef = useRef<{ lines: LyricLine[]; wasDirty: boolean } | null>(null);
  const debounceRef = useRef<number | null>(null);
  const [selectedLines, setSelectedLines] = useState<Set<number>>(new Set());
  const lastSelectedLineRef = useRef<number | null>(null);
  const dragAnchorRef = useRef<number | null>(null);
  const didDragRef = useRef(false);

  // Sync rawText when lines change externally (persistence restore, project import, etc.)
  useEffect(() => {
    if (linesSetByUs.current === lines) {
      linesSetByUs.current = null;
      return;
    }
    setRawText(lines.length > 0 ? lines.map((l) => l.text).join("\n") : "");
  }, [lines]);

  const defaultAgentId = agents?.[0]?.id ?? "v1";
  const parsed = useMemo(() => parseLyrics(rawText, lines, defaultAgentId), [rawText, lines, defaultAgentId]);
  const bracketCount = useMemo(() => parsed.filter((p) => p.hasBrackets).length, [parsed]);
  const nonEmptyCount = useMemo(() => parsed.filter((p) => !p.isEmpty).length, [parsed]);
  const instanceCountByGroup = useMemo(() => {
    const indices = new Map<string, Set<number>>();
    for (const l of lines) {
      if (isLinked(l)) {
        let set = indices.get(l.groupId);
        if (!set) {
          set = new Set();
          indices.set(l.groupId, set);
        }
        set.add(l.instanceIdx);
      }
    }
    const counts = new Map<string, number>();
    for (const [k, v] of indices) counts.set(k, v.size);
    return counts;
  }, [lines]);

  const extractOptions = useMemo(
    () => ({
      mergeStandaloneLines: mergeStandaloneBackgroundLines,
      preserveBrackets: preserveBracketsOnExtraction,
    }),
    [mergeStandaloneBackgroundLines, preserveBracketsOnExtraction],
  );
  const canExtractBackgroundVocals = useMemo(() => {
    const extracted = extractBackgroundVocals(lines, extractOptions);
    return extracted.length !== lines.length || extracted.some((line, i) => line !== lines[i]);
  }, [lines, extractOptions]);

  const commitLinesWithHistory = useCallback((nextLines: LyricLine[], nextGroups?: LinkGroup[]) => {
    useProjectStore.getState().setLinesWithHistory(nextLines, nextGroups);
    const committed = useProjectStore.getState().lines;
    linesSetByUs.current = committed;
    setRawText(committed.map((line) => line.text).join("\n"));
  }, []);

  const handleExtractBackgroundVocals = useCallback(() => {
    const current = useProjectStore.getState().lines;
    const next = extractBackgroundVocals(current, extractOptions);
    if (next.length === current.length && next.every((line, i) => line === current[i])) return;
    commitLinesWithHistory(next);
  }, [extractOptions, commitLinesWithHistory]);

  const handleAgentChange = useCallback((lineId: string, agentId: string) => {
    useProjectStore.getState().updateLineWithHistory(lineId, { agentId });
  }, []);

  const handleBackgroundChange = useCallback((lineId: string, text: string) => {
    const newBgText = text || undefined;
    const target = useProjectStore.getState().lines.find((l) => l.id === lineId);

    let words: WordTiming[] | undefined;
    if (newBgText && target?.backgroundWords?.length) {
      words = remapWordTextsPreservingTiming(target.backgroundWords, newBgText) ?? undefined;
    }

    useProjectStore
      .getState()
      .updateLineWithHistory(lineId, backgroundFields({ text: newBgText, words, source: "manual" }));
  }, []);

  const handleExtractLine = useCallback((lineId: string) => {
    const target = useProjectStore.getState().lines.find((line) => line.id === lineId);
    if (!target) return;
    const extracted = extractInlineFromLine(target, {
      mergeStandaloneLines: false,
      preserveBrackets: useSettingsStore.getState().preserveBracketsOnExtraction,
    });
    if (extracted === target) return;
    useProjectStore.getState().updateLineWithHistory(lineId, {
      text: extracted.text,
      words: extracted.words,
      ...backgroundFields({
        text: extracted.backgroundText,
        words: extracted.backgroundWords,
        source: extracted.backgroundTextSource ?? "manual",
      }),
    });
  }, []);

  const handleLineSelect = useCallback((lineNumber: number, shiftKey: boolean) => {
    const anchor = lastSelectedLineRef.current;
    setSelectedLines((prev) => {
      const next = new Set(prev);
      if (shiftKey && anchor !== null) {
        const start = Math.min(anchor, lineNumber);
        const end = Math.max(anchor, lineNumber);
        for (let i = start; i <= end; i++) {
          next.add(i);
        }
      } else {
        if (next.has(lineNumber)) {
          next.delete(lineNumber);
        } else {
          next.add(lineNumber);
        }
      }
      return next;
    });
    lastSelectedLineRef.current = lineNumber;
  }, []);

  const handleGutterMouseDown = useCallback((lineNumber: number, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    window.getSelection()?.removeAllRanges();
    dragAnchorRef.current = lineNumber;
    didDragRef.current = false;
  }, []);

  const handleGutterMouseEnter = useCallback((lineNumber: number, e: React.MouseEvent) => {
    const anchor = dragAnchorRef.current;
    if (anchor === null) return;
    if (e.buttons === 0) {
      dragAnchorRef.current = null;
      didDragRef.current = false;
      return;
    }
    didDragRef.current = true;
    const start = Math.min(anchor, lineNumber);
    const end = Math.max(anchor, lineNumber);
    const next = new Set<number>();
    for (let i = start; i <= end; i++) {
      next.add(i);
    }
    setSelectedLines(next);
    lastSelectedLineRef.current = lineNumber;
  }, []);

  const handleBulkAgentChange = useCallback(
    (agentId: string) => {
      const selectedLineIds = new Set(
        parsed.flatMap((p) => (selectedLines.has(p.lineNumber) && p.lineId ? [p.lineId] : [])),
      );
      const updates = [...selectedLineIds].map((id) => ({ id: id as string, updates: { agentId } }));
      useProjectStore.getState().updateLinesWithHistory(updates);
      setSelectedLines(new Set());
    },
    [parsed, selectedLines],
  );

  const handleClearSelection = useCallback(() => {
    setSelectedLines(new Set());
  }, []);

  const finalizeRun = useCallback(() => {
    if (debounceRef.current !== null) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    const baseline = runBaselineRef.current;
    if (baseline) {
      runBaselineRef.current = null;
      useProjectStore.getState().commitPendingLineEdit(baseline.lines, baseline.wasDirty);
    }
  }, []);

  const scheduleRunFinalize = useCallback(() => {
    if (debounceRef.current !== null) clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      debounceRef.current = null;
      finalizeRun();
    }, RUN_DEBOUNCE_MS);
  }, [finalizeRun]);

  const handleTextareaBlur = useCallback(() => {
    finalizeRun();
    if (!useSettingsStore.getState().autoExtractBackgroundVocals) return;
    const current = useProjectStore.getState().lines;
    const next = extractBackgroundVocals(current, {
      mergeStandaloneLines: useSettingsStore.getState().mergeStandaloneBackgroundLines,
      preserveBrackets: useSettingsStore.getState().preserveBracketsOnExtraction,
    });
    if (next.length === current.length && next.every((line, i) => line === current[i])) return;
    commitLinesWithHistory(next);
  }, [commitLinesWithHistory, finalizeRun]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (activeTab !== "edit") return;
      if (isAnyModalOpen()) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      const target = e.target as HTMLElement;
      if ((target.tagName === "INPUT" || target.tagName === "TEXTAREA") && target.id !== textareaId) return;
      const key = e.key.toLowerCase();
      const isUndo = key === "z" && !e.shiftKey;
      const isRedo = (key === "z" && e.shiftKey) || key === "y";
      if (!isUndo && !isRedo) return;
      e.preventDefault();
      finalizeRun();
      if (isUndo) useProjectStore.getState().undo();
      else useProjectStore.getState().redo();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTab, textareaId, finalizeRun]);

  useEffect(() => () => finalizeRun(), [finalizeRun]);

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const wasPaste = pastedRef.current;
      pastedRef.current = false;

      const text = e.target.value;
      const action = decideEditTextAction({
        text,
        defaultAgentId,
        lines,
        groups,
        modalPending: modalPendingRef.current,
      });

      // Snap the controlled DOM input back to the source-of-truth rawText whenever
      // we choose not to setRawText. Without this, React skips reconciling the
      // textarea on a state-less return path and the user's keystrokes persist
      // visually even though the store rejected them.
      const snapBack = () => {
        if (e.target.value !== rawTextRef.current) {
          e.target.value = rawTextRef.current;
        }
      };

      if (action.kind === "ignore-modal-pending") {
        snapBack();
        return;
      }

      if (action.kind === "needs-confirm") {
        snapBack();
        modalPendingRef.current = true;
        const labelText =
          action.labels.length === 0
            ? `${action.impacted.length} instance${action.impacted.length === 1 ? "" : "s"}`
            : action.labels.length === 1
              ? `[${action.labels[0]}]`
              : action.labels.map((l) => `[${l}]`).join(", ");

        confirm({
          title: `Detach ${labelText} to apply this edit?`,
          description: `Adding or removing rows inside ${
            action.labels.length === 1 ? `the ${labelText} group` : "these groups"
          } will detach ${action.impacted.length === 1 ? "this instance" : "these instances"} from the link. Other instances stay linked.`,
          confirmLabel: "Detach and apply",
          variant: "destructive",
          recoverable: true,
        }).then((ok) => {
          modalPendingRef.current = false;
          if (!ok) return;
          const detached = detachInstancesFromLines(action.lyricLines, action.impacted);
          const remainingGroupIds = new Set(detached.flatMap((l) => (l.groupId ? [l.groupId] : [])));
          const nextGroups = groups.filter((g) => remainingGroupIds.has(g.id));
          finalizeRun();
          commitLinesWithHistory(detached, nextGroups);
        });
        return;
      }

      setRawText(text);
      useImportModalStore.getState().clearImportResult();

      if (action.kind === "noop") return;

      let finalLines = action.finalLines;

      if (wasPaste) {
        if (useSettingsStore.getState().autoExtractBackgroundVocals) {
          finalLines = extractBackgroundVocals(finalLines, {
            mergeStandaloneLines: useSettingsStore.getState().mergeStandaloneBackgroundLines,
            preserveBrackets: useSettingsStore.getState().preserveBracketsOnExtraction,
          });
        }
        finalizeRun();
        commitLinesWithHistory(finalLines);
        return;
      }

      if (runBaselineRef.current === null) {
        const projectState = useProjectStore.getState();
        runBaselineRef.current = { lines: projectState.lines, wasDirty: projectState.isDirtySinceHistory };
      }
      linesSetByUs.current = finalLines;
      setLines(finalLines);
      scheduleRunFinalize();
    },
    [confirm, defaultAgentId, groups, lines, setLines, scheduleRunFinalize, commitLinesWithHistory, finalizeRun],
  );

  const handleDroppedFile = useCallback(
    async (file: File) => {
      const content = await file.text();
      const audioDuration = useAudioStore.getState().duration;
      const parsed = parseLyricsFile(file.name, content, audioDuration > 0 ? audioDuration : undefined);
      const context: ImportParsedLyricsContext = {
        confirm,
        agents,
        audioDuration,
        applyBackgroundExtraction: autoExtractBackgroundVocals,
        backgroundExtractionMergeStandalone: mergeStandaloneBackgroundLines,
        backgroundExtractionPreserveBrackets: preserveBracketsOnExtraction,
        source: { label: "Drop", filename: file.name },
        onResult: (result, source) => {
          useImportModalStore.getState().recordImportResult(result, source);
        },
      };
      await importParsedLyrics(parsed, context);
    },
    [agents, autoExtractBackgroundVocals, confirm, mergeStandaloneBackgroundLines, preserveBracketsOnExtraction],
  );

  const importTriggers = useDualClickImport(openImportModal);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && /\.(txt|lrc|srt|ttml|xml)$/i.test(file.name)) {
        handleDroppedFile(file);
      }
    },
    [handleDroppedFile],
  );

  return (
    <div
      data-tour="edit-panel"
      className="flex flex-col flex-1 gap-4 p-4 overflow-hidden"
      onDrop={handleDrop}
      onDragOver={preventDefaultDragOver}
    >
      <div className="flex items-center justify-between select-none">
        <h2 className="text-lg font-medium">Lyrics Editor</h2>
        <div className="flex items-center gap-3">
          <span className="text-sm text-composer-text-muted">
            {nonEmptyCount} line{nonEmptyCount !== 1 ? "s" : ""}
          </span>
          <Button
            hasIcon
            variant="secondary"
            onClick={handleExtractBackgroundVocals}
            disabled={!canExtractBackgroundVocals}
          >
            <IconMicrophone className="size-4" />
            Extract background vocals
          </Button>
          <Button
            hasIcon
            onClick={importTriggers.onClick}
            onDoubleClick={importTriggers.onDoubleClick}
            title="Click to search, paste, or upload. Double-click to upload a file directly."
          >
            <IconFileImport className="size-4" />
            Import Lyrics
          </Button>
          {importTriggers.fileInput}
        </div>
      </div>

      {lastImportResult && (
        <ImportSuccessBanner
          result={lastImportResult.parsed}
          filename={lastImportResult.source.filename}
          onDismiss={() => useImportModalStore.getState().clearImportResult()}
        />
      )}

      <BracketWarning count={bracketCount} />

      <AgentManager />

      <div className="flex flex-1 min-h-0 gap-4">
        {/* Input */}
        <div className="flex flex-col flex-1 min-w-0">
          <label htmlFor={textareaId} className="mb-2 text-sm font-medium select-none text-composer-text-secondary">
            Paste or type lyrics
          </label>
          {/* react-doctor-disable-next-line react-doctor/control-has-associated-label */}
          <textarea
            id={textareaId}
            value={rawText}
            onChange={handleTextChange}
            onBlur={handleTextareaBlur}
            onPaste={() => {
              pastedRef.current = true;
            }}
            placeholder="Paste your lyrics here, one line at a time...

Or drag and drop a lyrics file (.txt, .lrc, .srt, .ttml)"
            className="flex-1 p-3 text-sm border rounded-lg resize-none bg-composer-input border-composer-border focus:outline-none focus:border-composer-accent placeholder:text-composer-text-muted"
            spellCheck={false}
          />
        </div>

        {/* Preview */}
        <div className="flex flex-col flex-1 min-w-0">
          <div className="flex items-center justify-between h-5 mb-2">
            <span className="text-sm font-medium select-none text-composer-text-secondary">Preview</span>
            <div
              className={`flex items-center gap-2 transition-opacity ${selectedLines.size > 0 ? "opacity-100" : "opacity-0 pointer-events-none"}`}
            >
              <span className="text-xs text-composer-text-muted">
                {selectedLines.size} line{selectedLines.size !== 1 ? "s" : ""} selected
              </span>
              {agents.length > 1 && (
                <select
                  onChange={(e) => handleBulkAgentChange(e.target.value)}
                  value=""
                  className="h-6 px-1.5 text-xs border rounded cursor-pointer bg-composer-input border-composer-border focus:outline-none focus:border-composer-accent"
                >
                  <option value="" disabled>
                    Assign agent
                  </option>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name || agent.id}
                    </option>
                  ))}
                </select>
              )}
              <button
                type="button"
                onClick={handleClearSelection}
                className="text-xs cursor-pointer text-composer-text-muted hover:text-composer-text"
              >
                Clear
              </button>
            </div>
          </div>
          <Scroll className="flex-1 border rounded-lg border-composer-border bg-composer-bg-dark">
            {parsed.length === 0 || (parsed.length === 1 && parsed[0].isEmpty) ? (
              <div className="flex items-center justify-center h-full text-sm text-composer-text-muted">
                Lyrics will appear here
              </div>
            ) : (
              <div className="py-2">
                {parsed.map((line, index) => {
                  const prev = index > 0 ? parsed[index - 1] : null;
                  const next = index < parsed.length - 1 ? parsed[index + 1] : null;
                  const isFirstOfInstance =
                    line.groupId !== undefined &&
                    line.instanceIdx !== undefined &&
                    (prev?.groupId !== line.groupId || prev?.instanceIdx !== line.instanceIdx);
                  const isLastOfInstance =
                    line.groupId !== undefined &&
                    line.instanceIdx !== undefined &&
                    (next?.groupId !== line.groupId || next?.instanceIdx !== line.instanceIdx);
                  const group = line.groupId ? groups.find((g) => g.id === line.groupId) : undefined;
                  const totalInstances = group ? (instanceCountByGroup.get(group.id) ?? 0) : 0;
                  const groupTooltip =
                    group && totalInstances > 1
                      ? `Part of ${group.label} · linked to ${totalInstances - 1} other instance${totalInstances - 1 === 1 ? "" : "s"}. Edits propagate.`
                      : undefined;
                  return (
                    <div key={line.lineNumber}>
                      {isFirstOfInstance && group && (
                        <div
                          className="mx-3 mt-2 mb-1 flex items-center gap-2 text-xs text-composer-text-muted select-none"
                          aria-hidden
                        >
                          <span className="font-medium text-composer-text">{group.label}</span>
                          <span className="tabular-nums">
                            · {(line.instanceIdx ?? 0) + 1} of {totalInstances}
                          </span>
                          <span className="flex-1 h-px" style={{ backgroundColor: group.color, opacity: 0.4 }} />
                        </div>
                      )}
                      <LinePreview
                        line={line}
                        agents={agents}
                        isSelected={selectedLines.has(line.lineNumber)}
                        hasMultipleSelected={selectedLines.size > 1}
                        groupColor={group?.color}
                        groupTooltip={groupTooltip}
                        onSelect={handleLineSelect}
                        onAgentChange={handleAgentChange}
                        onBulkAgentChange={handleBulkAgentChange}
                        onBackgroundChange={handleBackgroundChange}
                        onExtractLine={handleExtractLine}
                        onGutterMouseDown={handleGutterMouseDown}
                        onGutterMouseEnter={handleGutterMouseEnter}
                        didDragRef={didDragRef}
                      />
                      {isLastOfInstance && group && (
                        <div className="mx-3 mt-1 mb-2 flex items-center select-none" aria-hidden>
                          <span className="flex-1 h-px" style={{ backgroundColor: group.color, opacity: 0.4 }} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </Scroll>
        </div>
      </div>
    </div>
  );
};

// -- Exports ------------------------------------------------------------------

export { EditPanel };
