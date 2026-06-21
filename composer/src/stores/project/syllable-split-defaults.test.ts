import { useProjectStore } from "@/stores/project";
import { beforeEach, describe, expect, it } from "vitest";

describe("project.syllableSplitDefaults", () => {
  beforeEach(() => {
    useProjectStore.getState().reset();
  });

  it("starts with both options off", () => {
    expect(useProjectStore.getState().syllableSplitDefaults).toEqual({
      applyToAll: false,
      caseInsensitive: false,
    });
  });

  it("setSyllableSplitDefaults persists the chosen flags", () => {
    useProjectStore.getState().setSyllableSplitDefaults({
      applyToAll: true,
      caseInsensitive: true,
    });
    expect(useProjectStore.getState().syllableSplitDefaults).toEqual({
      applyToAll: true,
      caseInsensitive: true,
    });
  });

  it("setSyllableSplitDefaults marks project dirty", () => {
    useProjectStore.setState({ isDirty: false });
    useProjectStore.getState().setSyllableSplitDefaults({
      applyToAll: true,
      caseInsensitive: false,
    });
    expect(useProjectStore.getState().isDirty).toBe(true);
  });

  it("setSyllableSplitDefaults does NOT touch history", () => {
    const beforeHistory = useProjectStore.getState().history;
    const beforeIndex = useProjectStore.getState().historyIndex;
    useProjectStore.getState().setSyllableSplitDefaults({
      applyToAll: true,
      caseInsensitive: true,
    });
    expect(useProjectStore.getState().history).toBe(beforeHistory);
    expect(useProjectStore.getState().historyIndex).toBe(beforeIndex);
  });

  it("setSyllableSplitDefaults does NOT set isDirtySinceHistory", () => {
    useProjectStore.setState({ isDirtySinceHistory: false });
    useProjectStore.getState().setSyllableSplitDefaults({
      applyToAll: true,
      caseInsensitive: false,
    });
    expect(useProjectStore.getState().isDirtySinceHistory).toBe(false);
  });
});
