// -- Types --------------------------------------------------------------------

interface ShortcutBinding {
  key: string;
  shift?: boolean;
  alt?: boolean;
  ctrl?: boolean;
  meta?: boolean;
  mod?: boolean;
}

type ShortcutScope = "global" | "sync" | "timeline";

interface ShortcutDefinition {
  id: string;
  scope: ShortcutScope;
  description: string;
  defaultBinding: ShortcutBinding;
}

// -- Registry -----------------------------------------------------------------

const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  {
    id: "global.playPause",
    scope: "global",
    description: "Play / Pause",
    defaultBinding: { key: "Enter" },
  },
  {
    id: "global.help",
    scope: "global",
    description: "Show help",
    defaultBinding: { key: "?", shift: true },
  },
  {
    id: "global.settings",
    scope: "global",
    description: "Open settings",
    defaultBinding: { key: "," },
  },
  {
    id: "global.panicRecovery",
    scope: "global",
    description: "Download saved work (panic shortcut)",
    defaultBinding: { key: "e", mod: true, shift: true, alt: true },
  },
  {
    id: "global.goToImport",
    scope: "global",
    description: "Go to Import",
    defaultBinding: { key: "1", mod: true },
  },
  {
    id: "global.goToEdit",
    scope: "global",
    description: "Go to Edit",
    defaultBinding: { key: "2", mod: true },
  },
  {
    id: "global.goToSync",
    scope: "global",
    description: "Go to Sync",
    defaultBinding: { key: "3", mod: true },
  },
  {
    id: "global.goToTimeline",
    scope: "global",
    description: "Go to Timeline",
    defaultBinding: { key: "4", mod: true },
  },
  {
    id: "global.goToPreview",
    scope: "global",
    description: "Go to Preview",
    defaultBinding: { key: "5", mod: true },
  },
  {
    id: "global.goToExport",
    scope: "global",
    description: "Go to Export",
    defaultBinding: { key: "6", mod: true },
  },
  {
    id: "sync.tap",
    scope: "sync",
    description: "Tap to sync",
    defaultBinding: { key: " " },
  },
  {
    id: "sync.holdSync",
    scope: "sync",
    description: "Hold to sync",
    defaultBinding: { key: "f" },
  },
  {
    id: "sync.nudgeLeft",
    scope: "sync",
    description: "Nudge left",
    defaultBinding: { key: "ArrowLeft" },
  },
  {
    id: "sync.nudgeRight",
    scope: "sync",
    description: "Nudge right",
    defaultBinding: { key: "ArrowRight" },
  },
  {
    id: "timeline.toggleFollow",
    scope: "timeline",
    description: "Toggle follow",
    defaultBinding: { key: "f" },
  },
  {
    id: "timeline.togglePreview",
    scope: "timeline",
    description: "Toggle preview",
    defaultBinding: { key: "p" },
  },
  {
    id: "timeline.insertLineBelow",
    scope: "timeline",
    description: "Insert line below",
    defaultBinding: { key: "n" },
  },
  {
    id: "timeline.insertLineAbove",
    scope: "timeline",
    description: "Insert line above",
    defaultBinding: { key: "n", shift: true },
  },
  {
    id: "timeline.jumpToPlayhead",
    scope: "timeline",
    description: "Jump to playhead",
    defaultBinding: { key: " " },
  },
  {
    id: "timeline.selectWordAtPlayhead",
    scope: "timeline",
    description: "Select word under playhead",
    defaultBinding: { key: "a" },
  },
  {
    id: "timeline.setWordBegin",
    scope: "timeline",
    description: "Set word begin",
    defaultBinding: { key: "[" },
  },
  {
    id: "timeline.setWordEnd",
    scope: "timeline",
    description: "Set word end",
    defaultBinding: { key: "]" },
  },
  {
    id: "timeline.editWord",
    scope: "timeline",
    description: "Edit word",
    defaultBinding: { key: "e" },
  },
  {
    id: "timeline.splitSyllable",
    scope: "timeline",
    description: "Split syllable",
    defaultBinding: { key: "s" },
  },
  {
    id: "timeline.splitWord",
    scope: "timeline",
    description: "Split word into words",
    defaultBinding: { key: "s", shift: true },
  },
  {
    id: "timeline.mergeWords",
    scope: "timeline",
    description: "Merge words",
    defaultBinding: { key: "m" },
  },
  {
    id: "timeline.mergeSyllablesIntoWord",
    scope: "timeline",
    description: "Merge syllables back into one word",
    defaultBinding: { key: "y" },
  },
  {
    id: "timeline.splitIntoWords",
    scope: "timeline",
    description: "Split line into words",
    defaultBinding: { key: "w" },
  },
  {
    id: "timeline.expandAll",
    scope: "timeline",
    description: "Expand all lines",
    defaultBinding: { key: "x" },
  },
  {
    id: "timeline.importLyrics",
    scope: "timeline",
    description: "Import lyrics",
    defaultBinding: { key: "v", mod: true, shift: true },
  },
  {
    id: "timeline.createGroup",
    scope: "timeline",
    description: "Group selected lines",
    defaultBinding: { key: "g", mod: true },
  },
  {
    id: "timeline.duplicateAsLinked",
    scope: "timeline",
    description: "Duplicate as linked instance",
    defaultBinding: { key: "d", mod: true },
  },
  {
    id: "timeline.toggleCollapseInstance",
    scope: "timeline",
    description: "Collapse / expand current instance",
    defaultBinding: { key: "c" },
  },
  {
    id: "timeline.toggleAllCollapsed",
    scope: "timeline",
    description: "Collapse / expand all instances",
    defaultBinding: { key: "c", shift: true },
  },
  {
    id: "timeline.jumpPrevInstance",
    scope: "timeline",
    description: "Jump to previous instance of group",
    defaultBinding: { key: "j", mod: true },
  },
  {
    id: "timeline.jumpNextInstance",
    scope: "timeline",
    description: "Jump to next instance of group",
    defaultBinding: { key: "k", mod: true },
  },
  {
    id: "timeline.detachInstance",
    scope: "timeline",
    description: "Detach current instance from group",
    defaultBinding: { key: "d", mod: true, shift: true },
  },
  {
    id: "timeline.deleteGroup",
    scope: "timeline",
    description: "Delete current group",
    defaultBinding: { key: "g", mod: true, shift: true },
  },
  {
    id: "timeline.pingSiblings",
    scope: "timeline",
    description: "Ping sibling instances",
    defaultBinding: { key: "h" },
  },
  {
    id: "timeline.shiftInstanceToPlayhead",
    scope: "timeline",
    description: "Shift current instance to playhead",
    defaultBinding: { key: "p", shift: true },
  },
  {
    id: "timeline.jumpToInstanceStart",
    scope: "timeline",
    description: "Jump to start of current instance",
    defaultBinding: { key: "j", shift: true },
  },
  {
    id: "timeline.nudgeLeft",
    scope: "timeline",
    description: "Nudge selected words left",
    defaultBinding: { key: "ArrowLeft" },
  },
  {
    id: "timeline.nudgeRight",
    scope: "timeline",
    description: "Nudge selected words right",
    defaultBinding: { key: "ArrowRight" },
  },
  {
    id: "timeline.toggleExplicit",
    scope: "timeline",
    description: "Toggle explicit on selected word(s)",
    defaultBinding: { key: "e", shift: true },
  },
  {
    id: "timeline.toggleSnap",
    scope: "timeline",
    description: "Toggle snap (magnet)",
    defaultBinding: { key: "t" },
  },
  {
    id: "timeline.toggleRollingEdit",
    scope: "timeline",
    description: "Toggle rolling edit tool",
    defaultBinding: { key: "r" },
  },
];

// -- Exports ------------------------------------------------------------------

export { SHORTCUT_DEFINITIONS };
export type { ShortcutBinding, ShortcutScope, ShortcutDefinition };
