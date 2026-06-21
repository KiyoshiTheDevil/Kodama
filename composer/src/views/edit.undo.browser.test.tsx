import { beforeEach, describe, expect, it } from "vitest";
import { useModalStackStore } from "@/stores/modal-stack";
import { useProjectStore } from "@/stores/project";
import { useSettingsStore } from "@/stores/settings";
import { createLine } from "@/test/factories";
import { render } from "@/test/render";
import { EditPanel } from "@/views/edit";

// -- Helpers ------------------------------------------------------------------

function setTextareaValue(textarea: HTMLTextAreaElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function pasteIntoTextarea(textarea: HTMLTextAreaElement, value: string): void {
  textarea.focus();
  textarea.dispatchEvent(new Event("paste", { bubbles: true, cancelable: true }));
  setTextareaValue(textarea, value);
}

function previewMainTexts(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[data-testid="line-preview-text"]')].map((el) => el.textContent ?? "");
}

function blurTextarea(textarea: HTMLTextAreaElement): void {
  textarea.focus();
  textarea.blur();
}

function pressUndo(textarea: HTMLTextAreaElement, opts: { ctrl?: boolean } = {}): void {
  textarea.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "z",
      code: "KeyZ",
      metaKey: !opts.ctrl,
      ctrlKey: opts.ctrl ?? false,
      bubbles: true,
      cancelable: true,
    }),
  );
}

function pressRedo(textarea: HTMLTextAreaElement, opts: { ctrlY?: boolean } = {}): void {
  const init: KeyboardEventInit = opts.ctrlY
    ? { key: "y", code: "KeyY", ctrlKey: true }
    : { key: "z", code: "KeyZ", metaKey: true, shiftKey: true };
  textarea.dispatchEvent(new KeyboardEvent("keydown", { ...init, bubbles: true, cancelable: true }));
}

function dispatchWindowUndo(opts: { ctrl?: boolean } = {}): KeyboardEvent {
  const event = new KeyboardEvent("keydown", {
    key: "z",
    code: "KeyZ",
    metaKey: !opts.ctrl,
    ctrlKey: opts.ctrl ?? false,
    bubbles: true,
    cancelable: true,
  });
  window.dispatchEvent(event);
  return event;
}

function dispatchWindowRedo(opts: { ctrlY?: boolean } = {}): KeyboardEvent {
  const init: KeyboardEventInit = opts.ctrlY
    ? { key: "y", code: "KeyY", ctrlKey: true }
    : { key: "z", code: "KeyZ", metaKey: true, shiftKey: true };
  const event = new KeyboardEvent("keydown", { ...init, bubbles: true, cancelable: true });
  window.dispatchEvent(event);
  return event;
}

async function openAgentNameInput(screen: Awaited<ReturnType<typeof render>>): Promise<HTMLInputElement> {
  await screen.getByRole("button", { name: /Add/ }).click();
  const input = screen.getByPlaceholder("Agent name");
  await expect.element(input).toBeInTheDocument();
  return input.element() as HTMLInputElement;
}

// -- Tests --------------------------------------------------------------------

describe("editor undo and redo", () => {
  beforeEach(() => {
    useProjectStore.setState({ activeTab: "edit" });
  });

  it("reverts a typing run on blur then undo, and redo restores it", async () => {
    useProjectStore.setState({ lines: [createLine({ id: "l1", text: "Hello" })] });
    const screen = await render(<EditPanel />);
    const textarea = screen.container.querySelector("textarea") as HTMLTextAreaElement;

    setTextareaValue(textarea, "Hello world");
    await expect.poll(() => useProjectStore.getState().lines[0].text).toBe("Hello world");

    blurTextarea(textarea);

    useProjectStore.getState().undo();
    await expect.poll(() => useProjectStore.getState().lines[0].text).toBe("Hello");
    await expect.poll(() => textarea.value).toBe("Hello");
    await expect.poll(() => previewMainTexts(screen.container)).toEqual(["Hello"]);

    useProjectStore.getState().redo();
    await expect.poll(() => useProjectStore.getState().lines[0].text).toBe("Hello world");
    await expect.poll(() => textarea.value).toBe("Hello world");
    await expect.poll(() => previewMainTexts(screen.container)).toEqual(["Hello world"]);
  });

  it("reverts a typing run in one step on Cmd+Z", async () => {
    useProjectStore.setState({ lines: [createLine({ id: "l1", text: "Hello" })] });
    const screen = await render(<EditPanel />);
    const textarea = screen.container.querySelector("textarea") as HTMLTextAreaElement;

    setTextareaValue(textarea, "Hello there");
    await expect.poll(() => useProjectStore.getState().lines[0].text).toBe("Hello there");

    pressUndo(textarea);
    await expect.poll(() => useProjectStore.getState().lines[0].text).toBe("Hello");
    await expect.poll(() => textarea.value).toBe("Hello");
  });

  it("reverts a typing run on Ctrl+Z", async () => {
    useProjectStore.setState({ lines: [createLine({ id: "l1", text: "Hello" })] });
    const screen = await render(<EditPanel />);
    const textarea = screen.container.querySelector("textarea") as HTMLTextAreaElement;

    setTextareaValue(textarea, "Hello again");
    await expect.poll(() => useProjectStore.getState().lines[0].text).toBe("Hello again");

    pressUndo(textarea, { ctrl: true });
    await expect.poll(() => useProjectStore.getState().lines[0].text).toBe("Hello");
    await expect.poll(() => textarea.value).toBe("Hello");
  });

  it("restores via Cmd+Shift+Z after undo", async () => {
    useProjectStore.setState({ lines: [createLine({ id: "l1", text: "Hello" })] });
    const screen = await render(<EditPanel />);
    const textarea = screen.container.querySelector("textarea") as HTMLTextAreaElement;

    setTextareaValue(textarea, "Hello world");
    await expect.poll(() => useProjectStore.getState().lines[0].text).toBe("Hello world");

    pressUndo(textarea);
    await expect.poll(() => useProjectStore.getState().lines[0].text).toBe("Hello");

    pressRedo(textarea);
    await expect.poll(() => useProjectStore.getState().lines[0].text).toBe("Hello world");
    await expect.poll(() => textarea.value).toBe("Hello world");
  });

  it("restores via Ctrl+Y after undo", async () => {
    useProjectStore.setState({ lines: [createLine({ id: "l1", text: "Hello" })] });
    const screen = await render(<EditPanel />);
    const textarea = screen.container.querySelector("textarea") as HTMLTextAreaElement;

    setTextareaValue(textarea, "Hello world");
    await expect.poll(() => useProjectStore.getState().lines[0].text).toBe("Hello world");

    pressUndo(textarea);
    await expect.poll(() => useProjectStore.getState().lines[0].text).toBe("Hello");

    pressRedo(textarea, { ctrlY: true });
    await expect.poll(() => useProjectStore.getState().lines[0].text).toBe("Hello world");
    await expect.poll(() => textarea.value).toBe("Hello world");
  });

  it("reverts an entire paste as one undo entry", async () => {
    useSettingsStore.setState({ autoExtractBackgroundVocals: false });
    useProjectStore.setState({ lines: [] });
    const screen = await render(<EditPanel />);
    const textarea = screen.container.querySelector("textarea") as HTMLTextAreaElement;

    pasteIntoTextarea(textarea, "First line\nSecond line\nThird line");
    await expect
      .poll(() => useProjectStore.getState().lines.map((l) => l.text))
      .toEqual(["First line", "Second line", "Third line"]);

    pressUndo(textarea);
    await expect.poll(() => useProjectStore.getState().lines.length).toBe(0);
    await expect.poll(() => textarea.value).toBe("");
  });

  it("treats a typing run and an immediate paste as two undo entries", async () => {
    useSettingsStore.setState({ autoExtractBackgroundVocals: false });
    useProjectStore.setState({ lines: [createLine({ id: "l1", text: "Start" })] });
    const screen = await render(<EditPanel />);
    const textarea = screen.container.querySelector("textarea") as HTMLTextAreaElement;

    setTextareaValue(textarea, "Start typed");
    await expect.poll(() => useProjectStore.getState().lines[0].text).toBe("Start typed");

    pasteIntoTextarea(textarea, "Start typed\nPasted line");
    await expect
      .poll(() => useProjectStore.getState().lines.map((l) => l.text))
      .toEqual(["Start typed", "Pasted line"]);

    pressUndo(textarea);
    await expect.poll(() => useProjectStore.getState().lines.map((l) => l.text)).toEqual(["Start typed"]);

    pressUndo(textarea);
    await expect.poll(() => useProjectStore.getState().lines.map((l) => l.text)).toEqual(["Start"]);
  });

  it("treats two blurred typing runs as two undo steps", async () => {
    useProjectStore.setState({ lines: [createLine({ id: "l1", text: "A" })] });
    const screen = await render(<EditPanel />);
    const textarea = screen.container.querySelector("textarea") as HTMLTextAreaElement;

    setTextareaValue(textarea, "AB");
    await expect.poll(() => useProjectStore.getState().lines[0].text).toBe("AB");
    blurTextarea(textarea);

    setTextareaValue(textarea, "ABC");
    await expect.poll(() => useProjectStore.getState().lines[0].text).toBe("ABC");
    blurTextarea(textarea);

    pressUndo(textarea);
    await expect.poll(() => useProjectStore.getState().lines[0].text).toBe("AB");

    pressUndo(textarea);
    await expect.poll(() => useProjectStore.getState().lines[0].text).toBe("A");
  });
});

describe("editor undo and redo without textarea focus", () => {
  beforeEach(() => {
    useProjectStore.setState({ activeTab: "edit" });
  });

  it("undoes a history-committed change when focus is outside the textarea", async () => {
    useProjectStore.setState({ lines: [createLine({ id: "l1", text: "Hello", backgroundText: undefined })] });
    const screen = await render(<EditPanel />);
    const textarea = screen.container.querySelector("textarea") as HTMLTextAreaElement;
    blurTextarea(textarea);
    document.body.focus();

    useProjectStore.getState().updateLineWithHistory("l1", { backgroundText: "ooh" });
    await expect.poll(() => useProjectStore.getState().lines[0].backgroundText).toBe("ooh");
    expect(document.activeElement).not.toBe(textarea);

    dispatchWindowUndo();
    await expect.poll(() => useProjectStore.getState().lines[0].backgroundText).toBe(undefined);
  });

  it("undoes via Ctrl+Z on window when focus is outside the textarea", async () => {
    useProjectStore.setState({ lines: [createLine({ id: "l1", text: "Hello" })] });
    const screen = await render(<EditPanel />);
    const textarea = screen.container.querySelector("textarea") as HTMLTextAreaElement;
    blurTextarea(textarea);
    document.body.focus();

    useProjectStore.getState().updateLineWithHistory("l1", { agentId: "v2" });
    await expect.poll(() => useProjectStore.getState().lines[0].agentId).toBe("v2");

    dispatchWindowUndo({ ctrl: true });
    await expect.poll(() => useProjectStore.getState().lines[0].agentId).toBe("v1");
  });

  it("still undoes when the textarea itself is focused", async () => {
    useProjectStore.setState({ lines: [createLine({ id: "l1", text: "Hello" })] });
    const screen = await render(<EditPanel />);
    const textarea = screen.container.querySelector("textarea") as HTMLTextAreaElement;
    textarea.focus();

    useProjectStore.getState().updateLineWithHistory("l1", { agentId: "v3" });
    await expect.poll(() => useProjectStore.getState().lines[0].agentId).toBe("v3");

    dispatchWindowUndo();
    await expect.poll(() => useProjectStore.getState().lines[0].agentId).toBe("v1");
  });

  it("redoes via Cmd+Shift+Z on window when focus is outside the textarea", async () => {
    useProjectStore.setState({ lines: [createLine({ id: "l1", text: "Hello" })] });
    const screen = await render(<EditPanel />);
    const textarea = screen.container.querySelector("textarea") as HTMLTextAreaElement;
    blurTextarea(textarea);
    document.body.focus();

    useProjectStore.getState().updateLineWithHistory("l1", { agentId: "v2" });
    await expect.poll(() => useProjectStore.getState().lines[0].agentId).toBe("v2");

    dispatchWindowUndo();
    await expect.poll(() => useProjectStore.getState().lines[0].agentId).toBe("v1");

    dispatchWindowRedo();
    await expect.poll(() => useProjectStore.getState().lines[0].agentId).toBe("v2");
  });

  it("redoes via Ctrl+Y on window when focus is outside the textarea", async () => {
    useProjectStore.setState({ lines: [createLine({ id: "l1", text: "Hello" })] });
    const screen = await render(<EditPanel />);
    const textarea = screen.container.querySelector("textarea") as HTMLTextAreaElement;
    blurTextarea(textarea);
    document.body.focus();

    useProjectStore.getState().updateLineWithHistory("l1", { agentId: "v2" });
    await expect.poll(() => useProjectStore.getState().lines[0].agentId).toBe("v2");

    dispatchWindowUndo();
    await expect.poll(() => useProjectStore.getState().lines[0].agentId).toBe("v1");

    dispatchWindowRedo({ ctrlY: true });
    await expect.poll(() => useProjectStore.getState().lines[0].agentId).toBe("v2");
  });
});

describe("editor window undo handler gating", () => {
  it("does not undo when the active tab is not edit", async () => {
    useProjectStore.setState({ lines: [createLine({ id: "l1", text: "Hello" })], activeTab: "sync" });
    await render(<EditPanel />);

    useProjectStore.getState().updateLineWithHistory("l1", { agentId: "v2" });
    await expect.poll(() => useProjectStore.getState().lines[0].agentId).toBe("v2");

    const event = dispatchWindowUndo();
    expect(event.defaultPrevented).toBe(false);
    expect(useProjectStore.getState().lines[0].agentId).toBe("v2");
  });

  it("does not undo while a modal is open", async () => {
    useProjectStore.setState({ lines: [createLine({ id: "l1", text: "Hello" })], activeTab: "edit" });
    await render(<EditPanel />);

    useProjectStore.getState().updateLineWithHistory("l1", { agentId: "v2" });
    await expect.poll(() => useProjectStore.getState().lines[0].agentId).toBe("v2");

    useModalStackStore.getState().push();
    const event = dispatchWindowUndo();
    expect(event.defaultPrevented).toBe(false);
    expect(useProjectStore.getState().lines[0].agentId).toBe("v2");
    useModalStackStore.getState().pop();
  });

  it("prevents the browser native undo on a matched Cmd+Z", async () => {
    useProjectStore.setState({ lines: [createLine({ id: "l1", text: "Hello" })], activeTab: "edit" });
    await render(<EditPanel />);

    const event = dispatchWindowUndo();
    expect(event.defaultPrevented).toBe(true);
  });

  it("ignores a non-undo modifier combo on window", async () => {
    useProjectStore.setState({ lines: [createLine({ id: "l1", text: "Hello" })], activeTab: "edit" });
    await render(<EditPanel />);

    const event = new KeyboardEvent("keydown", {
      key: "a",
      code: "KeyA",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("removes the window listener on unmount", async () => {
    useProjectStore.setState({ lines: [createLine({ id: "l1", text: "Hello" })], activeTab: "edit" });
    const screen = await render(<EditPanel />);

    useProjectStore.getState().updateLineWithHistory("l1", { agentId: "v2" });
    await expect.poll(() => useProjectStore.getState().lines[0].agentId).toBe("v2");

    await screen.unmount();

    const event = dispatchWindowUndo();
    expect(event.defaultPrevented).toBe(false);
    expect(useProjectStore.getState().lines[0].agentId).toBe("v2");
  });
});

describe("editor undo handler input exemption", () => {
  beforeEach(() => {
    useProjectStore.setState({ activeTab: "edit" });
  });

  it("does not undo when Cmd+Z is pressed inside a non-lyrics input", async () => {
    useProjectStore.setState({ lines: [createLine({ id: "l1", text: "Hello" })] });
    const screen = await render(<EditPanel />);

    useProjectStore.getState().updateLineWithHistory("l1", { agentId: "v2" });
    await expect.poll(() => useProjectStore.getState().lines[0].agentId).toBe("v2");
    const indexBefore = useProjectStore.getState().historyIndex;

    const input = await openAgentNameInput(screen);
    const event = new KeyboardEvent("keydown", {
      key: "z",
      code: "KeyZ",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(useProjectStore.getState().historyIndex).toBe(indexBefore);
    expect(useProjectStore.getState().lines[0].agentId).toBe("v2");
  });

  it("does not redo when Cmd+Shift+Z is pressed inside a non-lyrics input", async () => {
    useProjectStore.setState({ lines: [createLine({ id: "l1", text: "Hello" })] });
    const screen = await render(<EditPanel />);

    useProjectStore.getState().updateLineWithHistory("l1", { agentId: "v2" });
    await expect.poll(() => useProjectStore.getState().lines[0].agentId).toBe("v2");
    useProjectStore.getState().undo();
    await expect.poll(() => useProjectStore.getState().lines[0].agentId).toBe("v1");
    const indexBefore = useProjectStore.getState().historyIndex;

    const input = await openAgentNameInput(screen);
    const event = new KeyboardEvent("keydown", {
      key: "z",
      code: "KeyZ",
      metaKey: true,
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(useProjectStore.getState().historyIndex).toBe(indexBefore);
    expect(useProjectStore.getState().lines[0].agentId).toBe("v1");
  });

  it("still undoes when Cmd+Z originates from the lyrics textarea", async () => {
    useProjectStore.setState({ lines: [createLine({ id: "l1", text: "Hello" })] });
    const screen = await render(<EditPanel />);
    const textarea = screen.container.querySelector("textarea") as HTMLTextAreaElement;
    textarea.focus();

    useProjectStore.getState().updateLineWithHistory("l1", { agentId: "v2" });
    await expect.poll(() => useProjectStore.getState().lines[0].agentId).toBe("v2");

    const event = new KeyboardEvent("keydown", {
      key: "z",
      code: "KeyZ",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    textarea.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    await expect.poll(() => useProjectStore.getState().lines[0].agentId).toBe("v1");
  });
});

describe("editor undo edge cases", () => {
  beforeEach(() => {
    useProjectStore.setState({ activeTab: "edit" });
  });

  it("does not corrupt text when Cmd+Z runs with nothing to undo", async () => {
    useProjectStore.setState({ lines: [createLine({ id: "l1", text: "Untouched" })] });
    const screen = await render(<EditPanel />);
    const textarea = screen.container.querySelector("textarea") as HTMLTextAreaElement;

    pressUndo(textarea);
    await expect.poll(() => useProjectStore.getState().lines[0].text).toBe("Untouched");
    expect(textarea.value).toBe("Untouched");
  });

  it("does not reintroduce stale text from a prior edit on Cmd+Z", async () => {
    useProjectStore.setState({ lines: [createLine({ id: "l1", text: "Base" })] });
    const screen = await render(<EditPanel />);
    const textarea = screen.container.querySelector("textarea") as HTMLTextAreaElement;

    setTextareaValue(textarea, "Base A");
    await expect.poll(() => useProjectStore.getState().lines[0].text).toBe("Base A");
    blurTextarea(textarea);

    setTextareaValue(textarea, "Base B");
    await expect.poll(() => useProjectStore.getState().lines[0].text).toBe("Base B");
    blurTextarea(textarea);

    pressUndo(textarea);
    await expect.poll(() => useProjectStore.getState().lines[0].text).toBe("Base A");
    await expect.poll(() => textarea.value).toBe("Base A");
  });

  it("passes through a non-modifier keystroke untouched", async () => {
    useProjectStore.setState({ lines: [createLine({ id: "l1", text: "Hello" })] });
    const screen = await render(<EditPanel />);
    const textarea = screen.container.querySelector("textarea") as HTMLTextAreaElement;

    const event = new KeyboardEvent("keydown", { key: "a", code: "KeyA", bubbles: true, cancelable: true });
    textarea.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("passes through a Cmd combo that is not undo or redo", async () => {
    useProjectStore.setState({ lines: [createLine({ id: "l1", text: "Hello" })] });
    const screen = await render(<EditPanel />);
    const textarea = screen.container.querySelector("textarea") as HTMLTextAreaElement;

    const event = new KeyboardEvent("keydown", {
      key: "a",
      code: "KeyA",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    textarea.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("prevents the native textarea undo on Cmd+Z", async () => {
    useProjectStore.setState({ lines: [createLine({ id: "l1", text: "Hello" })] });
    const screen = await render(<EditPanel />);
    const textarea = screen.container.querySelector("textarea") as HTMLTextAreaElement;

    setTextareaValue(textarea, "Hello world");
    await expect.poll(() => useProjectStore.getState().lines[0].text).toBe("Hello world");

    const event = new KeyboardEvent("keydown", {
      key: "z",
      code: "KeyZ",
      metaKey: true,
      bubbles: true,
      cancelable: true,
    });
    textarea.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});
