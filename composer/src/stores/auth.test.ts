import { beforeEach, describe, expect, it } from "vitest";
import { useAuthStore } from "@/stores/auth";

beforeEach(() => {
  useAuthStore.getState().clear();
});

describe("useAuthStore", () => {
  it("starts with null jwt and expiresAt", () => {
    const state = useAuthStore.getState();
    expect(state.jwt).toBeNull();
    expect(state.expiresAt).toBeNull();
  });

  it("setJwt stores both fields", () => {
    useAuthStore.getState().setJwt("token-abc", 1_700_000_000);
    const state = useAuthStore.getState();
    expect(state.jwt).toBe("token-abc");
    expect(state.expiresAt).toBe(1_700_000_000);
  });

  it("setJwt overwrites previous values", () => {
    useAuthStore.getState().setJwt("first", 100);
    useAuthStore.getState().setJwt("second", 200);
    const state = useAuthStore.getState();
    expect(state.jwt).toBe("second");
    expect(state.expiresAt).toBe(200);
  });

  it("clear resets both fields to null", () => {
    useAuthStore.getState().setJwt("token-abc", 1_700_000_000);
    useAuthStore.getState().clear();
    const state = useAuthStore.getState();
    expect(state.jwt).toBeNull();
    expect(state.expiresAt).toBeNull();
  });
});
