import { describe, expect, it } from "vitest";
import type { LyricLine } from "@/domain/line/model";
import { reconcileLine } from "@/domain/line/model";
import { useProjectStore } from "@/stores/project";
import { createGroup } from "@/test/factories";
import { render } from "@/test/render";
import { ConfirmModalHost } from "@/ui/confirm-modal";
import { EditPanel } from "@/views/edit";

// -- Helpers ------------------------------------------------------------------

function setTextareaValue(textarea: HTMLTextAreaElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function linkedProjectLines(): LyricLine[] {
  return [
    reconcileLine({ id: "a0", text: "Verse one", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 0 }),
    reconcileLine({ id: "a1", text: "Verse two", agentId: "v1", groupId: "g1", instanceIdx: 0, templateLineIdx: 1 }),
    reconcileLine({ id: "b0", text: "Verse one", agentId: "v1", groupId: "g1", instanceIdx: 1, templateLineIdx: 0 }),
    reconcileLine({ id: "b1", text: "Verse two", agentId: "v1", groupId: "g1", instanceIdx: 1, templateLineIdx: 1 }),
  ];
}

// -- Tests --------------------------------------------------------------------

describe("editor detach-confirm undo", () => {
  it("commits a detach as one undo entry restoring lines and groups", async () => {
    useProjectStore.setState({
      lines: linkedProjectLines(),
      groups: [createGroup({ id: "g1", label: "Chorus" })],
    });
    const screen = await render(
      <>
        <EditPanel />
        <ConfirmModalHost />
      </>,
    );
    const textarea = screen.container.querySelector("textarea") as HTMLTextAreaElement;

    setTextareaValue(textarea, "Verse one\nVerse two\nVerse one");

    const confirmButton = screen.getByRole("button", { name: "Detach and apply" });
    await expect.element(confirmButton).toBeInTheDocument();
    await confirmButton.click();

    await expect
      .poll(() => useProjectStore.getState().lines.map((l) => l.text))
      .toEqual(["Verse one", "Verse two", "Verse one"]);
    expect(useProjectStore.getState().lines.some((l) => l.instanceIdx === 1)).toBe(false);

    useProjectStore.getState().undo();
    await expect.poll(() => useProjectStore.getState().lines.length).toBe(4);
    expect(useProjectStore.getState().lines.filter((l) => l.instanceIdx === 1)).toHaveLength(2);
    expect(useProjectStore.getState().groups.map((g) => g.id)).toEqual(["g1"]);
    await expect.poll(() => textarea.value).toBe("Verse one\nVerse two\nVerse one\nVerse two");
  });
});
