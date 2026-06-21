import {
  clearAudioFile,
  loadAudioFile,
  saveAudioFile,
  saveCurrentProject,
  type SavedAudioSource,
} from "@/lib/persistence";
import { cancelPendingSave, debouncedSave, flushPendingSave } from "@/lib/persistence-debounce";
import { markPersistenceSettled } from "@/lib/persistence-settled";
import { loadCurrentProjectWithPrimingMigration } from "@/lib/priming-migration";
import { type AudioSource, useAudioStore } from "@/stores/audio";
import { useProjectStore } from "@/stores/project";
import { DEFAULT_SYLLABLE_SPLIT_DEFAULTS } from "@/stores/project/types";
import { DEFAULT_AGENTS } from "@/domain/agent/colors";
import { useSeparationStore } from "@/stores/separation";
import { useSettingsStore } from "@/stores/settings";
import { useEffect } from "react";

// -- Constants ----------------------------------------------------------------

const LOG_PREFIX = "[Persistence]";

// -- Helpers ------------------------------------------------------------------

function toSavedAudioSource(source: AudioSource): SavedAudioSource | undefined {
  if (!source) return undefined;
  if (source.type === "file") return { kind: "file", name: source.file.name };
  if (source.type === "youtube") return { kind: "youtube", videoId: source.videoId };
  return undefined;
}

function playableFile(source: AudioSource): File | null {
  if (!source) return null;
  if (source.type === "file") return source.file;
  if (source.type === "youtube") return source.file ?? null;
  return null;
}

type ProjectSaveArgs = Parameters<typeof debouncedSave>;

function buildSaveArgs(): ProjectSaveArgs | null {
  const projectState = useProjectStore.getState();
  const liveAudioSource = useAudioStore.getState().source;
  // Skip only when the session is truly empty. Audio-loaded sessions need to
  // persist non-lyric fields like currentStem and the audio source kind, even
  // before the user types any lyrics.
  const hasContent = projectState.lines.length > 0 || projectState.metadata.title;
  const hasContext = liveAudioSource !== null;
  if (!hasContent && !hasContext) return null;
  return [
    projectState.metadata,
    projectState.agents,
    projectState.lines,
    projectState.groups,
    projectState.granularity,
    projectState.syllableSplitDefaults,
    toSavedAudioSource(liveAudioSource),
    projectState.dismissedSuggestions,
    projectState.dismissedExplicitSuggestions,
    useSeparationStore.getState().currentStem,
    projectState.primingStripped,
  ];
}

function commitProjectSave(): void {
  const args = buildSaveArgs();
  if (!args) return;
  debouncedSave(...args);
}

// Discrete user actions (stem picking) should not wait for the typing-tuned
// debounce. Cancel any queued debounced save so it can't overwrite this one
// with stale args, then write to IDB now.
function commitProjectSaveNow(): void {
  const args = buildSaveArgs();
  if (!args) return;
  cancelPendingSave();
  saveCurrentProject(...args).catch((err) => console.error(LOG_PREFIX, "Immediate save failed:", err));
}

// -- Hook ---------------------------------------------------------------------

function usePersistence(): void {
  useEffect(() => {
    Promise.all([loadCurrentProjectWithPrimingMigration(), loadAudioFile()])
      .then(([project, file]) => {
        if (project) {
          const issues: string[] = [];
          const safeLines = project.lines ?? [];
          if (!project.lines) issues.push("missing lines");
          const safeAgents = project.agents && project.agents.length > 0 ? project.agents : DEFAULT_AGENTS;
          if (!project.agents || project.agents.length === 0) issues.push("missing or empty agents");
          const safeGranularity = project.granularity ?? useSettingsStore.getState().defaultGranularity;
          if (project.granularity === undefined) issues.push("missing granularity");
          if (issues.length > 0) {
            console.warn(
              `${LOG_PREFIX} loaded project has malformed fields (${issues.join(", ")}); using safe defaults. The raw record is still in IndexedDB; visit /recover to download it.`,
            );
          }

          // Restore the saved stem selection BEFORE setting the audio source.
          // useAutoSeparate's source subscription will then run refreshForCurrentSource
          // which preserves currentStem when the cached stems are still available, and
          // falls back to "original" when they aren't (LRU eviction or variant change).
          if (project.currentStem) {
            useSeparationStore.getState().restoreCurrentStem(project.currentStem);
          }

          const savedSource = project.audioSource;
          if (savedSource?.kind === "youtube") {
            useAudioStore.getState().setYouTubeSource(savedSource.videoId, file);
          } else if (file) {
            useAudioStore.getState().setSource({ type: "file", file });
          }

          const state = useProjectStore.getState();
          state.setMetadata(project.metadata);
          state.setLines(safeLines);
          state.setGroups(project.groups ?? []);
          state.setGranularity(safeGranularity);
          state.setSyllableSplitDefaults(project.syllableSplitDefaults ?? DEFAULT_SYLLABLE_SPLIT_DEFAULTS);
          state.setAgents(safeAgents);
          state.setDismissedSuggestions(project.dismissedSuggestions ?? []);
          state.setDismissedExplicitSuggestions(project.dismissedExplicitSuggestions ?? []);
          state.setPrimingStripped(project.primingStripped ?? false);
          state.markClean();
        } else if (file) {
          useAudioStore.getState().setSource({ type: "file", file });
        }
      })
      .catch((err) => {
        console.error(`${LOG_PREFIX} initial load failed:`, err);
      })
      .finally(() => {
        if (import.meta.env.DEV) {
          console.log(`${LOG_PREFIX} settled`, {
            title: useProjectStore.getState().metadata.title,
            source: useAudioStore.getState().source,
          });
        }
        markPersistenceSettled();
      });
  }, []);

  useEffect(() => {
    const unsubscribe = useProjectStore.subscribe((state) => {
      if (!state.isDirty) return;
      commitProjectSave();
    });
    return () => unsubscribe();
  }, []);

  // Stem selection lives in a separate store, so changes to currentStem alone
  // don't mark the project dirty and wouldn't trigger the project subscription
  // above. Subscribe to currentStem directly and save IMMEDIATELY (no debounce):
  // picking a stem is a discrete action and the user can reload at any time,
  // so the debounce window would silently lose the choice.
  useEffect(() => {
    const unsubscribe = useSeparationStore.subscribe((state, prevState) => {
      if (state.currentStem === prevState.currentStem) return;
      commitProjectSaveNow();
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let prevSource = useAudioStore.getState().source;
    const unsubscribe = useAudioStore.subscribe((state) => {
      if (state.source === prevSource) return;
      const previous = prevSource;
      prevSource = state.source;

      const nextFile = playableFile(state.source);
      const prevFile = playableFile(previous);

      if (nextFile && nextFile !== prevFile) {
        saveAudioFile(nextFile).catch((err) => console.error(`${LOG_PREFIX} audio save failed:`, err));
        return;
      }
      if (!nextFile && prevFile) {
        clearAudioFile().catch((err) => console.error(`${LOG_PREFIX} audio clear failed:`, err));
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const unsubscribe = useAudioStore.subscribe((state, prev) => {
      if (state.volume === prev.volume) return;
      if (!useSettingsStore.getState().rememberVolume) return;
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        useSettingsStore.getState().set("lastVolume", state.volume);
      }, 500);
    });
    return () => {
      unsubscribe();
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Always flush so debounced saves (title edits, lyrics typing, anything
      // queued within the debounce window) land in IDB before the page closes.
      // The leave-confirmation prompt below stays gated on meaningful project
      // content so we don't nag on every audio-only reload.
      flushPendingSave();
      const state = useProjectStore.getState();
      if (state.isDirty && state.lines.length > 0) {
        e.preventDefault();
        return "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);
}

// -- Exports ------------------------------------------------------------------

export { usePersistence };
