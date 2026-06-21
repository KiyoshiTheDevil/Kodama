/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it } from "vitest";
import { useDivergenceStore } from "@/stores/divergence-store";
import { useSettingsStore } from "@/stores/settings";

beforeEach(() => {
  useDivergenceStore.setState({ isOpen: false, options: null, resolve: null });
  useSettingsStore.setState({ linkedDivergenceAction: "ask" });
});

describe("divergence-store", () => {
  it("opens the modal when settings preference is 'ask'", async () => {
    const promise = useDivergenceStore.getState().open({ affectedSiblingCount: 2 });
    expect(useDivergenceStore.getState().isOpen).toBe(true);
    expect(useDivergenceStore.getState().options?.affectedSiblingCount).toBe(2);
    useDivergenceStore.getState().resolveAndClose("apply", null);
    expect(await promise).toBe("apply");
    expect(useDivergenceStore.getState().isOpen).toBe(false);
  });

  it("auto-resolves to 'apply' when settings preference is 'apply'", async () => {
    useSettingsStore.setState({ linkedDivergenceAction: "apply" });
    const result = await useDivergenceStore.getState().open({ affectedSiblingCount: 1 });
    expect(result).toBe("apply");
    expect(useDivergenceStore.getState().isOpen).toBe(false);
  });

  it("auto-resolves to 'detach' when settings preference is 'detach'", async () => {
    useSettingsStore.setState({ linkedDivergenceAction: "detach" });
    const result = await useDivergenceStore.getState().open({ affectedSiblingCount: 1 });
    expect(result).toBe("detach");
    expect(useDivergenceStore.getState().isOpen).toBe(false);
  });

  it("persists 'don't ask again' choice to settings when dontAskAgainAs is provided", async () => {
    const promise = useDivergenceStore.getState().open({ affectedSiblingCount: 2 });
    useDivergenceStore.getState().resolveAndClose("apply", "apply");
    await promise;
    expect(useSettingsStore.getState().linkedDivergenceAction).toBe("apply");
  });

  it("does not persist when dontAskAgainAs is null", async () => {
    const promise = useDivergenceStore.getState().open({ affectedSiblingCount: 2 });
    useDivergenceStore.getState().resolveAndClose("apply", null);
    await promise;
    expect(useSettingsStore.getState().linkedDivergenceAction).toBe("ask");
  });

  it("auto-rejects with 'cancel' when a second open is attempted while modal is showing", async () => {
    const first = useDivergenceStore.getState().open({ affectedSiblingCount: 1 });
    const second = useDivergenceStore.getState().open({ affectedSiblingCount: 1 });
    expect(await second).toBe("cancel");
    useDivergenceStore.getState().resolveAndClose("apply", null);
    expect(await first).toBe("apply");
  });
});
