import { create } from "zustand";

interface ModalStackState {
  count: number;
  push: () => void;
  pop: () => void;
}

const useModalStackStore = create<ModalStackState>((set) => ({
  count: 0,
  push: () => set((s) => ({ count: s.count + 1 })),
  pop: () => set((s) => ({ count: Math.max(0, s.count - 1) })),
}));

function isAnyModalOpen(): boolean {
  return useModalStackStore.getState().count > 0;
}

export { useModalStackStore, isAnyModalOpen };
