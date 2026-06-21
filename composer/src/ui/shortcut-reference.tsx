import { getEffectiveKeysArray } from "@/stores/shortcut-bindings";
import { isMac } from "@/utils/platform";
import { IconCommand } from "@tabler/icons-react";

// -- Types --------------------------------------------------------------------

interface ShortcutItemProps {
  keys: string[];
  description: string;
  shortcutId?: string;
}

interface ShortcutSectionProps {
  title: string;
  shortcuts: ShortcutItemProps[];
}

// -- Helpers ------------------------------------------------------------------

function formatKey(key: string): string {
  if (key === "Mod") return isMac ? "⌘" : "Ctrl";
  if (key === "Meta") return isMac ? "⌘" : "Meta";
  if (key === "Ctrl") return isMac ? "⌃" : "Ctrl";
  if (key === "Shift") return "⇧";
  if (key === "Alt") return isMac ? "⌥" : "Alt";
  if (key === "Space") return "Space";
  if (key === "Enter") return "↵";
  if (key === "ArrowLeft") return "←";
  if (key === "ArrowRight") return "→";
  if (key === "ArrowUp") return "↑";
  if (key === "ArrowDown") return "↓";
  return key;
}

// -- Data ---------------------------------------------------------------------

const SHORTCUT_SECTIONS: ShortcutSectionProps[] = [
  {
    title: "General",
    shortcuts: [
      { keys: ["Shift", "?"], description: "Show keyboard shortcuts", shortcutId: "global.help" },
      { keys: ["Enter"], description: "Play / Pause audio", shortcutId: "global.playPause" },
      { keys: ["Mod", "Shift", "Alt", "E"], description: "Download saved work", shortcutId: "global.panicRecovery" },
    ],
  },
  {
    title: "Navigation",
    shortcuts: [
      { keys: ["Mod", "1"], description: "Go to Import tab" },
      { keys: ["Mod", "2"], description: "Go to Edit tab" },
      { keys: ["Mod", "3"], description: "Go to Sync tab" },
      { keys: ["Mod", "4"], description: "Go to Timeline tab" },
      { keys: ["Mod", "5"], description: "Go to Preview tab" },
      { keys: ["Mod", "6"], description: "Go to Export tab" },
    ],
  },
  {
    title: "Sync Mode",
    shortcuts: [
      { keys: ["Space"], description: "Start sync / Tap to sync word", shortcutId: "sync.tap" },
      { keys: ["F"], description: "Hold to sync word (hold mode)", shortcutId: "sync.holdSync" },
      { keys: ["ArrowLeft"], description: "Nudge last synced -50ms", shortcutId: "sync.nudgeLeft" },
      { keys: ["ArrowRight"], description: "Nudge last synced +50ms", shortcutId: "sync.nudgeRight" },
      { keys: ["Mod", "Z"], description: "Undo" },
      { keys: ["Mod", "Shift", "Z"], description: "Redo" },
    ],
  },
  {
    title: "Timeline Mode",
    shortcuts: [
      { keys: ["F"], description: "Toggle follow playhead", shortcutId: "timeline.toggleFollow" },
      { keys: ["P"], description: "Toggle preview sidebar", shortcutId: "timeline.togglePreview" },
      { keys: ["R"], description: "Toggle rolling edit", shortcutId: "timeline.toggleRollingEdit" },
      { keys: ["T"], description: "Toggle snap (magnet)", shortcutId: "timeline.toggleSnap" },
      { keys: ["N"], description: "Insert line below selected word", shortcutId: "timeline.insertLineBelow" },
      { keys: ["Shift", "N"], description: "Insert line above selected word", shortcutId: "timeline.insertLineAbove" },
      { keys: ["X"], description: "Expand all lines", shortcutId: "timeline.expandAll" },
      { keys: ["Space"], description: "Jump viewport to playhead", shortcutId: "timeline.jumpToPlayhead" },
      { keys: ["Escape"], description: "Deselect / cancel paste" },
      { keys: ["["], description: "Set word begin to playhead", shortcutId: "timeline.setWordBegin" },
      { keys: ["]"], description: "Set word end to playhead", shortcutId: "timeline.setWordEnd" },
      { keys: ["Mod", "Z"], description: "Undo" },
      { keys: ["Mod", "Shift", "Z"], description: "Redo" },
      { keys: ["Mod", "Shift", "V"], description: "Import lyrics", shortcutId: "timeline.importLyrics" },
      { keys: ["Mod", "Scroll"], description: "Zoom in / out" },
      { keys: ["Middle", "Drag"], description: "Pan timeline" },
      { keys: ["Shift", "Middle", "Drag"], description: "Pan locked to axis" },
    ],
  },
  {
    title: "Timeline Selection",
    shortcuts: [
      { keys: ["Click"], description: "Select word" },
      { keys: ["Shift", "Click"], description: "Select all syllables in word" },
      { keys: ["Mod", "A"], description: "Select all words" },
      { keys: ["A"], description: "Select word under playhead", shortcutId: "timeline.selectWordAtPlayhead" },
      { keys: ["Mod", "Click"], description: "Toggle word in selection" },
      { keys: ["Drag"], description: "Marquee select words" },
      { keys: ["Shift", "Drag"], description: "Add to selection with marquee" },
      { keys: ["Mod", "C"], description: "Copy selected words" },
      { keys: ["Mod", "X"], description: "Cut selected words" },
      { keys: ["Mod", "V"], description: "Paste (ghost preview, click to place)" },
      { keys: ["Delete"], description: "Delete selected words" },
      { keys: ["Alt", "Drag"], description: "Duplicate selected words" },
      { keys: ["E"], description: "Edit selected word text", shortcutId: "timeline.editWord" },
      { keys: ["F2"], description: "Edit selected word text" },
      { keys: ["S"], description: "Split selected word into syllables", shortcutId: "timeline.splitSyllable" },
      { keys: ["Shift", "S"], description: "Split word into words", shortcutId: "timeline.splitWord" },
      { keys: ["M"], description: "Merge adjacent selected words", shortcutId: "timeline.mergeWords" },
      { keys: ["Y"], description: "Merge syllables into one word", shortcutId: "timeline.mergeSyllablesIntoWord" },
      { keys: ["W"], description: "Split line into words", shortcutId: "timeline.splitIntoWords" },
      { keys: ["Shift", "E"], description: "Mark / unmark explicit", shortcutId: "timeline.toggleExplicit" },
      { keys: ["ArrowLeft"], description: "Nudge selected words left", shortcutId: "timeline.nudgeLeft" },
      { keys: ["ArrowRight"], description: "Nudge selected words right", shortcutId: "timeline.nudgeRight" },
      { keys: ["Double Click"], description: "Edit word / create word" },
    ],
  },
  {
    title: "Linked Groups",
    shortcuts: [
      { keys: ["Mod", "G"], description: "Group selected lines", shortcutId: "timeline.createGroup" },
      { keys: ["Mod", "D"], description: "Duplicate as linked instance", shortcutId: "timeline.duplicateAsLinked" },
      { keys: ["C"], description: "Collapse / expand current instance", shortcutId: "timeline.toggleCollapseInstance" },
      { keys: ["Shift", "C"], description: "Collapse / expand all", shortcutId: "timeline.toggleAllCollapsed" },
      { keys: ["Mod", "J"], description: "Jump to previous instance", shortcutId: "timeline.jumpPrevInstance" },
      { keys: ["Mod", "K"], description: "Jump to next instance", shortcutId: "timeline.jumpNextInstance" },
      { keys: ["H"], description: "Ping sibling instances", shortcutId: "timeline.pingSiblings" },
      {
        keys: ["Shift", "P"],
        description: "Shift current instance to playhead",
        shortcutId: "timeline.shiftInstanceToPlayhead",
      },
      {
        keys: ["Shift", "J"],
        description: "Jump to start of current instance",
        shortcutId: "timeline.jumpToInstanceStart",
      },
      { keys: ["ArrowLeft"], description: "Nudge selected words / instance earlier" },
      { keys: ["ArrowRight"], description: "Nudge selected words / instance later" },
      { keys: ["Mod", "Shift", "D"], description: "Detach current instance", shortcutId: "timeline.detachInstance" },
      { keys: ["Mod", "Shift", "G"], description: "Delete current group", shortcutId: "timeline.deleteGroup" },
    ],
  },
  {
    title: "Edit Mode",
    shortcuts: [
      { keys: ["Click"], description: "Select / deselect line" },
      { keys: ["Shift", "Click"], description: "Select range of lines" },
      { keys: ["Drag"], description: "Drag on line numbers to select a range" },
    ],
  },
];

// -- Components ---------------------------------------------------------------

const KeyBadge: React.FC<{ keyName: string }> = ({ keyName }) => {
  const formatted = formatKey(keyName);
  const isSymbol = formatted.length === 1 && !/[a-zA-Z0-9]/.test(formatted);

  return (
    <span
      className={`inline-flex items-center justify-center min-w-6 h-6 px-1.5 text-xs font-medium rounded bg-composer-button border border-composer-border ${
        isSymbol ? "text-base" : ""
      }`}
    >
      {(keyName === "Mod" || keyName === "Meta") && isMac ? <IconCommand className="size-3.5" /> : formatted}
    </span>
  );
};

const ShortcutItem: React.FC<ShortcutItemProps> = ({ keys, description, shortcutId }) => {
  const resolvedKeys = shortcutId ? getEffectiveKeysArray(shortcutId) : keys;
  return (
    <div className="flex items-center justify-between py-1.5">
      <span className="text-sm text-composer-text-secondary">{description}</span>
      <div className="flex items-center gap-1">
        {resolvedKeys.map((key) => (
          <KeyBadge key={key} keyName={key} />
        ))}
      </div>
    </div>
  );
};

const ShortcutSection: React.FC<ShortcutSectionProps> = ({ title, shortcuts }) => (
  <div>
    <h3 className="mb-2 text-xs font-medium tracking-wide text-composer-text-muted">{title}</h3>
    <div className="flex flex-col">
      {shortcuts.map((shortcut) => (
        <ShortcutItem key={shortcut.shortcutId ?? shortcut.description} {...shortcut} />
      ))}
    </div>
  </div>
);

// -- Exports ------------------------------------------------------------------

export { formatKey, KeyBadge, ShortcutSection, SHORTCUT_SECTIONS };
