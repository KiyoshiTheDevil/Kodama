/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it } from "vitest";
import { useConfirmStore } from "@/stores/confirm-store";
import { useSettingsStore } from "@/stores/settings";

beforeEach(() => {
  useConfirmStore.setState({ isOpen: false, options: null, resolve: null, queue: [] });
  useSettingsStore.setState({
    confirmReplaceProjectFromHash: true,
    confirmReplaceLyrics: true,
    confirmSyncReset: true,
    confirmClearProject: true,
    confirmResetSettings: true,
    confirmResetShortcuts: true,
    confirmGroupDissolution: true,
  });
});

describe("confirm-store", () => {
  it("opens immediately when no modal is active", () => {
    useConfirmStore.getState().open({ title: "first" });
    expect(useConfirmStore.getState().isOpen).toBe(true);
    expect(useConfirmStore.getState().options?.title).toBe("first");
    expect(useConfirmStore.getState().queue).toHaveLength(0);
  });

  it("queues a second open while the first is active and resolves both in FIFO order", async () => {
    const p1 = useConfirmStore.getState().open({ title: "first" });
    const p2 = useConfirmStore.getState().open({ title: "second" });

    expect(useConfirmStore.getState().options?.title).toBe("first");
    expect(useConfirmStore.getState().queue).toHaveLength(1);

    useConfirmStore.getState().resolveAndClose(true, false);

    expect(await p1).toBe(true);
    // Second modal now active
    expect(useConfirmStore.getState().isOpen).toBe(true);
    expect(useConfirmStore.getState().options?.title).toBe("second");
    expect(useConfirmStore.getState().queue).toHaveLength(0);

    useConfirmStore.getState().resolveAndClose(false, false);
    expect(await p2).toBe(false);
    expect(useConfirmStore.getState().isOpen).toBe(false);
  });

  it("queues several stacked opens and drains them all in order", async () => {
    const p1 = useConfirmStore.getState().open({ title: "1" });
    const p2 = useConfirmStore.getState().open({ title: "2" });
    const p3 = useConfirmStore.getState().open({ title: "3" });

    expect(useConfirmStore.getState().queue).toHaveLength(2);

    useConfirmStore.getState().resolveAndClose(true, false);
    expect(await p1).toBe(true);
    expect(useConfirmStore.getState().options?.title).toBe("2");

    useConfirmStore.getState().resolveAndClose(true, false);
    expect(await p2).toBe(true);
    expect(useConfirmStore.getState().options?.title).toBe("3");

    useConfirmStore.getState().resolveAndClose(true, false);
    expect(await p3).toBe(true);
    expect(useConfirmStore.getState().isOpen).toBe(false);
  });

  it("auto-resolves true when settingsKey is disabled (no modal pops at all)", async () => {
    useSettingsStore.setState({ confirmGroupDissolution: false });
    const result = await useConfirmStore
      .getState()
      .open({ title: "delete group", settingsKey: "confirmGroupDissolution" });
    expect(result).toBe(true);
    expect(useConfirmStore.getState().isOpen).toBe(false);
  });

  it("queued entry that gets auto-skipped (settings key off) doesn't block subsequent queued entries", async () => {
    const p1 = useConfirmStore.getState().open({ title: "live" });
    const p2 = useConfirmStore.getState().open({ title: "auto", settingsKey: "confirmGroupDissolution" });
    const p3 = useConfirmStore.getState().open({ title: "live again" });

    // Disable the gate while p2 is still queued
    useSettingsStore.setState({ confirmGroupDissolution: false });

    useConfirmStore.getState().resolveAndClose(true, false);
    expect(await p1).toBe(true);
    // p2 should auto-resolve true and p3 should open
    expect(await p2).toBe(true);
    // give microtask a chance to drain
    await Promise.resolve();
    await Promise.resolve();
    expect(useConfirmStore.getState().options?.title).toBe("live again");

    useConfirmStore.getState().resolveAndClose(false, false);
    expect(await p3).toBe(false);
  });

  it("dontAskAgain on a non-cancel resolution writes the settings key", async () => {
    const p = useConfirmStore.getState().open({ title: "x", settingsKey: "confirmGroupDissolution" });
    useConfirmStore.getState().resolveAndClose(true, true);
    expect(await p).toBe(true);
    expect(useSettingsStore.getState().confirmGroupDissolution).toBe(false);
  });

  it("dontAskAgain on a cancel resolution does NOT write the settings key", async () => {
    const p = useConfirmStore.getState().open({ title: "x", settingsKey: "confirmGroupDissolution" });
    useConfirmStore.getState().resolveAndClose(false, true);
    expect(await p).toBe(false);
    expect(useSettingsStore.getState().confirmGroupDissolution).toBe(true);
  });

  it("drains consecutive auto-skip queued entries without opening any of them as a modal", async () => {
    const p1 = useConfirmStore.getState().open({ title: "live" });
    const p2 = useConfirmStore.getState().open({ title: "auto-1", settingsKey: "confirmGroupDissolution" });
    const p3 = useConfirmStore.getState().open({ title: "auto-2", settingsKey: "confirmGroupDissolution" });
    const p4 = useConfirmStore.getState().open({ title: "auto-3", settingsKey: "confirmGroupDissolution" });

    useSettingsStore.setState({ confirmGroupDissolution: false });

    useConfirmStore.getState().resolveAndClose(true, false);

    expect(await p1).toBe(true);
    expect(await p2).toBe(true);
    expect(await p3).toBe(true);
    expect(await p4).toBe(true);
    expect(useConfirmStore.getState().isOpen).toBe(false);
    expect(useConfirmStore.getState().queue).toHaveLength(0);
  });

  it("drains a mix of auto-skip and live entries, opening only the live ones", async () => {
    const p1 = useConfirmStore.getState().open({ title: "live-1" });
    const p2 = useConfirmStore.getState().open({ title: "auto-a", settingsKey: "confirmGroupDissolution" });
    const p3 = useConfirmStore.getState().open({ title: "auto-b", settingsKey: "confirmGroupDissolution" });
    const p4 = useConfirmStore.getState().open({ title: "live-2" });

    useSettingsStore.setState({ confirmGroupDissolution: false });

    useConfirmStore.getState().resolveAndClose(true, false);
    expect(await p1).toBe(true);
    expect(await p2).toBe(true);
    expect(await p3).toBe(true);
    expect(useConfirmStore.getState().isOpen).toBe(true);
    expect(useConfirmStore.getState().options?.title).toBe("live-2");

    useConfirmStore.getState().resolveAndClose(false, false);
    expect(await p4).toBe(false);
    expect(useConfirmStore.getState().isOpen).toBe(false);
  });
});
