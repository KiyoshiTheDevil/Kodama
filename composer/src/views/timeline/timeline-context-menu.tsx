import { useProjectStore } from "@/stores/project";
import { getAgentColor } from "@/domain/agent/colors";
import { getEffectiveKeysArray } from "@/stores/shortcut-bindings";
import { formatKey } from "@/ui/shortcut-reference";
import { GROUP_COLORS } from "@/utils/group-colors";
import { isMac } from "@/utils/platform";
import { useContextMenuTargets } from "@/views/timeline/use-context-menu-targets";
import { useGroupMenuActions } from "@/views/timeline/use-group-menu-actions";
import { useInstanceMenuActions } from "@/views/timeline/use-instance-menu-actions";
import { useLineMenuActions } from "@/views/timeline/use-line-menu-actions";
import { useTimelineStore } from "@/views/timeline/timeline-store";
import { useWordMenuActions } from "@/views/timeline/use-word-menu-actions";
import { IconCommand } from "@tabler/icons-react";
import { flip, FloatingPortal, shift, useFloating } from "@floating-ui/react";
import { useEffect, useLayoutEffect } from "react";

function MenuItem({
  label,
  onClick,
  danger,
  shortcut,
}: { label: string; onClick: () => void; danger?: boolean; shortcut?: string[] }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full flex items-center justify-between gap-4 px-3 py-1.5 text-sm cursor-pointer rounded-md transition-colors ${
        danger ? "text-composer-error hover:bg-composer-error/10" : "text-composer-text hover:bg-composer-button"
      }`}
    >
      <span>{label}</span>
      {shortcut && (
        <span className="inline-flex items-center gap-0.5">
          {shortcut.map((key) => (
            <span
              key={key}
              className="inline-flex items-center justify-center min-w-4 h-4 px-1 text-[10px] font-medium rounded bg-white/10 text-composer-text-muted leading-none shadow-[0_2px_0_0_rgba(0,0,0,0.3)]"
            >
              {key === "Mod" && isMac ? <IconCommand className="size-2.5" /> : formatKey(key)}
            </span>
          ))}
        </span>
      )}
    </button>
  );
}

function MenuDivider() {
  return <div className="my-1 border-t border-composer-border" />;
}

// -- Component ----------------------------------------------------------------

const TimelineContextMenu: React.FC = () => {
  const contextMenu = useTimelineStore((s) => s.contextMenu);
  const clearContextMenu = useTimelineStore((s) => s.clearContextMenu);

  const { refs, floatingStyles } = useFloating({
    placement: "bottom-start",
    middleware: [flip({ fallbackPlacements: ["top-start", "bottom-end", "top-end"] }), shift({ padding: 8 })],
  });

  const agents = useProjectStore((s) => s.agents);

  const targets = useContextMenuTargets();
  const {
    lines,
    explicitToggleContext,
    gutterLineGroupInfo,
    groupableSelection,
    mergeInfo,
    groupedWordInfo,
    snapNeededInfo,
    placeLineHereInfo,
    splitIntoWordsInfo,
  } = targets;

  const {
    handleEditWord,
    handleSplitSyllables,
    handleSplitWord,
    handleToggleExplicit,
    handleDeleteWord,
    handleAddWordHere,
    handleMergeSyllables,
    handleSnapSyllables,
    handleMergeWords,
  } = useWordMenuActions(targets, clearContextMenu);

  const {
    handlePlaceLineHere,
    handleAddLine,
    handleDeleteLine,
    handleDetachLine,
    handleAssignAgent,
    handleSplitIntoWords,
  } = useLineMenuActions(targets, clearContextMenu);

  const {
    handleJumpToGroupFromBanner,
    handleCreateGroupFromSelection,
    handleDeleteGroup,
    handleRenameStart,
    handleRecolorGroup,
  } = useGroupMenuActions(targets, clearContextMenu);

  const {
    handleDetachInstance,
    handleToggleCollapse,
    handleAddInstanceAtPlayhead,
    handleShiftToPlayhead,
    handlePingSiblings,
    handleJumpPrevInstance,
    handleJumpNextInstance,
  } = useInstanceMenuActions(clearContextMenu);

  useLayoutEffect(() => {
    if (!contextMenu) return;
    const { x, y } = contextMenu;
    refs.setPositionReference({
      getBoundingClientRect: () => ({
        width: 0,
        height: 0,
        x,
        y,
        top: y,
        left: x,
        right: x,
        bottom: y,
      }),
    });
  }, [contextMenu, refs]);

  useEffect(() => {
    if (!contextMenu) return;
    const handleClick = (e: MouseEvent) => {
      const el = refs.floating.current;
      if (el && !el.contains(e.target as Node)) {
        clearContextMenu();
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") clearContextMenu();
    };
    window.addEventListener("mousedown", handleClick);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", handleClick);
      window.removeEventListener("keydown", handleKey);
    };
  }, [contextMenu, clearContextMenu, refs.floating]);

  if (!contextMenu) return null;

  const { target } = contextMenu;

  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        className="z-100 min-w-36 p-1 border shadow-2xl rounded-lg bg-composer-bg border-composer-border select-none"
        style={floatingStyles}
      >
        {target.kind === "word" && (
          <>
            <MenuItem
              label="Edit text"
              shortcut={getEffectiveKeysArray("timeline.editWord")}
              onClick={handleEditWord}
            />
            <MenuItem
              label="Split syllables"
              shortcut={getEffectiveKeysArray("timeline.splitSyllable")}
              onClick={handleSplitSyllables}
            />
            <MenuItem
              label="Split word"
              shortcut={getEffectiveKeysArray("timeline.splitWord")}
              onClick={handleSplitWord}
            />
            {mergeInfo && (
              <MenuItem
                label="Merge words"
                shortcut={getEffectiveKeysArray("timeline.mergeWords")}
                onClick={handleMergeWords}
              />
            )}
            {groupedWordInfo && (
              <MenuItem
                label="Merge syllables"
                shortcut={getEffectiveKeysArray("timeline.mergeSyllablesIntoWord")}
                onClick={handleMergeSyllables}
              />
            )}
            {snapNeededInfo && <MenuItem label="Snap syllables flush" onClick={handleSnapSyllables} />}
            {splitIntoWordsInfo && (
              <>
                <MenuDivider />
                <MenuItem
                  label={
                    splitIntoWordsInfo.count > 1
                      ? `Split ${splitIntoWordsInfo.count} lines into words`
                      : "Split into words"
                  }
                  shortcut={getEffectiveKeysArray("timeline.splitIntoWords")}
                  onClick={handleSplitIntoWords}
                />
              </>
            )}
            {groupableSelection && (
              <>
                <MenuDivider />
                <MenuItem
                  label={
                    groupableSelection.count > 1
                      ? `Group ${groupableSelection.count} lines${groupableSelection.addedFromGaps > 0 ? ` (incl. ${groupableSelection.addedFromGaps} gap)` : ""}`
                      : "Group this line"
                  }
                  shortcut={getEffectiveKeysArray("timeline.createGroup")}
                  onClick={handleCreateGroupFromSelection}
                />
              </>
            )}
            {explicitToggleContext && (
              <>
                <MenuDivider />
                <MenuItem
                  label={
                    explicitToggleContext.allMarked
                      ? explicitToggleContext.indices.length > 1
                        ? `Unmark ${explicitToggleContext.indices.length} as explicit`
                        : "Unmark explicit"
                      : explicitToggleContext.indices.length > 1
                        ? `Mark ${explicitToggleContext.indices.length} as explicit`
                        : "Mark as explicit"
                  }
                  shortcut={getEffectiveKeysArray("timeline.toggleExplicit")}
                  onClick={handleToggleExplicit}
                />
              </>
            )}
            <MenuDivider />
            <MenuItem
              label={groupedWordInfo ? "Delete syllable" : "Delete word"}
              shortcut={["Del"]}
              onClick={handleDeleteWord}
              danger
            />
          </>
        )}

        {target.kind === "track" && (
          <>
            <MenuItem label="Add word here" shortcut={["Double Click"]} onClick={handleAddWordHere} />
            {placeLineHereInfo && <MenuItem label="Place line here" onClick={handlePlaceLineHere} />}
            {groupableSelection && (
              <>
                <MenuDivider />
                <MenuItem
                  label={
                    groupableSelection.count > 1
                      ? `Group ${groupableSelection.count} lines${groupableSelection.addedFromGaps > 0 ? ` (incl. ${groupableSelection.addedFromGaps} gap)` : ""}`
                      : "Group this line"
                  }
                  shortcut={getEffectiveKeysArray("timeline.createGroup")}
                  onClick={handleCreateGroupFromSelection}
                />
              </>
            )}
          </>
        )}

        {target.kind === "gutter" && (
          <>
            <MenuItem label="Add line above" shortcut={["Shift", "N"]} onClick={() => handleAddLine("above")} />
            <MenuItem label="Add line below" shortcut={["N"]} onClick={() => handleAddLine("below")} />
            {groupableSelection && (
              <>
                <MenuDivider />
                <MenuItem
                  label={
                    groupableSelection.count > 1
                      ? `Group ${groupableSelection.count} lines${groupableSelection.addedFromGaps > 0 ? ` (incl. ${groupableSelection.addedFromGaps} gap)` : ""}`
                      : "Group this line"
                  }
                  shortcut={getEffectiveKeysArray("timeline.createGroup")}
                  onClick={handleCreateGroupFromSelection}
                />
              </>
            )}
            <MenuDivider />
            {agents.length > 1 && (
              <>
                <p className="px-3 py-1 text-xs text-composer-text-muted">Assign agent</p>
                <div className="flex flex-col gap-px">
                  {agents.map((agent) => {
                    const color = getAgentColor(agent.id);
                    const line = lines[target.lineIndex];
                    const isActive = line?.agentId === agent.id;
                    return (
                      <button
                        key={agent.id}
                        type="button"
                        onClick={() => handleAssignAgent(agent.id)}
                        className={`w-full text-left px-2 py-1 text-sm cursor-pointer rounded-md flex items-center gap-2 transition-colors ${
                          isActive
                            ? "bg-composer-accent/15 text-composer-text"
                            : "text-composer-text hover:bg-composer-button"
                        }`}
                      >
                        <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                        {agent.name || agent.id}
                      </button>
                    );
                  })}
                </div>
                <MenuDivider />
              </>
            )}
            {gutterLineGroupInfo && (
              <>
                <MenuItem label="Detach this line" onClick={handleDetachLine} />
                <MenuDivider />
              </>
            )}
            <MenuItem label="Delete line" onClick={handleDeleteLine} danger />
          </>
        )}

        {target.kind === "group-banner" && (
          <>
            <MenuItem
              label={
                useTimelineStore.getState().collapsedInstances[`${target.groupId}:${target.instanceIdx}`]
                  ? "Expand instance"
                  : "Collapse instance"
              }
              shortcut={getEffectiveKeysArray("timeline.toggleCollapseInstance")}
              onClick={handleToggleCollapse}
            />
            <MenuItem
              label={target.source === "gutter" ? "Jump to group" : "Jump to start"}
              shortcut={getEffectiveKeysArray("timeline.jumpToInstanceStart")}
              onClick={handleJumpToGroupFromBanner}
            />
            <MenuItem
              label="Ping siblings"
              shortcut={getEffectiveKeysArray("timeline.pingSiblings")}
              onClick={handlePingSiblings}
            />
            <MenuDivider />
            <MenuItem
              label="Add instance at playhead"
              shortcut={getEffectiveKeysArray("timeline.duplicateAsLinked")}
              onClick={handleAddInstanceAtPlayhead}
            />
            <MenuItem
              label="Shift instance to playhead"
              shortcut={getEffectiveKeysArray("timeline.shiftInstanceToPlayhead")}
              onClick={handleShiftToPlayhead}
            />
            <MenuItem
              label="Jump to previous instance"
              shortcut={getEffectiveKeysArray("timeline.jumpPrevInstance")}
              onClick={handleJumpPrevInstance}
            />
            <MenuItem
              label="Jump to next instance"
              shortcut={getEffectiveKeysArray("timeline.jumpNextInstance")}
              onClick={handleJumpNextInstance}
            />
            <MenuDivider />
            <MenuItem label="Rename" shortcut={["Double Click"]} onClick={handleRenameStart} />
            <MenuDivider />
            <p className="px-3 pt-1.5 pb-1 text-xs text-composer-text-muted">Recolor</p>
            <div className="px-3 pb-1.5 grid grid-cols-5 gap-1.5">
              {GROUP_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={`Color ${c}`}
                  onClick={() => handleRecolorGroup(c)}
                  className="size-6 rounded-md cursor-pointer border border-white/10 hover:ring-2 hover:ring-white/40 transition-[box-shadow]"
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
            <MenuDivider />
            <MenuItem
              label="Detach instance"
              shortcut={getEffectiveKeysArray("timeline.detachInstance")}
              onClick={handleDetachInstance}
            />
            <MenuItem
              label="Delete group"
              shortcut={getEffectiveKeysArray("timeline.deleteGroup")}
              onClick={handleDeleteGroup}
              danger
            />
          </>
        )}
      </div>
    </FloatingPortal>
  );
};

// -- Exports ------------------------------------------------------------------

export { TimelineContextMenu };
