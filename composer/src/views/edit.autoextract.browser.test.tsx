import { beforeEach, describe, expect, it } from "vitest";
import { useProjectStore } from "@/stores/project";
import { useSettingsStore } from "@/stores/settings";
import { render } from "@/test/render";
import { EditPanel } from "@/views/edit";

// -- Helpers ------------------------------------------------------------------

function setTextareaValue(textarea: HTMLTextAreaElement, value: string): void {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
}

function blurTextarea(textarea: HTMLTextAreaElement): void {
  textarea.focus();
  textarea.blur();
}

function previewMainTexts(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[data-testid="line-preview-text"]')].map((el) => el.textContent ?? "");
}

function previewBackgroundTexts(container: HTMLElement): string[] {
  return [...container.querySelectorAll('[data-testid="line-preview-background"]')].map((el) => el.textContent ?? "");
}

// -- Tests --------------------------------------------------------------------

describe("auto-extract background vocals on blur", () => {
  beforeEach(() => {
    useProjectStore.setState({ activeTab: "edit" });
    useSettingsStore.setState({ autoExtractBackgroundVocals: true, mergeStandaloneBackgroundLines: true });
  });

  it("extracts inline parentheses when the textarea is blurred", async () => {
    useProjectStore.setState({ lines: [] });
    const screen = await render(<EditPanel />);
    const textarea = screen.container.querySelector("textarea") as HTMLTextAreaElement;

    setTextareaValue(textarea, "Take me home (country roads)");
    await expect
      .poll(() => useProjectStore.getState().lines.map((l) => l.text))
      .toEqual(["Take me home (country roads)"]);

    blurTextarea(textarea);

    await expect.poll(() => useProjectStore.getState().lines[0].text).toBe("Take me home");
    expect(useProjectStore.getState().lines[0].backgroundText).toBe("country roads");
    expect(useProjectStore.getState().lines[0].backgroundTextSource).toBe("extraction");
  });

  it("reflects the extracted result in the textarea and preview after blur", async () => {
    useProjectStore.setState({ lines: [] });
    const screen = await render(<EditPanel />);
    const textarea = screen.container.querySelector("textarea") as HTMLTextAreaElement;

    setTextareaValue(textarea, "Take me home (country roads)");
    blurTextarea(textarea);

    await expect.poll(() => textarea.value).toBe("Take me home");
    await expect.poll(() => previewMainTexts(screen.container)).toEqual(["Take me home"]);
    await expect.poll(() => previewBackgroundTexts(screen.container)).toEqual(["country roads"]);
  });

  it("leaves parentheses literal on blur when the setting is off", async () => {
    useSettingsStore.setState({ autoExtractBackgroundVocals: false });
    useProjectStore.setState({ lines: [] });
    const screen = await render(<EditPanel />);
    const textarea = screen.container.querySelector("textarea") as HTMLTextAreaElement;

    setTextareaValue(textarea, "Take me home (country roads)");
    blurTextarea(textarea);

    await expect.poll(() => useProjectStore.getState().lines[0].text).toBe("Take me home (country roads)");
    expect(useProjectStore.getState().lines[0].backgroundText).toBeUndefined();
    expect(textarea.value).toBe("Take me home (country roads)");
  });

  it("merges a standalone all-parens line into the line above on blur", async () => {
    useProjectStore.setState({ lines: [] });
    const screen = await render(<EditPanel />);
    const textarea = screen.container.querySelector("textarea") as HTMLTextAreaElement;

    setTextareaValue(textarea, "Real lyric line\n(ooh yeah)");
    await expect.poll(() => useProjectStore.getState().lines.length).toBe(2);

    blurTextarea(textarea);

    await expect.poll(() => useProjectStore.getState().lines.length).toBe(1);
    expect(useProjectStore.getState().lines[0].text).toBe("Real lyric line");
    expect(useProjectStore.getState().lines[0].backgroundText).toBe("ooh yeah");
    await expect.poll(() => textarea.value).toBe("Real lyric line");
  });

  it("keeps a standalone all-parens line on blur when merge setting is off", async () => {
    useSettingsStore.setState({ mergeStandaloneBackgroundLines: false });
    useProjectStore.setState({ lines: [] });
    const screen = await render(<EditPanel />);
    const textarea = screen.container.querySelector("textarea") as HTMLTextAreaElement;

    setTextareaValue(textarea, "Real lyric line\n(ooh yeah)");
    blurTextarea(textarea);

    await expect.poll(() => useProjectStore.getState().lines.length).toBe(2);
    expect(useProjectStore.getState().lines[1].text).toBe("(ooh yeah)");
  });
});

describe("auto-extract on blur leaves history untouched when nothing changes", () => {
  beforeEach(() => {
    useProjectStore.setState({ activeTab: "edit" });
    useSettingsStore.setState({ autoExtractBackgroundVocals: true, mergeStandaloneBackgroundLines: true });
  });

  it("adds no history entry when blurring with no parentheses to extract", async () => {
    useProjectStore.setState({ lines: [] });
    const screen = await render(<EditPanel />);
    const textarea = screen.container.querySelector("textarea") as HTMLTextAreaElement;

    setTextareaValue(textarea, "Plain lyric line");
    await expect.poll(() => useProjectStore.getState().lines[0].text).toBe("Plain lyric line");

    blurTextarea(textarea);
    await expect.poll(() => useProjectStore.getState().lines[0].text).toBe("Plain lyric line");
    const afterTypingRunIndex = useProjectStore.getState().historyIndex;

    blurTextarea(textarea);
    expect(useProjectStore.getState().historyIndex).toBe(afterTypingRunIndex);
  });

  it("adds no history entry when blurring with no edits at all", async () => {
    useProjectStore.setState({ lines: [] });
    const screen = await render(<EditPanel />);
    const textarea = screen.container.querySelector("textarea") as HTMLTextAreaElement;

    const beforeIndex = useProjectStore.getState().historyIndex;
    const beforeCanUndo = useProjectStore.getState().canUndo();

    blurTextarea(textarea);

    expect(useProjectStore.getState().historyIndex).toBe(beforeIndex);
    expect(useProjectStore.getState().canUndo()).toBe(beforeCanUndo);
  });
});

describe("undo after auto-extract on blur", () => {
  beforeEach(() => {
    useProjectStore.setState({ activeTab: "edit" });
    useSettingsStore.setState({ autoExtractBackgroundVocals: true, mergeStandaloneBackgroundLines: true });
  });

  it("reverts the extraction on the first undo and the typing on the second", async () => {
    useProjectStore.setState({ lines: [] });
    const screen = await render(<EditPanel />);
    const textarea = screen.container.querySelector("textarea") as HTMLTextAreaElement;

    setTextareaValue(textarea, "Take me home (country roads)");
    await expect.poll(() => useProjectStore.getState().lines[0].text).toBe("Take me home (country roads)");

    blurTextarea(textarea);
    await expect.poll(() => useProjectStore.getState().lines[0].text).toBe("Take me home");

    useProjectStore.getState().undo();
    await expect.poll(() => useProjectStore.getState().lines[0].text).toBe("Take me home (country roads)");
    expect(useProjectStore.getState().lines[0].backgroundText).toBeUndefined();

    useProjectStore.getState().undo();
    await expect.poll(() => useProjectStore.getState().lines.length).toBe(0);
  });

  it("restores the extraction on redo", async () => {
    useProjectStore.setState({ lines: [] });
    const screen = await render(<EditPanel />);
    const textarea = screen.container.querySelector("textarea") as HTMLTextAreaElement;

    setTextareaValue(textarea, "Take me home (country roads)");
    blurTextarea(textarea);
    await expect.poll(() => useProjectStore.getState().lines[0].text).toBe("Take me home");

    useProjectStore.getState().undo();
    await expect.poll(() => useProjectStore.getState().lines[0].text).toBe("Take me home (country roads)");

    useProjectStore.getState().redo();
    await expect.poll(() => useProjectStore.getState().lines[0].text).toBe("Take me home");
    expect(useProjectStore.getState().lines[0].backgroundText).toBe("country roads");
  });
});

describe("auto-extract on blur preserves existing blur behavior", () => {
  beforeEach(() => {
    useProjectStore.setState({ activeTab: "edit" });
    useSettingsStore.setState({ autoExtractBackgroundVocals: true, mergeStandaloneBackgroundLines: true });
  });

  it("still finalizes a pending typing run as its own undo step", async () => {
    useProjectStore.setState({ lines: [] });
    const screen = await render(<EditPanel />);
    const textarea = screen.container.querySelector("textarea") as HTMLTextAreaElement;

    setTextareaValue(textarea, "Plain lyric line");
    await expect.poll(() => useProjectStore.getState().lines[0].text).toBe("Plain lyric line");

    blurTextarea(textarea);

    useProjectStore.getState().undo();
    await expect.poll(() => useProjectStore.getState().lines.length).toBe(0);
  });
});
