/**
 * @vitest-environment node
 */
import { useConfirmStore } from "@/stores/confirm-store";
import { useProjectStore } from "@/stores/project";
import { useSettingsStore } from "@/stores/settings";
import type { ReactNode } from "react";
import { toast } from "sonner";
import { beforeEach, describe, expect, it } from "vitest";
import { deleteGroupWithConfirm } from "./delete-group-with-confirm";

beforeEach(() => {
  useProjectStore.getState().reset();
  useProjectStore.getState().clearHistory();
  useConfirmStore.setState({ isOpen: false, options: null, resolve: null, queue: [] });
  useSettingsStore.setState({ confirmGroupDissolution: true });
});

function seedChorusGroup() {
  useProjectStore.setState({
    groups: [{ id: "g1", label: "Chorus", color: "#f472b6", templateVersion: 1 }],
    lines: [
      {
        id: "a0",
        text: "I love you",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 0,
        templateLineIdx: 0,
        words: [
          { text: "I ", begin: 30, end: 30.4 },
          { text: "love ", begin: 30.4, end: 30.8 },
          { text: "you", begin: 30.8, end: 31.2 },
        ],
      },
      {
        id: "a1",
        text: "I love you",
        agentId: "v1",
        groupId: "g1",
        instanceIdx: 1,
        templateLineIdx: 0,
        words: [
          { text: "I ", begin: 60, end: 60.4 },
          { text: "love ", begin: 60.4, end: 60.8 },
          { text: "you", begin: 60.8, end: 61.2 },
        ],
      },
    ],
  });
}

function descriptionText(): string {
  const description = useConfirmStore.getState().options?.description as ReactNode;
  return typeof description === "string" ? description : "";
}

function groupDeletedToastCountSince(baseline: number): number {
  return toast
    .getHistory()
    .slice(baseline)
    .filter((entry) => "title" in entry && entry.title === "Group deleted").length;
}

describe("deleteGroupWithConfirm · confirm accepted", () => {
  it("removes the group and clears group fields on its lines", async () => {
    seedChorusGroup();

    const done = deleteGroupWithConfirm({ groupId: "g1", groupLabel: "Chorus", instanceCount: 2 });
    useConfirmStore.getState().resolveAndClose(true, false);
    await done;

    expect(useProjectStore.getState().groups).toHaveLength(0);
    expect(useProjectStore.getState().lines.find((l) => l.id === "a0")?.groupId).toBeUndefined();
    expect(useProjectStore.getState().lines.find((l) => l.id === "a1")?.instanceIdx).toBeUndefined();
  });

  it("fires a group-action toast announcing the deletion", async () => {
    seedChorusGroup();
    const baseline = toast.getHistory().length;

    const done = deleteGroupWithConfirm({ groupId: "g1", groupLabel: "Chorus", instanceCount: 2 });
    useConfirmStore.getState().resolveAndClose(true, false);
    await done;

    expect(groupDeletedToastCountSince(baseline)).toBe(1);
  });

  it("keeps the lines' text and timing intact after dissolving the group", async () => {
    seedChorusGroup();

    const done = deleteGroupWithConfirm({ groupId: "g1", groupLabel: "Chorus", instanceCount: 2 });
    useConfirmStore.getState().resolveAndClose(true, false);
    await done;

    const a0 = useProjectStore.getState().lines.find((l) => l.id === "a0");
    expect(a0?.text).toBe("I love you");
    expect(a0?.words?.[0].begin).toBe(30);
    expect(a0?.words?.[2].end).toBe(31.2);
  });

  it("closes the confirm modal once resolved", async () => {
    seedChorusGroup();

    const done = deleteGroupWithConfirm({ groupId: "g1", groupLabel: "Chorus", instanceCount: 2 });
    expect(useConfirmStore.getState().isOpen).toBe(true);

    useConfirmStore.getState().resolveAndClose(true, false);
    await done;

    expect(useConfirmStore.getState().isOpen).toBe(false);
  });
});

describe("deleteGroupWithConfirm · confirm cancelled", () => {
  it("leaves the group and its lines untouched and fires no toast", async () => {
    seedChorusGroup();
    const before = useProjectStore.getState().lines;
    const baseline = toast.getHistory().length;

    const done = deleteGroupWithConfirm({ groupId: "g1", groupLabel: "Chorus", instanceCount: 2 });
    useConfirmStore.getState().resolveAndClose(false, false);
    await done;

    expect(useProjectStore.getState().groups).toHaveLength(1);
    expect(useProjectStore.getState().lines).toEqual(before);
    expect(useProjectStore.getState().lines.find((l) => l.id === "a0")?.groupId).toBe("g1");
    expect(groupDeletedToastCountSince(baseline)).toBe(0);
  });
});

describe("deleteGroupWithConfirm · confirm options", () => {
  it("opens a destructive, recoverable confirm gated on confirmGroupDissolution", () => {
    seedChorusGroup();

    void deleteGroupWithConfirm({ groupId: "g1", groupLabel: "Chorus", instanceCount: 2 });

    const options = useConfirmStore.getState().options;
    expect(options?.title).toBe('Delete the "Chorus" group?');
    expect(options?.confirmLabel).toBe("Delete group");
    expect(options?.variant).toBe("destructive");
    expect(options?.settingsKey).toBe("confirmGroupDissolution");
    expect(options?.recoverable).toBe(true);

    useConfirmStore.getState().resolveAndClose(false, false);
  });

  it("uses singular wording when instanceCount is 1", () => {
    seedChorusGroup();

    void deleteGroupWithConfirm({ groupId: "g1", groupLabel: "Chorus", instanceCount: 1 });

    expect(descriptionText()).toContain("All 1 instance will become standalone lines.");

    useConfirmStore.getState().resolveAndClose(false, false);
  });

  it("uses plural wording when instanceCount is greater than 1", () => {
    seedChorusGroup();

    void deleteGroupWithConfirm({ groupId: "g1", groupLabel: "Chorus", instanceCount: 3 });

    expect(descriptionText()).toContain("All 3 instances will become standalone lines.");

    useConfirmStore.getState().resolveAndClose(false, false);
  });
});
