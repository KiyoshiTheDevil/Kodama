import { describe, expect, it } from "vitest";
import { useProjectStore } from "@/stores/project";
import { createLine } from "@/test/factories";
import { render } from "@/test/render";
import { EditPanel } from "@/views/edit";

// -- Helpers ------------------------------------------------------------------

function setTextareaValue(textarea: HTMLTextAreaElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function previewMainTexts(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[data-testid="line-preview-text"]')].map((el) => el.textContent ?? "");
}

// -- Tests --------------------------------------------------------------------

describe("editor undo run finalization lifecycle", () => {
  it("finalizes a typing run after the idle debounce with no blur", async () => {
    useProjectStore.setState({ lines: [createLine({ id: "l1", text: "Hello" })] });
    const screen = await render(<EditPanel />);
    const textarea = screen.container.querySelector("textarea") as HTMLTextAreaElement;

    setTextareaValue(textarea, "Hello world");
    await expect.poll(() => useProjectStore.getState().lines[0].text).toBe("Hello world");

    await expect.poll(() => useProjectStore.getState().canUndo(), { timeout: 2000 }).toBe(true);

    useProjectStore.getState().undo();
    await expect.poll(() => useProjectStore.getState().lines[0].text).toBe("Hello");
    await expect.poll(() => textarea.value).toBe("Hello");
    await expect.poll(() => previewMainTexts(screen.container)).toEqual(["Hello"]);
  });

  it("finalizes a pending typing run when the editor unmounts", async () => {
    useProjectStore.setState({ lines: [createLine({ id: "l1", text: "Hello" })] });
    const screen = await render(<EditPanel />);
    const textarea = screen.container.querySelector("textarea") as HTMLTextAreaElement;

    setTextareaValue(textarea, "Hello there");
    await expect.poll(() => useProjectStore.getState().lines[0].text).toBe("Hello there");

    await screen.unmount();

    expect(useProjectStore.getState().canUndo()).toBe(true);

    useProjectStore.getState().undo();
    expect(useProjectStore.getState().lines[0].text).toBe("Hello");
  });
});
