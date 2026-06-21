import { create } from "zustand";
import { persist } from "zustand/middleware";
import { type ShortcutBinding, getShortcutById } from "@/stores/shortcut-registry";

// -- Types --------------------------------------------------------------------

interface ShortcutBindingsState {
  overrides: Record<string, ShortcutBinding>;
  setBinding: (id: string, binding: ShortcutBinding) => void;
  resetBinding: (id: string) => void;
  resetAllBindings: () => void;
}

// -- Store --------------------------------------------------------------------

const useShortcutBindingsStore = create<ShortcutBindingsState>()(
  persist(
    (set) => ({
      overrides: {},
      setBinding: (id, binding) =>
        set((state) => ({
          overrides: { ...state.overrides, [id]: binding },
        })),
      resetBinding: (id) =>
        set((state) => {
          const { [id]: _, ...rest } = state.overrides;
          return { overrides: rest };
        }),
      resetAllBindings: () => set({ overrides: {} }),
    }),
    { name: "composer-shortcut-bindings" },
  ),
);

// -- Helpers ------------------------------------------------------------------

function getEffectiveBinding(id: string): ShortcutBinding {
  const override = useShortcutBindingsStore.getState().overrides[id];
  if (override) return override;
  const def = getShortcutById(id);
  if (!def) throw new Error(`Unknown shortcut: ${id}`);
  return def.defaultBinding;
}

function getEffectiveKeysArray(id: string): string[] {
  const binding = getEffectiveBinding(id);
  if (binding.key === "") return [];
  const keys: string[] = [];
  if (binding.mod) keys.push("Mod");
  if (binding.meta) keys.push("Meta");
  if (binding.ctrl) keys.push("Ctrl");
  if (binding.shift) keys.push("Shift");
  if (binding.alt) keys.push("Alt");
  const rawKey = binding.key === " " ? "Space" : binding.key;
  const displayKey = rawKey.length === 1 ? rawKey.toUpperCase() : rawKey;
  keys.push(displayKey);
  return keys;
}

// -- Exports ------------------------------------------------------------------

export { useShortcutBindingsStore, getEffectiveBinding, getEffectiveKeysArray };
