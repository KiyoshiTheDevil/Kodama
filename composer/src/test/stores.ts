import { useAudioStore } from "@/stores/audio";
import { useAuthStore } from "@/stores/auth";
import { useConfirmStore } from "@/stores/confirm-store";
import { useDivergenceStore } from "@/stores/divergence-store";
import { INITIAL_STATE as IMPORT_MODAL_INITIAL_STATE, useImportModalStore } from "@/stores/import-modal-store";
import { useModalStackStore } from "@/stores/modal-stack";
import { INITIAL_STATE as PROJECT_INITIAL_STATE, useProjectStore } from "@/stores/project";
import { useSeparationStore } from "@/stores/separation";
import { DEFAULTS as SETTINGS_DEFAULTS, useSettingsStore } from "@/stores/settings";
import { useShortcutBindingsStore } from "@/stores/shortcut-bindings";
import { useUIStore } from "@/stores/ui";
import { useTimelineStore } from "@/views/timeline/timeline-store";

type PersistedStore = { persist?: { clearStorage?: () => void | Promise<void> } };

async function clearPersistedStorage(store: PersistedStore): Promise<void> {
  if (!store.persist?.clearStorage) return;
  await store.persist.clearStorage();
}

function hasLocalStorage(): boolean {
  return typeof globalThis.localStorage !== "undefined";
}

async function resetAllStores(): Promise<void> {
  await clearPersistedStorage(useSettingsStore);
  useSettingsStore.setState(SETTINGS_DEFAULTS);

  await clearPersistedStorage(useShortcutBindingsStore);
  useShortcutBindingsStore.setState({ overrides: {} });

  useAuthStore.getState().clear();
  useAudioStore.getState().reset();
  useSeparationStore.getState().reset();
  useProjectStore.setState(PROJECT_INITIAL_STATE);

  useConfirmStore.setState({ isOpen: false, options: null, resolve: null, queue: [] });
  useDivergenceStore.setState({ isOpen: false, options: null, resolve: null });
  useImportModalStore.setState({ ...IMPORT_MODAL_INITIAL_STATE });
  useModalStackStore.setState({ count: 0 });
  useUIStore.setState({ settingsOpen: false, settingsHighlight: null });

  const settings = useSettingsStore.getState();
  useTimelineStore.setState({
    zoom: settings.defaultZoom,
    followEnabled: settings.followPlayhead,
    previewSidebarOpen: false,
    selectedWords: [],
    clipboard: null,
    pasteMode: { status: "idle" },
    scrollLeft: 0,
    rowHeights: {},
    defaultRowHeight: settings.defaultRowHeight,
    isDraggingPlayhead: false,
    dragTime: 0,
    contextMenu: null,
    editingWord: null,
    rollingEditMode: false,
    collapsedInstances: {},
    pingingGroupId: null,
    renamingGroupId: null,
    renamingInstanceIdx: null,
    draggedGroupShift: null,
  });

  if (hasLocalStorage()) globalThis.localStorage.clear();
}

export { resetAllStores };
