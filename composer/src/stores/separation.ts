import {
  TARGET_SAMPLE_RATE,
  decodeFileToFloat32,
  floatChannelsToWavBlob,
  hashFile,
} from "@/audio/separation/audio-codec";
import { computeInstrumental } from "@/audio/separation/derived-stems";
import { hasCachedModel } from "@/audio/separation/model-cache";
import { getModelDescriptor, isModelHostingConfigured } from "@/audio/separation/model-registry";
import { getStem, hasStems, putStem } from "@/audio/separation/stem-store";
import type { SeparationError, SeparationStatus, Stem } from "@/audio/separation/types";
import { hasOnlyFiniteSamples } from "@/audio/separation/validate-channels";
import { SeparationWorker } from "@/audio/separation/worker-host";
import { useAudioStore } from "@/stores/audio";
import type { VocalModelVariant } from "@/stores/settings";
import { useSettingsStore } from "@/stores/settings";
import { create } from "zustand";

interface SeparationState {
  status: SeparationStatus;
  progress: { loaded: number; total: number };
  error: SeparationError | null;
  currentStem: Stem;
  availableStems: Stem[];
  modelCached: boolean;
  jobKey: string | null;
  stemUrls: Partial<Record<Stem, string>>;
  hostingConfigured: boolean;
}

interface SeparationActions {
  refreshModelCacheStatus: () => Promise<void>;
  refreshForCurrentSource: () => Promise<void>;
  downloadModel: () => Promise<void>;
  separate: () => Promise<void>;
  selectStem: (stem: Stem) => void;
  restoreCurrentStem: (stem: Stem) => void;
  cancel: () => void;
  retry: () => Promise<void>;
  reset: () => void;
}

let worker: SeparationWorker | null = null;
let isCancelling = false;

function getWorker(): SeparationWorker {
  if (!worker) worker = new SeparationWorker();
  return worker;
}

function disposeWorker() {
  if (worker) {
    worker.dispose();
    worker = null;
  }
}

function revokeUrls(urls: Partial<Record<Stem, string>>) {
  for (const url of Object.values(urls)) {
    if (url) URL.revokeObjectURL(url);
  }
}

type SetSeparationState = (partial: Partial<SeparationState>) => void;

// Shared download-init prologue used by both `downloadModel` (which then sets
// idle) and `separate` (which then continues to processing). Returns true if
// the model initialised, false if it aborted or errored. On abort/error the
// caller's status has already been written to "idle" or "error".
async function runModelDownload(set: SetSeparationState, variant: VocalModelVariant): Promise<boolean> {
  set({ status: "downloading", error: null, progress: { loaded: 0, total: 0 } });
  try {
    await getWorker().init({
      variant,
      onProgress: (loaded, total) => set({ progress: { loaded, total } }),
    });
    return true;
  } catch (err) {
    if ((err as Error).name === "AbortError" || isCancelling) {
      set({ status: "idle" });
    } else {
      set({ status: "error", error: { code: "fetch-failed", message: (err as Error).message } });
    }
    return false;
  }
}

const useSeparationStore = create<SeparationState & SeparationActions>((set, get) => ({
  status: "idle",
  progress: { loaded: 0, total: 0 },
  error: null,
  currentStem: "original",
  availableStems: ["original"],
  modelCached: false,
  jobKey: null,
  stemUrls: {},
  hostingConfigured: isModelHostingConfigured(),

  refreshModelCacheStatus: async () => {
    const variant = useSettingsStore.getState().vocalModelVariant;
    const descriptor = getModelDescriptor(variant);
    if (!descriptor) {
      set({ modelCached: false, hostingConfigured: false });
      return;
    }
    const cached = await hasCachedModel(descriptor);
    set({ modelCached: cached, hostingConfigured: true });
  },

  refreshForCurrentSource: async () => {
    revokeUrls(get().stemUrls);
    const source = useAudioStore.getState().source;
    const file = source?.type === "file" ? source.file : source?.type === "youtube" ? source.file : null;
    if (!file) {
      set({ jobKey: null, availableStems: ["original"], stemUrls: {}, currentStem: "original", status: "idle" });
      return;
    }
    const variant = useSettingsStore.getState().vocalModelVariant;
    const audioHash = await hashFile(file);
    const jobKey = `${audioHash}|${variant}`;

    const has = await hasStems(audioHash, variant);
    if (!has) {
      set({ jobKey, availableStems: ["original"], stemUrls: {}, currentStem: "original", status: "idle" });
      return;
    }

    const vocalsBlob = await getStem(audioHash, "vocals", variant);
    const instrumentalBlob = await getStem(audioHash, "instrumental", variant);
    const stemUrls: Partial<Record<Stem, string>> = {};
    if (vocalsBlob) stemUrls.vocals = URL.createObjectURL(vocalsBlob);
    if (instrumentalBlob) stemUrls.instrumental = URL.createObjectURL(instrumentalBlob);
    set({
      jobKey,
      availableStems: ["original", "vocals", "instrumental"],
      stemUrls,
      status: "ready",
    });
  },

  downloadModel: async () => {
    if (!get().hostingConfigured) {
      set({
        status: "error",
        error: { code: "no-base-url", message: "Vocal model URL is not configured." },
      });
      return;
    }
    isCancelling = false;
    const variant = useSettingsStore.getState().vocalModelVariant;
    if (await runModelDownload(set, variant)) {
      set({ status: "idle", modelCached: true });
    }
  },

  separate: async () => {
    if (!get().hostingConfigured) {
      set({
        status: "error",
        error: { code: "no-base-url", message: "Vocal model URL is not configured." },
      });
      return;
    }
    const source = useAudioStore.getState().source;
    const file = source?.type === "file" ? source.file : source?.type === "youtube" ? source.file : null;
    if (!file) return;

    isCancelling = false;
    const variant = useSettingsStore.getState().vocalModelVariant;
    if (!(await runModelDownload(set, variant))) return;
    set({ modelCached: true });

    set({ status: "processing", progress: { loaded: 0, total: 0 } });
    let decoded: Awaited<ReturnType<typeof decodeFileToFloat32>>;
    try {
      decoded = await decodeFileToFloat32(file);
    } catch (err) {
      set({ status: "error", error: { code: "decode-failed", message: (err as Error).message } });
      return;
    }

    const audioHash = await hashFile(file);
    const jobKey = `${audioHash}|${variant}`;
    set({ jobKey });

    let result: Awaited<ReturnType<SeparationWorker["process"]>>;
    try {
      result = await getWorker().process({
        channels: decoded.channels,
        totalFrames: decoded.numFrames,
        onProgress: (processed, total) => set({ progress: { loaded: processed, total } }),
      });
    } catch (err) {
      if ((err as Error).name === "AbortError" || isCancelling) {
        set({ status: "idle" });
        return;
      }
      set({ status: "error", error: { code: "ort-failed", message: (err as Error).message } });
      return;
    }

    if (!hasOnlyFiniteSamples(result.vocals)) {
      set({
        status: "error",
        error: {
          code: "ort-failed",
          message:
            "The vocal model returned invalid audio samples. Switch Vocal model precision to fp32 and run separation again.",
        },
      });
      return;
    }

    const instrumental = computeInstrumental(decoded.channels, result.vocals);
    const vocalsBlob = floatChannelsToWavBlob(result.vocals, TARGET_SAMPLE_RATE);
    const instrumentalBlob = floatChannelsToWavBlob(instrumental, TARGET_SAMPLE_RATE);
    await putStem(audioHash, "vocals", variant, vocalsBlob);
    await putStem(audioHash, "instrumental", variant, instrumentalBlob);

    revokeUrls(get().stemUrls);
    const stemUrls: Partial<Record<Stem, string>> = {
      vocals: URL.createObjectURL(vocalsBlob),
      instrumental: URL.createObjectURL(instrumentalBlob),
    };
    set({
      status: "ready",
      availableStems: ["original", "vocals", "instrumental"],
      stemUrls,
    });
  },

  selectStem: (stem) => {
    const available = get().availableStems;
    if (!available.includes(stem)) return;
    set({ currentStem: stem });
  },

  // Called once at boot by usePersistence to seed currentStem from the saved
  // project, before useAutoSeparate's source subscription runs
  // refreshForCurrentSource. Unlike selectStem this intentionally bypasses the
  // availableStems guard, because at restore time the available list hasn't
  // been populated yet. refreshForCurrentSource handles eviction by overwriting
  // back to "original" when the cached stems are gone.
  restoreCurrentStem: (stem) => {
    set({ currentStem: stem });
  },

  cancel: () => {
    isCancelling = true;
    if (worker) worker.cancel();
    set({ status: "idle", progress: { loaded: 0, total: 0 } });
  },

  retry: async () => {
    set({ error: null });
    await get().separate();
  },

  reset: () => {
    revokeUrls(get().stemUrls);
    disposeWorker();
    set({
      status: "idle",
      progress: { loaded: 0, total: 0 },
      error: null,
      currentStem: "original",
      availableStems: ["original"],
      jobKey: null,
      stemUrls: {},
    });
  },
}));

export { useSeparationStore };
