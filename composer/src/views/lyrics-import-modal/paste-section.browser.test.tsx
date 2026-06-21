import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { userEvent } from "vitest/browser";
import { PasteSection } from "@/views/lyrics-import-modal/paste-section";
import { render } from "@/test/render";

// -- Helpers ------------------------------------------------------------------

function noop() {}

const Controlled: React.FC<{
  initial?: string;
  onChangeSpy?: (value: string) => void;
  onSwitchToSearch?: () => void;
  onSwitchToUpload?: () => void;
}> = ({ initial = "", onChangeSpy, onSwitchToSearch = noop, onSwitchToUpload = noop }) => {
  const [value, setValue] = useState(initial);
  return (
    <PasteSection
      value={value}
      onChange={(next) => {
        setValue(next);
        onChangeSpy?.(next);
      }}
      onSwitchToSearch={onSwitchToSearch}
      onSwitchToUpload={onSwitchToUpload}
    />
  );
};

// -- Tests --------------------------------------------------------------------

describe("PasteSection", () => {
  it("renders the textarea with the expected placeholder", async () => {
    const screen = await render(<Controlled />);
    const textarea = screen.getByLabelText("Lyrics text");
    await expect.element(textarea).toBeInTheDocument();
    expect((textarea.element() as HTMLTextAreaElement).placeholder).toMatch(/Paste lyrics here/i);
  });

  it("autofocuses the textarea on mount", async () => {
    await render(<Controlled />);
    const textarea = document.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();
    await expect.poll(() => document.activeElement).toBe(textarea);
  });

  it("updates the textarea when the user types", async () => {
    await render(<Controlled />);
    const textarea = document.querySelector("textarea") as HTMLTextAreaElement;
    textarea.focus();
    await userEvent.fill(textarea, "Hello world");
    expect(textarea.value).toBe("Hello world");
  });

  it("displays the line count for multi-line text", async () => {
    await render(<Controlled />);
    const textarea = document.querySelector("textarea") as HTMLTextAreaElement;
    textarea.focus();
    await userEvent.fill(textarea, "line one\nline two\nline three");
    expect(document.body.textContent).toContain("3 lines");
  });

  it("uses singular form for one line", async () => {
    await render(<Controlled />);
    const textarea = document.querySelector("textarea") as HTMLTextAreaElement;
    textarea.focus();
    await userEvent.fill(textarea, "only line");
    expect(document.body.textContent).toContain("1 line");
    expect(document.body.textContent).not.toContain("1 lines");
  });

  it("does not show a line count when text is empty", async () => {
    await render(<Controlled />);
    expect(document.body.textContent).not.toMatch(/\d line/);
  });

  it("renders the syllable split hint", async () => {
    const screen = await render(<Controlled />);
    await expect.element(screen.getByText(/split syllables/i)).toBeInTheDocument();
  });

  it("invokes onChange for each typed character", async () => {
    const onChange = vi.fn();
    await render(<Controlled onChangeSpy={onChange} />);
    const textarea = document.querySelector("textarea") as HTMLTextAreaElement;
    textarea.focus();
    await userEvent.fill(textarea, "First lyric\nSecond lyric");
    expect(onChange).toHaveBeenCalled();
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
    expect(lastCall[0]).toBe("First lyric\nSecond lyric");
  });

  it("renders the controlled value passed in", async () => {
    await render(<Controlled initial="Prefilled text" />);
    const textarea = document.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea.value).toBe("Prefilled text");
    expect(document.body.textContent).toContain("1 line");
  });

  it("Enter inside textarea inserts a newline", async () => {
    await render(<Controlled />);
    const textarea = document.querySelector("textarea") as HTMLTextAreaElement;
    textarea.focus();
    await userEvent.fill(textarea, "first");
    await userEvent.keyboard("{Enter}second");
    expect(textarea.value).toBe("first\nsecond");
  });

  it("calls onSwitchToSearch when Back to search is clicked", async () => {
    const onSwitchToSearch = vi.fn();
    const screen = await render(<Controlled onSwitchToSearch={onSwitchToSearch} />);
    await screen.getByRole("button", { name: /Back to search/i }).click();
    expect(onSwitchToSearch).toHaveBeenCalledTimes(1);
  });

  it("calls onSwitchToUpload when Switch to upload is clicked", async () => {
    const onSwitchToUpload = vi.fn();
    const screen = await render(<Controlled onSwitchToUpload={onSwitchToUpload} />);
    await screen.getByRole("button", { name: /upload/i }).click();
    expect(onSwitchToUpload).toHaveBeenCalledTimes(1);
  });

  it("stops keydown events on the textarea from bubbling to ancestor handlers", async () => {
    const parentKeydown = vi.fn();
    document.addEventListener("keydown", parentKeydown);
    try {
      await render(<Controlled />);
      const textarea = document.querySelector("textarea") as HTMLTextAreaElement;
      textarea.focus();
      await userEvent.keyboard("M");
      expect(parentKeydown).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", parentKeydown);
    }
  });

  it("renders large pasted text without crashing", async () => {
    await render(<Controlled />);
    const textarea = document.querySelector("textarea") as HTMLTextAreaElement;
    const large = "a".repeat(10000);
    textarea.focus();
    await userEvent.fill(textarea, large);
    expect(textarea.value.length).toBe(10000);
  });

  it("exposes the textarea via an accessible name", async () => {
    const screen = await render(<Controlled />);
    await expect.element(screen.getByRole("textbox", { name: "Lyrics text" })).toBeInTheDocument();
  });
});
