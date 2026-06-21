import { create } from "zustand";
import { persist } from "zustand/middleware";
import { DEFAULT_BRIDGE_URL } from "@/utils/composer-bridge-api";

// -- Types --------------------------------------------------------------------

type GranularityDefault = "word" | "line";
type LinkedDivergenceAction = "ask" | "apply" | "detach";
type PreviewRenderer = "braccato" | "am-lyrics";
type VocalModelVariant = "fp16" | "fp32";

interface ExperimentFlags {
  youtubeBridge: boolean;
}

interface CobaltInstance {
  id: string;
  label: string;
  url: string;
}

interface CobaltInstanceStatus {
  status: "success" | "error";
  errorMessage?: string;
  at: number;
}

const DEFAULT_COBALT_INSTANCE_ID = "default";

interface SettingsState {
  defaultPlaybackRate: number;
  rememberVolume: boolean;
  lastVolume: number;
  audioScrubPreview: boolean;

  defaultZoom: number;
  defaultRowHeight: number;
  followPlayhead: boolean;
  timelineSnap: boolean;
  timelineSnapThreshold: number;
  timelineHorizontalScroll: boolean;

  nudgeAmount: number;
  defaultWordDuration: number;
  minWordDuration: number;
  defaultGranularity: GranularityDefault;

  autoSaveDelay: number;

  showShortcutHints: boolean;
  showSyllableIndicators: boolean;
  splitCharacter: string;
  autoExtractBackgroundVocals: boolean;
  mergeStandaloneBackgroundLines: boolean;
  preserveBracketsOnExtraction: boolean;

  confirmReplaceProjectFromHash: boolean;
  confirmReplaceLyrics: boolean;
  confirmSyncReset: boolean;
  confirmClearProject: boolean;
  confirmResetSettings: boolean;
  confirmResetShortcuts: boolean;
  confirmGroupDissolution: boolean;
  confirmApplyToAllSyllableSplit: boolean;
  linkedDivergenceAction: LinkedDivergenceAction;

  previewRenderer: PreviewRenderer;

  autoSeparateOnImport: boolean;
  vocalModelVariant: VocalModelVariant;

  cobaltInstances: CobaltInstance[];
  selectedCobaltInstanceId: string;
  cobaltInstanceStatus: Record<string, CobaltInstanceStatus>;

  experiments: ExperimentFlags;
  composerBridgeUrl: string;
}

interface SettingsActions {
  set: <K extends keyof SettingsState>(key: K, value: SettingsState[K]) => void;
  resetToDefaults: () => void;
  addCobaltInstance: (instance: Omit<CobaltInstance, "id">) => void;
  updateCobaltInstance: (id: string, updates: Partial<Omit<CobaltInstance, "id">>) => void;
  removeCobaltInstance: (id: string) => void;
  selectCobaltInstance: (id: string) => void;
  recordCobaltInstanceResult: (id: string, status: "success" | "error", errorMessage?: string) => void;
}

// -- Defaults -----------------------------------------------------------------

const DEFAULTS: SettingsState = {
  defaultPlaybackRate: 0.75,
  rememberVolume: true,
  lastVolume: 1,
  audioScrubPreview: true,

  defaultZoom: 100,
  defaultRowHeight: 44,
  followPlayhead: true,
  timelineSnap: true,
  timelineSnapThreshold: 12,
  timelineHorizontalScroll: false,

  nudgeAmount: 0.05,
  defaultWordDuration: 0.3,
  minWordDuration: 0.05,
  defaultGranularity: "word",

  autoSaveDelay: 2000,

  showShortcutHints: true,
  showSyllableIndicators: true,
  splitCharacter: "|",
  autoExtractBackgroundVocals: true,
  mergeStandaloneBackgroundLines: true,
  preserveBracketsOnExtraction: false,

  confirmReplaceProjectFromHash: true,
  confirmReplaceLyrics: true,
  confirmSyncReset: true,
  confirmClearProject: true,
  confirmResetSettings: true,
  confirmResetShortcuts: true,
  confirmGroupDissolution: true,
  confirmApplyToAllSyllableSplit: true,
  linkedDivergenceAction: "ask",

  previewRenderer: "braccato",

  autoSeparateOnImport: false,
  vocalModelVariant: "fp32",

  cobaltInstances: [],
  selectedCobaltInstanceId: DEFAULT_COBALT_INSTANCE_ID,
  cobaltInstanceStatus: {},

  experiments: { youtubeBridge: false },
  composerBridgeUrl: DEFAULT_BRIDGE_URL,
};

const BUILTIN_COBALT_INSTANCE: CobaltInstance = {
  id: DEFAULT_COBALT_INSTANCE_ID,
  label: "Composer",
  url: "https://cobalt.boidu.dev",
};

const SETTINGS_PERSIST_VERSION = 2;

function migrateSettings(persistedState: unknown): unknown {
  if (!persistedState || typeof persistedState !== "object") return persistedState;
  const state = persistedState as Partial<SettingsState>;
  return {
    ...state,
    vocalModelVariant: state.vocalModelVariant === "fp16" ? "fp32" : state.vocalModelVariant,
  };
}

// -- Store --------------------------------------------------------------------

const useSettingsStore = create<SettingsState & SettingsActions>()(
  persist(
    (set) => ({
      ...DEFAULTS,

      set: (key, value) => set({ [key]: value }),
      resetToDefaults: () =>
        set((state) => ({
          ...DEFAULTS,
          confirmReplaceProjectFromHash: state.confirmReplaceProjectFromHash,
          confirmReplaceLyrics: state.confirmReplaceLyrics,
          confirmSyncReset: state.confirmSyncReset,
          confirmClearProject: state.confirmClearProject,
          confirmResetSettings: state.confirmResetSettings,
          confirmResetShortcuts: state.confirmResetShortcuts,
          confirmGroupDissolution: state.confirmGroupDissolution,
          confirmApplyToAllSyllableSplit: state.confirmApplyToAllSyllableSplit,
          linkedDivergenceAction: state.linkedDivergenceAction,
          cobaltInstances: state.cobaltInstances,
          selectedCobaltInstanceId: state.selectedCobaltInstanceId,
          cobaltInstanceStatus: state.cobaltInstanceStatus,
          experiments: state.experiments,
          composerBridgeUrl: state.composerBridgeUrl,
        })),
      addCobaltInstance: (instance) =>
        set((state) => {
          const id = crypto.randomUUID();
          return { cobaltInstances: [...state.cobaltInstances, { ...instance, id }] };
        }),
      updateCobaltInstance: (id, updates) =>
        set((state) => ({
          cobaltInstances: state.cobaltInstances.map((i) => (i.id === id ? { ...i, ...updates } : i)),
        })),
      removeCobaltInstance: (id) =>
        set((state) => {
          const nextStatus = { ...state.cobaltInstanceStatus };
          delete nextStatus[id];
          return {
            cobaltInstances: state.cobaltInstances.filter((i) => i.id !== id),
            selectedCobaltInstanceId:
              state.selectedCobaltInstanceId === id ? DEFAULT_COBALT_INSTANCE_ID : state.selectedCobaltInstanceId,
            cobaltInstanceStatus: nextStatus,
          };
        }),
      selectCobaltInstance: (id) => set({ selectedCobaltInstanceId: id }),
      recordCobaltInstanceResult: (id, status, errorMessage) =>
        set((state) => ({
          cobaltInstanceStatus: {
            ...state.cobaltInstanceStatus,
            [id]: { status, errorMessage, at: Date.now() },
          },
        })),
    }),
    { name: "composer-settings", version: SETTINGS_PERSIST_VERSION, migrate: migrateSettings },
  ),
);

function getActiveCobaltInstance(): CobaltInstance {
  const state = useSettingsStore.getState();
  if (state.selectedCobaltInstanceId === DEFAULT_COBALT_INSTANCE_ID) return BUILTIN_COBALT_INSTANCE;
  const found = state.cobaltInstances.find((i) => i.id === state.selectedCobaltInstanceId);
  return found ?? BUILTIN_COBALT_INSTANCE;
}

function isUsingDefaultCobaltInstance(): boolean {
  const state = useSettingsStore.getState();
  if (state.selectedCobaltInstanceId === DEFAULT_COBALT_INSTANCE_ID) return true;
  return !state.cobaltInstances.some((i) => i.id === state.selectedCobaltInstanceId);
}

// -- Exports ------------------------------------------------------------------

export {
  useSettingsStore,
  DEFAULTS,
  BUILTIN_COBALT_INSTANCE,
  DEFAULT_COBALT_INSTANCE_ID,
  getActiveCobaltInstance,
  isUsingDefaultCobaltInstance,
};
export type { SettingsState, CobaltInstanceStatus, LinkedDivergenceAction, VocalModelVariant };
