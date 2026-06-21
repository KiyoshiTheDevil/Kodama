import { create } from "zustand";

// -- Types --------------------------------------------------------------------

type SettingsHighlight = "bridge-section" | null;

interface UIState {
  settingsOpen: boolean;
  settingsHighlight: SettingsHighlight;
}

interface UIActions {
  openSettings: (highlight?: SettingsHighlight) => void;
  closeSettings: () => void;
  clearHighlight: () => void;
}

// -- Store --------------------------------------------------------------------

const useUIStore = create<UIState & UIActions>((set) => ({
  settingsOpen: false,
  settingsHighlight: null,

  openSettings: (highlight = null) => set({ settingsOpen: true, settingsHighlight: highlight }),
  closeSettings: () => set({ settingsOpen: false, settingsHighlight: null }),
  clearHighlight: () => set({ settingsHighlight: null }),
}));

// -- Exports ------------------------------------------------------------------

export { useUIStore };
export type { SettingsHighlight };
