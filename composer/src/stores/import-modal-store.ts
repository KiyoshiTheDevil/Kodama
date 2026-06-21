import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { ParseResult } from "@/utils/lyrics-parsers/shared";
import type { LyricsSearchQuery } from "@/utils/lyrics-search/types";
import type { ImportSourceInfo } from "@/views/lyrics-import-modal/use-import-modal-actions";

// -- Types --------------------------------------------------------------------

type ImportModalSection = "search" | "paste" | "upload";

interface LastImportResult {
  parsed: ParseResult;
  source: ImportSourceInfo;
}

interface ImportModalState {
  isOpen: boolean;
  prefill: LyricsSearchQuery | null;
  defaultPrefill: LyricsSearchQuery | null;
  initialSection: ImportModalSection | null;
  lastImportResult: LastImportResult | null;
}

interface OpenArgs {
  prefill?: LyricsSearchQuery;
  section?: ImportModalSection;
}

interface ImportModalStore extends ImportModalState {
  open: (args?: OpenArgs) => void;
  close: () => void;
  setDefaultPrefill: (prefill: LyricsSearchQuery) => void;
  clearDefaultPrefill: () => void;
  recordImportResult: (parsed: ParseResult, source: ImportSourceInfo) => void;
  clearImportResult: () => void;
}

// -- Defaults -----------------------------------------------------------------

const INITIAL_STATE: ImportModalState = {
  isOpen: false,
  prefill: null,
  defaultPrefill: null,
  initialSection: null,
  lastImportResult: null,
};

// -- Store --------------------------------------------------------------------

const useImportModalStore = create<ImportModalStore>()(
  persist(
    (set, get) => ({
      ...INITIAL_STATE,

      open: (args) => {
        const explicit = args?.prefill;
        const fallback = get().defaultPrefill;
        set({
          isOpen: true,
          prefill: explicit ?? fallback,
          initialSection: args?.section ?? null,
        });
      },

      close: () => {
        set({ isOpen: false, prefill: null, initialSection: null });
      },

      setDefaultPrefill: (prefill) => {
        set({ defaultPrefill: prefill });
      },

      clearDefaultPrefill: () => {
        set({ defaultPrefill: null });
      },

      recordImportResult: (parsed, source) => {
        set({ lastImportResult: { parsed, source } });
      },

      clearImportResult: () => {
        set({ lastImportResult: null });
      },
    }),
    {
      name: "composer-import-modal",
      partialize: (state) => ({ defaultPrefill: state.defaultPrefill }),
    },
  ),
);

// -- Public hooks -------------------------------------------------------------

function useImportModal(): (args?: OpenArgs) => void {
  return useImportModalStore.getState().open;
}

function useImportModalState(): Omit<ImportModalState, "lastImportResult"> {
  const isOpen = useImportModalStore((s) => s.isOpen);
  const prefill = useImportModalStore((s) => s.prefill);
  const defaultPrefill = useImportModalStore((s) => s.defaultPrefill);
  const initialSection = useImportModalStore((s) => s.initialSection);
  return { isOpen, prefill, defaultPrefill, initialSection };
}

function useLastImportResult(): LastImportResult | null {
  return useImportModalStore((s) => s.lastImportResult);
}

// -- Exports ------------------------------------------------------------------

export { INITIAL_STATE, useImportModal, useImportModalState, useImportModalStore, useLastImportResult };
export type { ImportModalSection, ImportModalState, LastImportResult, OpenArgs };
