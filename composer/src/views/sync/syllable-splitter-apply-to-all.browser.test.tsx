import { beforeEach, describe, expect, it, vi } from "vitest";
import { useProjectStore } from "@/stores/project";
import { useSettingsStore } from "@/stores/settings";
import { ConfirmModalHost } from "@/ui/confirm-modal";
import { createLine } from "@/test/factories";
import { render } from "@/test/render";
import { SplitModeContent } from "@/views/sync/split-mode-content";
import { SyllableSplitter } from "@/views/sync/syllable-splitter";

// -- SplitModeContent UI tests ------------------------------------------------

describe("SplitModeContent apply-to-all controls", () => {
  it("hides the apply-to-all block when showApplyControls is false", async () => {
    const screen = await render(
      <SplitModeContent
        text="hello"
        splitPoints={[]}
        onToggleSplit={() => {}}
        onConfirm={() => {}}
        onCancel={() => {}}
        applyToAll={false}
        onApplyToAllChange={() => {}}
        caseInsensitive={false}
        onCaseInsensitiveChange={() => {}}
        identicalCount={0}
        sourceText="hello"
        showApplyControls={false}
      />,
    );
    expect(screen.container.querySelector('input[type="checkbox"]')).toBeNull();
  });

  it("shows both checkboxes with case-insensitive disabled when apply-to-all is off", async () => {
    const screen = await render(
      <SplitModeContent
        text="hello"
        splitPoints={[]}
        onToggleSplit={() => {}}
        onConfirm={() => {}}
        onCancel={() => {}}
        applyToAll={false}
        onApplyToAllChange={() => {}}
        caseInsensitive={false}
        onCaseInsensitiveChange={() => {}}
        identicalCount={0}
        sourceText="hello"
        showApplyControls={true}
      />,
    );
    const applyToAll = screen.getByLabelText("Apply to all identical words").element() as HTMLInputElement;
    const caseInsensitive = screen.getByLabelText("Case-insensitive matching").element() as HTMLInputElement;
    expect(applyToAll.disabled).toBe(false);
    expect(caseInsensitive.disabled).toBe(true);
  });

  it("enables case-insensitive when apply-to-all is on", async () => {
    const screen = await render(
      <SplitModeContent
        text="hello"
        splitPoints={[]}
        onToggleSplit={() => {}}
        onConfirm={() => {}}
        onCancel={() => {}}
        applyToAll={true}
        onApplyToAllChange={() => {}}
        caseInsensitive={false}
        onCaseInsensitiveChange={() => {}}
        identicalCount={0}
        sourceText="hello"
        showApplyControls={true}
      />,
    );
    const caseInsensitive = screen.getByLabelText("Case-insensitive matching").element() as HTMLInputElement;
    expect(caseInsensitive.disabled).toBe(false);
  });

  it("shows the count line with pluralization when applyToAll is on and matches exist", async () => {
    const screen = await render(
      <SplitModeContent
        text="hello"
        splitPoints={[]}
        onToggleSplit={() => {}}
        onConfirm={() => {}}
        onCancel={() => {}}
        applyToAll={true}
        onApplyToAllChange={() => {}}
        caseInsensitive={false}
        onCaseInsensitiveChange={() => {}}
        identicalCount={3}
        sourceText="running"
        showApplyControls={true}
      />,
    );
    await expect.element(screen.getByText(/This will also split 3 other "running"s/)).toBeInTheDocument();
  });

  it("uses singular form when identicalCount is exactly 1", async () => {
    const screen = await render(
      <SplitModeContent
        text="hello"
        splitPoints={[]}
        onToggleSplit={() => {}}
        onConfirm={() => {}}
        onCancel={() => {}}
        applyToAll={true}
        onApplyToAllChange={() => {}}
        caseInsensitive={false}
        onCaseInsensitiveChange={() => {}}
        identicalCount={1}
        sourceText="running"
        showApplyControls={true}
      />,
    );
    await expect.element(screen.getByText('This will also split 1 other "running"')).toBeInTheDocument();
  });

  it("shows muted text when applyToAll is on with zero matches", async () => {
    const screen = await render(
      <SplitModeContent
        text="hello"
        splitPoints={[]}
        onToggleSplit={() => {}}
        onConfirm={() => {}}
        onCancel={() => {}}
        applyToAll={true}
        onApplyToAllChange={() => {}}
        caseInsensitive={false}
        onCaseInsensitiveChange={() => {}}
        identicalCount={0}
        sourceText="running"
        showApplyControls={true}
      />,
    );
    await expect.element(screen.getByText("No other matching words")).toBeInTheDocument();
  });
});

// -- SyllableSplitter wiring tests --------------------------------------------

function makeLine(id: string, wordText: string, beginOffset: number) {
  return createLine({
    id,
    text: wordText,
    words: [{ text: wordText, begin: beginOffset, end: beginOffset + 1 }],
  });
}

async function openSplitterFor(lineId: string, wordText: string) {
  const screen = await render(
    <>
      <SyllableSplitter
        lineId={lineId}
        type="word"
        word={{ text: wordText, begin: 0, end: 1 }}
        wordIndex={0}
        onSplit={() => {}}
      />
      <ConfirmModalHost />
    </>,
  );
  await screen.getByRole("button", { name: /Split into syllables/i }).click();
  return screen;
}

describe("SyllableSplitter wiring", () => {
  beforeEach(() => {
    useProjectStore.setState({
      lines: [makeLine("l1", "running", 0)],
      syllableSplitDefaults: { applyToAll: false, caseInsensitive: false },
    });
  });

  it("seeds checkboxes from project syllableSplitDefaults (both off)", async () => {
    const screen = await openSplitterFor("l1", "running");
    const applyToAll = screen.getByLabelText("Apply to all identical words").element() as HTMLInputElement;
    const caseInsensitive = screen.getByLabelText("Case-insensitive matching").element() as HTMLInputElement;
    expect(applyToAll.checked).toBe(false);
    expect(caseInsensitive.checked).toBe(false);
  });

  it("restores stored defaults on open (both on)", async () => {
    useProjectStore.setState({
      lines: [makeLine("l1", "running", 0)],
      syllableSplitDefaults: { applyToAll: true, caseInsensitive: true },
    });
    const screen = await openSplitterFor("l1", "running");
    const applyToAll = screen.getByLabelText("Apply to all identical words").element() as HTMLInputElement;
    const caseInsensitive = screen.getByLabelText("Case-insensitive matching").element() as HTMLInputElement;
    expect(applyToAll.checked).toBe(true);
    expect(caseInsensitive.checked).toBe(true);
  });

  it("recomputes identical count when case-insensitive toggles", async () => {
    useProjectStore.setState({
      lines: [makeLine("l1", "running", 0), makeLine("l2", "Running", 2)],
      syllableSplitDefaults: { applyToAll: false, caseInsensitive: false },
    });
    const screen = await openSplitterFor("l1", "running");
    await screen.getByLabelText("Apply to all identical words").click();
    await expect.element(screen.getByText("No other matching words")).toBeInTheDocument();
    await screen.getByLabelText("Case-insensitive matching").click();
    await expect.element(screen.getByText(/This will also split 1 other "running"/)).toBeInTheDocument();
  });

  it("applies to all matches via the store action when confirm is accepted", async () => {
    useProjectStore.setState({
      lines: [makeLine("l1", "running", 0), makeLine("l2", "running", 2)],
      syllableSplitDefaults: { applyToAll: false, caseInsensitive: false },
    });
    const screen = await openSplitterFor("l1", "running");
    await screen.getByRole("button", { name: "Split point 3" }).click();
    await screen.getByLabelText("Apply to all identical words").click();
    await screen.getByRole("button", { name: "Split all" }).click();
    await screen.getByRole("button", { name: "Split" }).click();
    await expect.poll(() => useProjectStore.getState().lines[1].words?.length).toBe(2);
  });

  it("leaves the project unchanged when the confirm modal is cancelled", async () => {
    useProjectStore.setState({
      lines: [makeLine("l1", "running", 0), makeLine("l2", "running", 2)],
      syllableSplitDefaults: { applyToAll: false, caseInsensitive: false },
    });
    const before = useProjectStore.getState().lines;
    const screen = await openSplitterFor("l1", "running");
    await screen.getByRole("button", { name: "Split point 3" }).click();
    await screen.getByLabelText("Apply to all identical words").click();
    await screen.getByRole("button", { name: "Split all" }).click();
    await screen.getByRole("button", { name: "Cancel" }).click();
    expect(useProjectStore.getState().lines).toBe(before);
  });

  it("skips the confirm modal when confirmApplyToAllSyllableSplit is off", async () => {
    useProjectStore.setState({
      lines: [makeLine("l1", "running", 0), makeLine("l2", "running", 2)],
      syllableSplitDefaults: { applyToAll: false, caseInsensitive: false },
    });
    useSettingsStore.setState({ confirmApplyToAllSyllableSplit: false });
    const screen = await openSplitterFor("l1", "running");
    await screen.getByRole("button", { name: "Split point 3" }).click();
    await screen.getByLabelText("Apply to all identical words").click();
    await screen.getByRole("button", { name: "Split all" }).click();
    await expect.poll(() => useProjectStore.getState().lines[1].words?.length).toBe(2);
  });

  it("routes through onSplit (not the store action) when apply-to-all is off", async () => {
    useProjectStore.setState({
      lines: [makeLine("l1", "running", 0), makeLine("l2", "running", 2)],
      syllableSplitDefaults: { applyToAll: false, caseInsensitive: false },
    });
    const onSplit = vi.fn();
    const screen = await render(
      <>
        <SyllableSplitter
          lineId="l1"
          type="word"
          word={{ text: "running", begin: 0, end: 1 }}
          wordIndex={0}
          onSplit={onSplit}
        />
        <ConfirmModalHost />
      </>,
    );
    await screen.getByRole("button", { name: /Split into syllables/i }).click();
    await screen.getByRole("button", { name: "Split point 3" }).click();
    await screen.getByRole("button", { name: "Split Word" }).click();
    expect(onSplit).toHaveBeenCalledTimes(1);
    expect(useProjectStore.getState().lines[1].words?.length).toBe(1);
  });

  it("persists checkbox state to syllableSplitDefaults after a successful split", async () => {
    useProjectStore.setState({
      lines: [makeLine("l1", "running", 0), makeLine("l2", "running", 2)],
      syllableSplitDefaults: { applyToAll: false, caseInsensitive: false },
    });
    const screen = await openSplitterFor("l1", "running");
    await screen.getByRole("button", { name: "Split point 3" }).click();
    await screen.getByLabelText("Apply to all identical words").click();
    await screen.getByRole("button", { name: "Split all" }).click();
    await screen.getByRole("button", { name: "Split" }).click();
    await expect.poll(() => useProjectStore.getState().syllableSplitDefaults.applyToAll).toBe(true);
  });
});
