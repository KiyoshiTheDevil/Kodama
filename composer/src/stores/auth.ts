import { create } from "zustand";

// -- Types --------------------------------------------------------------------

interface AuthState {
  jwt: string | null;
  expiresAt: number | null;
}

interface AuthActions {
  setJwt: (jwt: string, expiresAt: number) => void;
  clear: () => void;
}

// -- Defaults -----------------------------------------------------------------

const INITIAL_STATE: AuthState = {
  jwt: null,
  expiresAt: null,
};

// -- Store --------------------------------------------------------------------

const useAuthStore = create<AuthState & AuthActions>((set) => ({
  ...INITIAL_STATE,

  setJwt: (jwt, expiresAt) => set({ jwt, expiresAt }),
  clear: () => set(INITIAL_STATE),
}));

// -- Exports ------------------------------------------------------------------

export { useAuthStore };
