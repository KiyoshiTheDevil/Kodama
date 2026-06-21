import type { Agent } from "@/domain/agent/model";
import type { LineTemplate, LinkGroup } from "@/domain/group/template";
import type { LyricLine } from "@/domain/line/model";
import type { ProjectMetadata } from "@/domain/project/metadata";
import type { WordTiming } from "@/domain/word/timing";

// -- Store-local Types --------------------------------------------------------

type GranularityMode = "line" | "word";
type EditorMode = "simple" | "advanced";
type SimpleTab = "import" | "edit" | "sync" | "timeline" | "preview" | "export";

interface SyllableSplitDefaults {
  applyToAll: boolean;
  caseInsensitive: boolean;
}

const DEFAULT_SYLLABLE_SPLIT_DEFAULTS: SyllableSplitDefaults = {
  applyToAll: false,
  caseInsensitive: false,
};

interface HistoryEntry {
  lines: LyricLine[];
  groups: LinkGroup[];
  timestamp: number;
}

// -- Segregated State Slices --------------------------------------------------

interface MetadataState {
  metadata: ProjectMetadata;
}

interface AgentsState {
  agents: Agent[];
}

interface LinesState {
  lines: LyricLine[];
}

interface GroupsState {
  groups: LinkGroup[];
}

interface UiState {
  granularity: GranularityMode;
  editorMode: EditorMode;
  activeTab: SimpleTab;
  syllableSplitDefaults: SyllableSplitDefaults;
  primingStripped: boolean;
}

interface DismissalsState {
  dismissedSuggestions: string[];
  dismissedExplicitSuggestions: string[];
}

interface HistoryState {
  isDirty: boolean;
  history: HistoryEntry[];
  historyIndex: number;
  // True when state.lines or state.groups has changed since the last history
  // entry was written (e.g., per-keystroke setLines from the Edit textarea).
  // The next history-aware mutator snapshots this state into history first
  // so undo lands on the pending edit instead of skipping past it.
  isDirtySinceHistory: boolean;
}

// -- Segregated Action Slices -------------------------------------------------

interface MetadataActions {
  setMetadata: (metadata: Partial<ProjectMetadata>) => void;
  reset: () => void;
}

interface AgentActions {
  addAgent: (agent: Agent) => void;
  updateAgent: (id: string, updates: Partial<Agent>) => void;
  removeAgent: (id: string) => void;
  setAgents: (agents: Agent[]) => void;
}

interface UiActions {
  setGranularity: (mode: GranularityMode) => void;
  setEditorMode: (mode: EditorMode) => void;
  setActiveTab: (tab: SimpleTab) => void;
  setSyllableSplitDefaults: (defaults: SyllableSplitDefaults) => void;
  setPrimingStripped: (value: boolean) => void;
}

interface DismissalActions {
  dismissSuggestion: (fingerprint: string) => void;
  setDismissedSuggestions: (fingerprints: string[]) => void;
  clearDismissedSuggestions: () => void;
  dismissExplicitSuggestion: (fingerprint: string) => void;
  setDismissedExplicitSuggestions: (fingerprints: string[]) => void;
  clearDismissedExplicitSuggestions: () => void;
}

interface HistoryActions {
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  clearHistory: () => void;
  markDirty: () => void;
  markClean: () => void;
  commitPendingLineEdit: (baseline: LyricLine[], baselineWasDirty?: boolean) => void;
}

interface LineActions {
  setLines: (lines: LyricLine[]) => void;
  setLinesWithHistory: (lines: LyricLine[], groups?: LinkGroup[]) => void;
  updateLine: (id: string, updates: Partial<LyricLine>, options?: { deriveText?: boolean }) => void;
  updateLineWithHistory: (
    id: string,
    updates: Partial<LyricLine>,
    options?: { deriveText?: boolean; propagateToSiblings?: boolean },
  ) => void;
  updateLinesWithHistory: (
    updates: Array<{ id: string; updates: Partial<LyricLine> }>,
    options?: { deriveText?: boolean; propagateToSiblings?: boolean },
  ) => void;
  moveWordToBg: (lineId: string, wordIndices: number[], timeDelta: number, duration: number) => void;
  moveWordFromBg: (lineId: string, wordIndices: number[], timeDelta: number, duration: number) => void;
  applyWordCountChange: (
    lineId: string,
    newWords: WordTiming[],
    field: "words" | "backgroundWords",
    resolution: "apply" | "detach" | "cancel",
    extraUpdates?: Partial<LyricLine>,
  ) => void;
  toggleWordExplicit: (lineId: string, field: "words" | "backgroundWords", wordIndices: number[]) => void;
  mergeSyllableGroupIntoWord: (lineId: string, field: "words" | "backgroundWords", wordIndices: number[]) => void;
  snapSyllablesFlush: (lineId: string, field: "words" | "backgroundWords") => void;
  markWordsExplicit: (
    targets: Array<{ lineId: string; field: "words" | "backgroundWords"; wordIndex: number }>,
    value: boolean,
  ) => void;
  splitSyllablesAcrossIdenticalWordsWithHistory: (params: {
    source: { lineId: string; wordIndex: number; type: "word" | "bg" };
    splitPoints: number[];
    caseInsensitive: boolean;
  }) => void;
}

interface GroupActions {
  setGroups: (groups: LinkGroup[]) => void;
  addGroup: (group: LinkGroup) => void;
  addGroupWithLines: (group: LinkGroup, lines: LyricLine[]) => void;
  groupRepeatingSections: (starts: number[], length: number, options?: { label?: string; color?: string }) => void;
  updateGroup: (id: string, updates: Partial<LinkGroup>) => void;
  removeGroup: (id: string) => void;
  addInstance: (groupId: string, structure: LineTemplate[], instanceStart: number, insertAtIndex?: number) => void;
  removeInstance: (groupId: string, instanceIdx: number) => void;
  detachLine: (lineId: string) => void;
  shiftInstance: (groupId: string, instanceIdx: number, deltaSeconds: number) => void;
}

// -- Composed Store -----------------------------------------------------------

type ProjectState = MetadataState & AgentsState & LinesState & GroupsState & UiState & DismissalsState & HistoryState;

type ProjectActions = MetadataActions &
  AgentActions &
  UiActions &
  DismissalActions &
  HistoryActions &
  LineActions &
  GroupActions;

type ProjectStore = ProjectState & ProjectActions;

// -- Exports ------------------------------------------------------------------

export type {
  GranularityMode,
  SimpleTab,
  SyllableSplitDefaults,
  MetadataState,
  AgentsState,
  LinesState,
  GroupsState,
  UiState,
  DismissalsState,
  HistoryState,
  MetadataActions,
  AgentActions,
  UiActions,
  DismissalActions,
  HistoryActions,
  LineActions,
  GroupActions,
  ProjectState,
  ProjectStore,
};
export { DEFAULT_SYLLABLE_SPLIT_DEFAULTS };
