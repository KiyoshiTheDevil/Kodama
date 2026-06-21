import type { ReactNode } from "react";
import { create } from "zustand";
import { type SettingsState, useSettingsStore } from "@/stores/settings";

// -- Types --------------------------------------------------------------------

type SettingsBoolKey = {
  [K in keyof SettingsState]: SettingsState[K] extends boolean ? K : never;
}[keyof SettingsState];

interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "destructive" | "primary";
  settingsKey?: SettingsBoolKey;
  recoverable?: boolean;
}

interface QueuedConfirm {
  options: ConfirmOptions;
  resolve: (value: boolean) => void;
}

interface ConfirmStore {
  isOpen: boolean;
  options: ConfirmOptions | null;
  resolve: ((value: boolean) => void) | null;
  queue: QueuedConfirm[];
  open: (options: ConfirmOptions) => Promise<boolean>;
  resolveAndClose: (value: boolean, dontAskAgain: boolean) => void;
}

// -- Store --------------------------------------------------------------------

const useConfirmStore = create<ConfirmStore>((set, get) => ({
  isOpen: false,
  options: null,
  resolve: null,
  queue: [],

  open: (options) => {
    if (options.settingsKey && useSettingsStore.getState()[options.settingsKey] === false) {
      return Promise.resolve(true);
    }
    return new Promise<boolean>((resolve) => {
      if (get().isOpen) {
        // Queue the request; it will open after the active modal closes.
        set((state) => ({ queue: [...state.queue, { options, resolve }] }));
        return;
      }
      set({ isOpen: true, options, resolve });
    });
  },

  resolveAndClose: (value, dontAskAgain) => {
    const { options, resolve } = get();
    if (value && dontAskAgain && options?.settingsKey) {
      useSettingsStore.getState().set(options.settingsKey, false);
    }
    resolve?.(value);
    drainQueue(set, get);
  },
}));

function drainQueue(set: ConfirmSet, get: () => ConfirmStore) {
  let queue = get().queue;
  while (queue.length > 0) {
    const [next, ...rest] = queue;
    const settingsKey = next.options.settingsKey;
    if (settingsKey && useSettingsStore.getState()[settingsKey] === false) {
      next.resolve(true);
      queue = rest;
      continue;
    }
    set({ isOpen: true, options: next.options, resolve: next.resolve, queue: rest });
    return;
  }
  set({ isOpen: false, options: null, resolve: null, queue: [] });
}

type ConfirmSet = (partial: Partial<ConfirmStore> | ((state: ConfirmStore) => Partial<ConfirmStore>)) => void;

function useConfirm(): (options: ConfirmOptions) => Promise<boolean> {
  return useConfirmStore.getState().open;
}

// -- Exports ------------------------------------------------------------------

export { useConfirm, useConfirmStore };
export type { ConfirmOptions };
