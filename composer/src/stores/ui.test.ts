import { beforeEach, describe, expect, it } from "vitest";
import { useUIStore } from "@/stores/ui";

// -- Setup --------------------------------------------------------------------

beforeEach(() => {
  useUIStore.setState({ settingsOpen: false, settingsHighlight: null });
});

// -- Tests --------------------------------------------------------------------

describe("useUIStore", () => {
  describe("defaults", () => {
    it("starts with settingsOpen false and no highlight", () => {
      const state = useUIStore.getState();
      expect(state.settingsOpen).toBe(false);
      expect(state.settingsHighlight).toBeNull();
    });
  });

  describe("openSettings", () => {
    it("opens settings without a highlight when called with no arg", () => {
      useUIStore.getState().openSettings();
      const state = useUIStore.getState();
      expect(state.settingsOpen).toBe(true);
      expect(state.settingsHighlight).toBeNull();
    });

    it("opens settings and stores the requested highlight section", () => {
      useUIStore.getState().openSettings("bridge-section");
      const state = useUIStore.getState();
      expect(state.settingsOpen).toBe(true);
      expect(state.settingsHighlight).toBe("bridge-section");
    });

    it("overwrites a previous highlight when called again", () => {
      useUIStore.setState({ settingsOpen: true, settingsHighlight: "bridge-section" });
      useUIStore.getState().openSettings();
      expect(useUIStore.getState().settingsHighlight).toBeNull();
    });
  });

  describe("closeSettings", () => {
    it("closes settings and clears any highlight in flight", () => {
      useUIStore.setState({ settingsOpen: true, settingsHighlight: "bridge-section" });
      useUIStore.getState().closeSettings();
      const state = useUIStore.getState();
      expect(state.settingsOpen).toBe(false);
      expect(state.settingsHighlight).toBeNull();
    });
  });

  describe("clearHighlight", () => {
    it("clears the highlight without touching settingsOpen", () => {
      useUIStore.setState({ settingsOpen: true, settingsHighlight: "bridge-section" });
      useUIStore.getState().clearHighlight();
      const state = useUIStore.getState();
      expect(state.settingsHighlight).toBeNull();
      expect(state.settingsOpen).toBe(true);
    });

    it("is a noop when no highlight is set", () => {
      useUIStore.getState().clearHighlight();
      expect(useUIStore.getState().settingsHighlight).toBeNull();
      expect(useUIStore.getState().settingsOpen).toBe(false);
    });
  });

  describe("invariants", () => {
    it("settingsHighlight is null whenever settings is closed via closeSettings", () => {
      useUIStore.getState().openSettings("bridge-section");
      useUIStore.getState().closeSettings();
      expect(useUIStore.getState().settingsHighlight).toBeNull();
    });

    it("does not persist across reloads (no persist middleware)", () => {
      useUIStore.getState().openSettings("bridge-section");
      expect(localStorage.getItem("composer-ui")).toBeNull();
    });
  });
});
