import { useAudioStore } from "@/stores/audio";
import { isAnyModalOpen } from "@/stores/modal-stack";
import { useProjectStore } from "@/stores/project";
import type { LyricLine } from "@/domain/line/model";
import { useSettingsStore } from "@/stores/settings";
import { showGroupActionToast } from "@/utils/group-toast";
import { handleWordChangeWithDivergenceCheck } from "@/utils/word-divergence-flow";
import { MOD_KEY } from "@/utils/platform";
import { findMatchingShortcut } from "@/utils/shortcut-matcher";
import { copyInstanceToClipboardAndPreview } from "@/views/timeline/copy-instance-to-clipboard";
import { decideAddInstancePlacement } from "@/views/timeline/decide-add-instance-placement";
import { deleteGroupWithConfirm } from "@/views/timeline/delete-group-with-confirm";
import { resolveExplicitSelectionToggle } from "@/views/timeline/explicit-selection-toggle";
import { GROUP_HEADER_HEIGHT } from "@/views/timeline/group-header-row";
import { createGroupFromSelection, fillSelectionGaps, instanceToTemplate } from "@/views/timeline/group-ops";
import { scrollToInstanceHeader } from "@/views/timeline/scroll-helpers";
import { splitLinesIntoWords } from "@/views/timeline/split-lines-into-words";
import { mergeWordText } from "@/utils/word-merge";
import type { WordSelection } from "@/domain/selection/model";
import { GUTTER_WIDTH, useTimelineStore, WAVEFORM_HEIGHT } from "@/views/timeline/timeline-store";
import { useTimelineClipboard } from "@/views/timeline/use-timeline-clipboard";
import { findWordsAtTime, pickNextWordAtPlayhead } from "@/views/timeline/word-at-playhead";
import { instanceBounds } from "@/domain/instance/bounds";
import { linesOfInstance } from "@/domain/instance/enumerate";
import { isLinked } from "@/domain/instance/predicates";
import { manualBackgroundWordEdit } from "@/domain/line/background";
import { contiguousSelectionRun } from "@/domain/selection/contiguous";
import { effectiveBounds } from "@/domain/line/bounds";
import {
  computeRowLayout,
  findWordAtTime,
  getWordsInInstance,
  partitionNudgeSelections,
  shiftSelectionsTogether,
} from "@/views/timeline/utils";
import { type RefObject, useCallback, useEffect } from "react";
import { toast } from "sonner";

// -- Helpers ------------------------------------------------------------------

function currentInstanceFromSelection(
  lines: LyricLine[],
  selectedWords: ReadonlyArray<{ lineId: string }>,
): { groupId: string; instanceIdx: number } | null {
  if (selectedWords.length === 0) return null;
  const linesById = new Map<string, LyricLine>();
  for (const l of lines) linesById.set(l.id, l);
  let groupId: string | null = null;
  let instanceIdx: number | null = null;
  for (const sel of selectedWords) {
    const line = linesById.get(sel.lineId);
    if (!line || !isLinked(line)) return null;
    if (groupId === null) {
      groupId = line.groupId;
      instanceIdx = line.instanceIdx;
    } else if (line.groupId !== groupId || line.instanceIdx !== instanceIdx) {
      return null;
    }
  }
  if (groupId === null || instanceIdx === null) return null;
  return { groupId, instanceIdx };
}

function listInstancesOfGroup(lines: LyricLine[], groupId: string): number[] {
  const set = new Set<number>();
  for (const line of lines) {
    if (line.groupId === groupId && line.instanceIdx !== undefined) set.add(line.instanceIdx);
  }
  return Array.from(set).sort((a, b) => a - b);
}

// -- Constants -----------------------------------------------------------------

const BG_DROP_ZONE_HEIGHT = 24;

// -- Hook ----------------------------------------------------------------------

function useTimelineKeyboard(
  scrollContainerRef: RefObject<HTMLDivElement | null>,
  lines: LyricLine[],
  duration: number,
  onOpenLyricsModal?: () => void,
) {
  const { handleCopy, handleDelete, handleCut, handlePaste } = useTimelineClipboard(lines);

  const handleSetWordTiming = useCallback(
    (edge: "begin" | "end") => {
      const audioEl = useAudioStore.getState().audioElement;
      const currentTime = audioEl?.currentTime ?? useAudioStore.getState().currentTime;

      const { selectedWords, zoom, rowHeights, defaultRowHeight } = useTimelineStore.getState();
      const selectedWord = selectedWords[0] ?? null;
      const fromPlayhead = !selectedWord;
      const targetWord = selectedWord ?? findWordAtTime(lines, currentTime);
      if (!targetWord) return;

      const line = lines[targetWord.lineIndex];
      if (!line) return;

      const wordsArray = targetWord.type === "word" ? line.words : line.backgroundWords;
      if (!wordsArray) return;

      const wordIndex = targetWord.wordIndex;
      const word = wordsArray[wordIndex];
      if (!word) return;

      const scrollContainer = scrollContainerRef.current;

      if (fromPlayhead && scrollContainer) {
        const collapsedInstances = useTimelineStore.getState().collapsedInstances;
        const layout = computeRowLayout({
          lines,
          rowHeights,
          defaultRowHeight,
          collapsedInstances,
          waveformHeight: WAVEFORM_HEIGHT,
          bgDropZoneHeight: BG_DROP_ZONE_HEIGHT,
          groupHeaderHeight: GROUP_HEADER_HEIGHT,
        });
        const pos = layout.lineTops.get(line.id);
        if (pos) {
          const visibleTop = scrollContainer.scrollTop;
          const visibleBottom = visibleTop + scrollContainer.clientHeight;
          const rowBottom = pos.top + pos.height;
          const isRowVisible = pos.top >= visibleTop && rowBottom <= visibleBottom;

          if (!isRowVisible) {
            scrollContainer.scrollTo({ top: pos.top - WAVEFORM_HEIGHT, behavior: "instant" });
          }
        }

        const wordLeft = word.begin * zoom;
        const wordRight = word.end * zoom;
        const visibleLeft = scrollContainer.scrollLeft;
        const visibleRight = visibleLeft + scrollContainer.clientWidth - GUTTER_WIDTH;
        const isWordHorizontallyVisible = wordLeft >= visibleLeft && wordRight <= visibleRight;

        if (!isWordHorizontallyVisible) {
          toast("Word is off-screen", {
            action: {
              label: "Jump to word",
              onClick: () => {
                scrollContainer.scrollTo({
                  left: Math.max(0, wordLeft - 50),
                  behavior: "smooth",
                });
              },
            },
          });
        }
      }

      const updatedWords = [...wordsArray];

      if (edge === "begin") {
        const prevEnd = wordIndex > 0 ? wordsArray[wordIndex - 1].end : 0;
        const maxBegin = word.end - useSettingsStore.getState().minWordDuration;
        const clampedBegin = Math.max(prevEnd, Math.min(maxBegin, Math.max(0, currentTime)));
        updatedWords[wordIndex] = { ...word, begin: clampedBegin };
      } else {
        const minEnd = word.begin + useSettingsStore.getState().minWordDuration;
        const nextBegin = wordIndex < wordsArray.length - 1 ? wordsArray[wordIndex + 1].begin : duration;
        const clampedEnd = Math.min(nextBegin, Math.max(minEnd, Math.min(duration, currentTime)));
        updatedWords[wordIndex] = { ...word, end: clampedEnd };
      }

      const updateLineWithHistory = useProjectStore.getState().updateLineWithHistory;
      if (targetWord.type === "word") {
        updateLineWithHistory(line.id, { words: updatedWords }, { propagateToSiblings: false });
      } else {
        updateLineWithHistory(line.id, manualBackgroundWordEdit(updatedWords), { propagateToSiblings: false });
      }
    },
    [lines, duration, scrollContainerRef],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: scrollContainerRef is a stable ref, .current should not be a dep
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (useProjectStore.getState().activeTab !== "timeline") return;
      if (isAnyModalOpen()) return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return;

      if (e.code === "KeyZ" && (e.metaKey || e.ctrlKey) && !e.repeat) {
        e.preventDefault();
        if (e.shiftKey) {
          useProjectStore.getState().redo();
        } else {
          useProjectStore.getState().undo();
        }
        return;
      }

      if (e.code === "KeyC" && (e.metaKey || e.ctrlKey) && !e.repeat) {
        e.preventDefault();
        handleCopy();
        return;
      }

      if (e.code === "KeyX" && (e.metaKey || e.ctrlKey) && !e.repeat) {
        e.preventDefault();
        handleCut();
        return;
      }

      if (e.code === "KeyV" && (e.metaKey || e.ctrlKey) && e.shiftKey && !e.repeat) {
        e.preventDefault();
        onOpenLyricsModal?.();
        return;
      }

      if (e.code === "KeyV" && (e.metaKey || e.ctrlKey) && !e.repeat) {
        e.preventDefault();
        handlePaste();
        return;
      }

      if (e.code === "KeyA" && (e.metaKey || e.ctrlKey) && !e.repeat) {
        e.preventDefault();
        const allSelections: WordSelection[] = [];
        for (let li = 0; li < lines.length; li++) {
          const line = lines[li];
          for (let wi = 0; wi < (line.words?.length ?? 0); wi++)
            allSelections.push({ lineId: line.id, lineIndex: li, wordIndex: wi, type: "word" });
          for (let wi = 0; wi < (line.backgroundWords?.length ?? 0); wi++)
            allSelections.push({ lineId: line.id, lineIndex: li, wordIndex: wi, type: "bg" });
        }
        useTimelineStore.getState().setSelectedWords(allSelections);
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        const { selectedWords } = useTimelineStore.getState();
        if (selectedWords.length > 0) {
          e.preventDefault();
          handleDelete();
          return;
        }
      }

      if (e.key === "Escape") {
        const { pasteMode } = useTimelineStore.getState();
        if (pasteMode.status === "preview") {
          useTimelineStore.getState().setPasteMode({ status: "idle" });
        } else {
          useTimelineStore.getState().clearSelection();
        }
        return;
      }

      if (e.key === "F2") {
        const { selectedWords: eSel } = useTimelineStore.getState();
        if (eSel.length === 1) {
          e.preventDefault();
          useTimelineStore.getState().setEditingWord({
            lineId: eSel[0].lineId,
            wordIndex: eSel[0].wordIndex,
            type: eSel[0].type,
          });
        }
        return;
      }

      const matched = findMatchingShortcut(e, "timeline");
      if (!matched) return;

      switch (matched) {
        case "timeline.jumpToPlayhead": {
          e.preventDefault();
          const scrollContainer = scrollContainerRef.current;
          if (!scrollContainer) return;

          const audioEl = useAudioStore.getState().audioElement;
          const currentTime = audioEl?.currentTime ?? useAudioStore.getState().currentTime;
          const { zoom, rowHeights, defaultRowHeight } = useTimelineStore.getState();

          const viewportWidth = scrollContainer.clientWidth;
          scrollContainer.scrollLeft = Math.max(0, currentTime * zoom - viewportWidth / 2 + GUTTER_WIDTH);

          let activeLineIndex = -1;
          for (let i = 0; i < lines.length; i++) {
            const timing = effectiveBounds(lines[i]);
            if (timing && currentTime >= timing.begin && currentTime < timing.end) {
              activeLineIndex = i;
              break;
            }
          }

          if (activeLineIndex >= 0) {
            const line = lines[activeLineIndex];
            const collapsedInstances = useTimelineStore.getState().collapsedInstances;
            const layout = computeRowLayout({
              lines,
              rowHeights,
              defaultRowHeight,
              collapsedInstances,
              waveformHeight: WAVEFORM_HEIGHT,
              bgDropZoneHeight: BG_DROP_ZONE_HEIGHT,
              groupHeaderHeight: GROUP_HEADER_HEIGHT,
            });
            const instanceKey = isLinked(line) ? `${line.groupId}:${line.instanceIdx}` : null;
            const pos =
              instanceKey && collapsedInstances[instanceKey]
                ? layout.headerTops.get(instanceKey)
                : layout.lineTops.get(line.id);

            if (pos) {
              const viewportHeight = scrollContainer.clientHeight;
              const rowCenter = pos.top + pos.height / 2;
              const targetTop = Math.max(
                0,
                Math.min(scrollContainer.scrollHeight - viewportHeight, rowCenter - viewportHeight / 2),
              );
              scrollContainer.scrollTo({ top: targetTop, behavior: "instant" });
            }
          }
          break;
        }
        case "timeline.selectWordAtPlayhead": {
          e.preventDefault();
          const audioEl = useAudioStore.getState().audioElement;
          const currentTime = audioEl?.currentTime ?? useAudioStore.getState().currentTime;
          const matches = findWordsAtTime(lines, currentTime);
          const next = pickNextWordAtPlayhead(matches, useTimelineStore.getState().selectedWords);
          if (!next) {
            toast("No word under the playhead");
            break;
          }
          useTimelineStore.getState().setSelectedWords([next]);
          break;
        }
        case "timeline.toggleFollow":
          useTimelineStore.getState().toggleFollow();
          break;
        case "timeline.togglePreview":
          useTimelineStore.getState().togglePreviewSidebar();
          break;
        case "timeline.toggleSnap": {
          const s = useSettingsStore.getState();
          s.set("timelineSnap", !s.timelineSnap);
          break;
        }
        case "timeline.toggleRollingEdit":
          useTimelineStore.getState().toggleRollingEditMode();
          break;
        case "timeline.setWordBegin":
          e.preventDefault();
          handleSetWordTiming("begin");
          break;
        case "timeline.setWordEnd":
          e.preventDefault();
          handleSetWordTiming("end");
          break;
        case "timeline.insertLineBelow":
        case "timeline.insertLineAbove": {
          const { selectedWords: nSel } = useTimelineStore.getState();
          if (nSel.length === 0) break;
          const lineIndex = nSel[0].lineIndex;
          const agents = useProjectStore.getState().agents;
          const defaultAgentId = agents?.[0]?.id ?? "v1";
          const newLine = { id: crypto.randomUUID(), text: "", agentId: defaultAgentId };
          const newLines = [...lines];
          const insertIndex = matched === "timeline.insertLineAbove" ? lineIndex : lineIndex + 1;
          newLines.splice(insertIndex, 0, newLine);
          useProjectStore.getState().setLinesWithHistory(newLines);
          break;
        }
        case "timeline.editWord": {
          const { selectedWords: eSel } = useTimelineStore.getState();
          if (eSel.length === 1) {
            e.preventDefault();
            useTimelineStore.getState().setEditingWord({
              lineId: eSel[0].lineId,
              wordIndex: eSel[0].wordIndex,
              type: eSel[0].type,
            });
          }
          break;
        }
        case "timeline.splitSyllable": {
          const { selectedWords: sSel } = useTimelineStore.getState();
          if (sSel.length === 1) {
            e.preventDefault();
            window.dispatchEvent(new CustomEvent("timeline:split-syllable"));
          }
          break;
        }
        case "timeline.splitWord": {
          const { selectedWords: swSel } = useTimelineStore.getState();
          if (swSel.length === 1) {
            e.preventDefault();
            window.dispatchEvent(new CustomEvent("timeline:split-word"));
          }
          break;
        }
        case "timeline.mergeWords": {
          const { selectedWords: mSel } = useTimelineStore.getState();
          const run = contiguousSelectionRun(mSel);
          if (!run) break;
          const mLine = lines.find((l) => l.id === run.lineId);
          if (!mLine) break;
          const mWords = run.type === "word" ? mLine.words : mLine.backgroundWords;
          if (!mWords) break;
          e.preventDefault();
          const firstIdx = run.indices[0];
          const lastIdx = run.indices[run.indices.length - 1];
          const mergedText = mergeWordText(run.indices.map((idx) => mWords[idx].text));
          const merged = { text: mergedText, begin: mWords[firstIdx].begin, end: mWords[lastIdx].end };
          const updatedWords = [...mWords.slice(0, firstIdx), merged, ...mWords.slice(lastIdx + 1)];
          if (run.type === "word") {
            void handleWordChangeWithDivergenceCheck(run.lineId, updatedWords, "words");
          } else {
            void handleWordChangeWithDivergenceCheck(
              run.lineId,
              updatedWords,
              "backgroundWords",
              manualBackgroundWordEdit(updatedWords),
            );
          }
          useTimelineStore.getState().clearSelection();
          break;
        }
        case "timeline.mergeSyllablesIntoWord": {
          const { selectedWords: mSel } = useTimelineStore.getState();
          if (mSel.length === 0) break;
          const first = mSel[0];
          if (!mSel.every((w) => w.lineId === first.lineId && w.type === first.type)) break;
          const field: "words" | "backgroundWords" = first.type === "word" ? "words" : "backgroundWords";
          e.preventDefault();
          useProjectStore.getState().mergeSyllableGroupIntoWord(
            first.lineId,
            field,
            mSel.map((s) => s.wordIndex),
          );
          break;
        }
        case "timeline.splitIntoWords": {
          const { selectedWords: wSel } = useTimelineStore.getState();
          if (wSel.length === 0) break;
          e.preventDefault();
          const lineIds = new Set(wSel.map((w) => w.lineId));
          splitLinesIntoWords(lineIds, lines);
          break;
        }
        case "timeline.expandAll": {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent("timeline:expand-all"));
          break;
        }
        case "timeline.createGroup": {
          e.preventDefault();
          const { selectedWords } = useTimelineStore.getState();
          const selectedLineIds = new Set(selectedWords.map((w) => w.lineId));
          if (selectedLineIds.size === 0) {
            toast.error("Select lines to group");
            break;
          }
          const projectState = useProjectStore.getState();
          const filled = fillSelectionGaps(projectState.lines, selectedLineIds);
          if (!filled) {
            toast.error("Some lines in this range are already part of a group");
            break;
          }
          const result = createGroupFromSelection(projectState.lines, filled.expanded, projectState.groups);
          if (!result) {
            toast.error("Could not create group from this selection");
            break;
          }
          projectState.addGroupWithLines(result.group, result.updatedLines);
          const totalCount = filled.expanded.size;
          const noun = totalCount === 1 ? "line" : "lines";
          toast.success(
            filled.addedCount > 0
              ? `Grouped ${totalCount} ${noun} (filled ${filled.addedCount} gap${filled.addedCount === 1 ? "" : "s"})`
              : `Grouped ${totalCount} ${noun}`,
          );
          break;
        }
        case "timeline.duplicateAsLinked": {
          e.preventDefault();
          const { selectedWords } = useTimelineStore.getState();
          const projectState = useProjectStore.getState();

          const linesById = new Map<string, LyricLine>();
          for (const l of projectState.lines) linesById.set(l.id, l);
          const groupKeys = new Set<string>();
          for (const w of selectedWords) {
            const line = linesById.get(w.lineId);
            if (line && isLinked(line)) {
              groupKeys.add(`${line.groupId}:${line.instanceIdx}`);
            }
          }
          if (groupKeys.size !== 1) {
            toast.error("Select all words of one linked instance to duplicate");
            break;
          }
          const [groupKey] = groupKeys;
          const [groupId, instanceIdxStr] = groupKey.split(":");
          const sourceInstanceIdx = Number.parseInt(instanceIdxStr, 10);

          const audioEl = useAudioStore.getState().audioElement;
          const playheadTime = audioEl?.currentTime ?? useAudioStore.getState().currentTime;
          const template = instanceToTemplate(projectState.lines, groupId, sourceInstanceIdx);
          if (template.length === 0) {
            toast.error("Could not derive instance template");
            break;
          }
          const placement = decideAddInstancePlacement({
            lines: projectState.lines,
            groupId,
            template,
            playheadTime,
          });
          if (placement.kind === "fill") {
            projectState.setLinesWithHistory(placement.updatedLines);
            toast.success("Linked instance placed in empty rows");
          } else if (placement.kind === "insert") {
            projectState.addInstance(groupId, template, placement.instanceStart, placement.insertAtIndex);
            toast.success("Linked instance added at playhead");
          } else {
            copyInstanceToClipboardAndPreview(projectState.lines, groupId, sourceInstanceIdx);
            toast(`No room at the playhead. ${MOD_KEY}+V to paste somewhere clear.`);
          }
          break;
        }
        case "timeline.toggleCollapseInstance": {
          const inst = currentInstanceFromSelection(
            useProjectStore.getState().lines,
            useTimelineStore.getState().selectedWords,
          );
          if (!inst) {
            toast.error("Select words inside one instance first");
            break;
          }
          e.preventDefault();
          useTimelineStore.getState().toggleInstanceCollapsed(`${inst.groupId}:${inst.instanceIdx}`);
          break;
        }
        case "timeline.toggleAllCollapsed": {
          e.preventDefault();
          const { collapsedInstances, setInstanceCollapsed } = useTimelineStore.getState();
          const projectLines = useProjectStore.getState().lines;
          const keys = new Set<string>();
          for (const line of projectLines) {
            if (isLinked(line)) {
              keys.add(`${line.groupId}:${line.instanceIdx}`);
            }
          }
          if (keys.size === 0) {
            toast.error("No groups in this project");
            break;
          }
          const anyExpanded = [...keys].some((k) => !collapsedInstances[k]);
          for (const k of keys) setInstanceCollapsed(k, anyExpanded);
          break;
        }
        case "timeline.jumpPrevInstance":
        case "timeline.jumpNextInstance": {
          const projectLines = useProjectStore.getState().lines;
          const inst = currentInstanceFromSelection(projectLines, useTimelineStore.getState().selectedWords);
          if (!inst) {
            toast.error("Select words inside one instance first");
            break;
          }
          const all = listInstancesOfGroup(projectLines, inst.groupId);
          if (all.length < 2) {
            toast.error("This group has only one instance");
            break;
          }
          const here = all.indexOf(inst.instanceIdx);
          const dir = matched === "timeline.jumpNextInstance" ? 1 : -1;
          const nextIdx = all[(here + dir + all.length) % all.length];
          e.preventDefault();
          useTimelineStore.getState().setSelectedWords(getWordsInInstance(projectLines, inst.groupId, nextIdx));
          scrollToInstanceHeader(inst.groupId, nextIdx);
          break;
        }
        case "timeline.detachInstance": {
          const inst = currentInstanceFromSelection(
            useProjectStore.getState().lines,
            useTimelineStore.getState().selectedWords,
          );
          if (!inst) {
            toast.error("Select words inside one instance first");
            break;
          }
          e.preventDefault();
          useProjectStore.getState().removeInstance(inst.groupId, inst.instanceIdx);
          showGroupActionToast("Instance detached");
          break;
        }
        case "timeline.deleteGroup": {
          const projectLines = useProjectStore.getState().lines;
          const inst = currentInstanceFromSelection(projectLines, useTimelineStore.getState().selectedWords);
          if (!inst) {
            toast.error("Select words inside one instance first");
            break;
          }
          const group = useProjectStore.getState().groups.find((g) => g.id === inst.groupId);
          if (!group) break;
          e.preventDefault();
          const instanceCount = listInstancesOfGroup(projectLines, inst.groupId).length;
          void deleteGroupWithConfirm({ groupId: inst.groupId, groupLabel: group.label, instanceCount });
          break;
        }
        case "timeline.pingSiblings": {
          const inst = currentInstanceFromSelection(
            useProjectStore.getState().lines,
            useTimelineStore.getState().selectedWords,
          );
          if (!inst) {
            toast.error("Select words inside one instance first");
            break;
          }
          e.preventDefault();
          useTimelineStore.getState().setPingingGroupId(inst.groupId);
          window.setTimeout(() => {
            if (useTimelineStore.getState().pingingGroupId === inst.groupId) {
              useTimelineStore.getState().setPingingGroupId(null);
            }
          }, 700);
          break;
        }
        case "timeline.nudgeLeft":
        case "timeline.nudgeRight": {
          const { selectedWords: nudgeSel } = useTimelineStore.getState();
          if (nudgeSel.length === 0) break;
          e.preventDefault();
          const nudgeAmount = useSettingsStore.getState().nudgeAmount;
          const requestedDelta = matched === "timeline.nudgeLeft" ? -nudgeAmount : nudgeAmount;
          const rawLines = useProjectStore.getState().lines;
          const partitioned = partitionNudgeSelections(rawLines, nudgeSel);
          const result = shiftSelectionsTogether(rawLines, partitioned, requestedDelta, duration);
          if (result.updates.length === 0) break;
          if (result.updates.length === 1) {
            useProjectStore.getState().updateLineWithHistory(result.updates[0].id, result.updates[0].updates, {
              propagateToSiblings: false,
            });
          } else {
            useProjectStore.getState().updateLinesWithHistory(result.updates, { propagateToSiblings: false });
          }
          break;
        }
        case "timeline.jumpToInstanceStart": {
          const projectLines = useProjectStore.getState().lines;
          const inst = currentInstanceFromSelection(projectLines, useTimelineStore.getState().selectedWords);
          if (!inst) {
            toast.error("Select words inside one instance first");
            break;
          }
          e.preventDefault();
          scrollToInstanceHeader(inst.groupId, inst.instanceIdx);
          break;
        }
        case "timeline.toggleExplicit": {
          const { selectedWords: explicitSel } = useTimelineStore.getState();
          if (explicitSel.length === 0) break;
          e.preventDefault();
          const { targets, value } = resolveExplicitSelectionToggle(useProjectStore.getState().lines, explicitSel);
          if (targets.length === 0) break;
          useProjectStore.getState().markWordsExplicit(targets, value);
          break;
        }
        case "timeline.shiftInstanceToPlayhead": {
          const projectLines = useProjectStore.getState().lines;
          const inst = currentInstanceFromSelection(projectLines, useTimelineStore.getState().selectedWords);
          if (!inst) {
            toast.error("Select words inside one instance first");
            break;
          }
          const instanceLines = linesOfInstance(projectLines, inst.groupId, inst.instanceIdx);
          const bounds = instanceBounds(instanceLines);
          if (!bounds) break;
          const audioEl = useAudioStore.getState().audioElement;
          const playheadTime = audioEl?.currentTime ?? useAudioStore.getState().currentTime;
          const delta = playheadTime - bounds.begin;
          if (Math.abs(delta) < 0.001) break;
          e.preventDefault();
          useProjectStore.getState().shiftInstance(inst.groupId, inst.instanceIdx, delta);
          break;
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSetWordTiming, handleCopy, handleCut, handlePaste, handleDelete, onOpenLyricsModal, lines]);
}

// -- Exports -------------------------------------------------------------------

export { useTimelineKeyboard };
