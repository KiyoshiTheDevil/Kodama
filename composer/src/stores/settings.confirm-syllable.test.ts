import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULTS, useSettingsStore } from "@/stores/settings";

describe("settings.confirmApplyToAllSyllableSplit", () => {
  beforeEach(() => {
    useSettingsStore.setState({ ...DEFAULTS });
  });

  it("defaults to true", () => {
    expect(useSettingsStore.getState().confirmApplyToAllSyllableSplit).toBe(true);
  });

  it("can be toggled via set()", () => {
    useSettingsStore.getState().set("confirmApplyToAllSyllableSplit", false);
    expect(useSettingsStore.getState().confirmApplyToAllSyllableSplit).toBe(false);
  });

  it("resetToDefaults preserves the user's choice", () => {
    useSettingsStore.getState().set("confirmApplyToAllSyllableSplit", false);
    useSettingsStore.getState().resetToDefaults();
    expect(useSettingsStore.getState().confirmApplyToAllSyllableSplit).toBe(false);
  });

  it("is persisted to localStorage", () => {
    useSettingsStore.setState({ confirmApplyToAllSyllableSplit: false });
    const raw = localStorage.getItem("composer-settings");
    expect(raw).not.toBeNull();
    const persisted = JSON.parse(raw ?? "{}");
    expect(persisted.state.confirmApplyToAllSyllableSplit).toBe(false);
  });
});
