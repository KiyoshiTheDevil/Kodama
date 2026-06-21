import { create } from "zustand";
import { type LinkedDivergenceAction, useSettingsStore } from "@/stores/settings";

// -- Constants ----------------------------------------------------------------

const LOG_PREFIX = "[Composer]";

// -- Types --------------------------------------------------------------------

type DivergenceResolution = "apply" | "detach" | "cancel";

interface DivergenceOptions {
  affectedSiblingCount: number;
  groupLabel?: string;
}

interface DivergenceStore {
  isOpen: boolean;
  options: DivergenceOptions | null;
  resolve: ((value: DivergenceResolution) => void) | null;
  open: (options: DivergenceOptions) => Promise<DivergenceResolution>;
  resolveAndClose: (value: DivergenceResolution, dontAskAgainAs: LinkedDivergenceAction | null) => void;
}

// -- Store --------------------------------------------------------------------

const useDivergenceStore = create<DivergenceStore>((set, get) => ({
  isOpen: false,
  options: null,
  resolve: null,

  open: (options) => {
    const pref = useSettingsStore.getState().linkedDivergenceAction;
    if (pref === "apply" || pref === "detach") {
      return Promise.resolve(pref);
    }
    if (get().isOpen) {
      console.warn(`${LOG_PREFIX} divergence modal already open; cancelling the second call`);
      return Promise.resolve("cancel");
    }
    return new Promise<DivergenceResolution>((resolve) => {
      set({ isOpen: true, options, resolve });
    });
  },

  resolveAndClose: (value, dontAskAgainAs) => {
    const { resolve } = get();
    if (dontAskAgainAs) {
      useSettingsStore.getState().set("linkedDivergenceAction", dontAskAgainAs);
    }
    resolve?.(value);
    set({ isOpen: false, options: null, resolve: null });
  },
}));

// -- Exports ------------------------------------------------------------------

export { useDivergenceStore };
