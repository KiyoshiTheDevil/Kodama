import { describe, expect, it } from "vitest";
import { SyllableSplitter } from "@/views/sync/syllable-splitter";
import type { WordTiming } from "@/domain/word/timing";
import { render } from "@/test/render";

const SINGLE_CHAR: WordTiming = { text: "a", begin: 0, end: 1 };
const MULTI_CHAR: WordTiming = { text: "hello", begin: 0, end: 1 };

describe("SyllableSplitter", () => {
  it("renders nothing for single-character words", async () => {
    const screen = await render(
      <SyllableSplitter lineId="test-line" type="word" word={SINGLE_CHAR} wordIndex={0} onSplit={() => {}} />,
    );
    expect(screen.container.querySelector("button")).toBeNull();
  });

  it("renders the scissor trigger for multi-character words", async () => {
    const screen = await render(
      <SyllableSplitter lineId="test-line" type="word" word={MULTI_CHAR} wordIndex={0} onSplit={() => {}} />,
    );
    expect(screen.container.querySelector("button")).not.toBeNull();
  });

  it("opens a popover with character split points when clicked", async () => {
    const screen = await render(
      <SyllableSplitter lineId="test-line" type="word" word={MULTI_CHAR} wordIndex={0} onSplit={() => {}} />,
    );
    await screen.getByRole("button", { name: /Split into syllables/i }).click();
    await expect.element(screen.getByText(/Click between letters/)).toBeInTheDocument();
    const splitButtons = document.querySelectorAll("button");
    expect(splitButtons.length).toBeGreaterThan(2);
  });

  it("emits split words when a split point is toggled and Split Word is clicked", async () => {
    let splits: WordTiming[] | null = null;
    const screen = await render(
      <SyllableSplitter
        lineId="test-line"
        type="word"
        word={{ text: "abcd", begin: 0, end: 1 }}
        wordIndex={0}
        onSplit={(_, words) => {
          splits = words;
        }}
      />,
    );
    await screen.getByRole("button", { name: /Split into syllables/i }).click();
    await screen.getByRole("button", { name: "Split point 1" }).click();
    await screen.getByRole("button", { name: "Split Word" }).click();
    expect(splits).not.toBeNull();
    expect((splits as unknown as WordTiming[]).length).toBeGreaterThan(1);
  });

  it("stamps a fresh syllableGroupId shared across every produced syllable", async () => {
    let splits: WordTiming[] | null = null;
    const screen = await render(
      <SyllableSplitter
        lineId="test-line"
        type="word"
        word={{ text: "every", begin: 0, end: 1 }}
        wordIndex={0}
        onSplit={(_, words) => {
          splits = words;
        }}
      />,
    );
    await screen.getByRole("button", { name: /Split into syllables/i }).click();
    await screen.getByRole("button", { name: "Split point 1" }).click();
    await screen.getByRole("button", { name: "Split point 3" }).click();
    await screen.getByRole("button", { name: "Split Word" }).click();
    const out = splits as unknown as WordTiming[];
    expect(out).not.toBeNull();
    expect(out.length).toBeGreaterThanOrEqual(2);
    expect(out[0].syllableGroupId).toBeDefined();
    expect(out.every((w) => w.syllableGroupId === out[0].syllableGroupId)).toBe(true);
  });

  it("reuses the source word's syllableGroupId when re-splitting", async () => {
    let splits: WordTiming[] | null = null;
    const screen = await render(
      <SyllableSplitter
        lineId="test-line"
        type="word"
        word={{ text: "ev", begin: 0, end: 1, syllableGroupId: "g_source" }}
        wordIndex={0}
        onSplit={(_, words) => {
          splits = words;
        }}
      />,
    );
    await screen.getByRole("button", { name: /Split into syllables/i }).click();
    await screen.getByRole("button", { name: "Split point 1" }).click();
    await screen.getByRole("button", { name: "Split Word" }).click();
    const out = splits as unknown as WordTiming[];
    expect(out).not.toBeNull();
    expect(out.every((w) => w.syllableGroupId === "g_source")).toBe(true);
  });
});
