import { describe, expect, it } from "vitest";
import type { LyricsSearchResult } from "@/domain/lyrics-search/result";
import type { SyncType } from "@/domain/lyrics-search/sync-type";
import { render } from "@/test/render";
import { ResultRow } from "@/views/lyrics-import-modal/result-row";

// -- Helpers ------------------------------------------------------------------

function buildResult(overrides: Partial<LyricsSearchResult> = {}): LyricsSearchResult {
  return {
    id: "lrclib-1",
    source: "lrclib",
    sourceLabel: "LRCLib",
    syncType: "line",
    track: "Bohemian Rhapsody",
    artist: "Queen",
    album: "A Night at the Opera",
    durationSec: 355,
    payload: { kind: "lrc", synced: "[00:00.00] hi", plain: null },
    ...overrides,
  };
}

const noop = () => {};

// -- Rendering ----------------------------------------------------------------

describe("ResultRow rendering", () => {
  it("renders title, artist, album, duration, sync badge, and source tag", async () => {
    const screen = await render(
      <ResultRow
        result={buildResult()}
        isHovered={false}
        isFocused={false}
        isSelecting={false}
        onHover={noop}
        onSelect={noop}
      />,
    );
    await expect.element(screen.getByText("Bohemian Rhapsody")).toBeInTheDocument();
    await expect.element(screen.getByText("Queen ・ A Night at the Opera")).toBeInTheDocument();
    await expect.element(screen.getByText("5:55")).toBeInTheDocument();
    await expect.element(screen.getByText("Line")).toBeInTheDocument();
    await expect.element(screen.getByText("LRCLib")).toBeInTheDocument();
  });

  it.each<[SyncType, string]>([
    ["syllable", "Syllable"],
    ["word", "Word"],
    ["line", "Line"],
    ["unsynced", "Unsynced"],
  ])("renders the %s sync badge", async (syncType, label) => {
    const screen = await render(
      <ResultRow
        result={buildResult({ id: `r-${syncType}`, syncType })}
        isHovered={false}
        isFocused={false}
        isSelecting={false}
        onHover={noop}
        onSelect={noop}
      />,
    );
    await expect.element(screen.getByText(label)).toBeInTheDocument();
  });

  it("omits the album text and separator when album is empty", async () => {
    const screen = await render(
      <ResultRow
        result={buildResult({ album: undefined })}
        isHovered={false}
        isFocused={false}
        isSelecting={false}
        onHover={noop}
        onSelect={noop}
      />,
    );
    await expect.element(screen.getByText("Queen")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("Queen ・");
  });

  it("uses tabular-nums on the duration display", async () => {
    const screen = await render(
      <ResultRow
        result={buildResult()}
        isHovered={false}
        isFocused={false}
        isSelecting={false}
        onHover={noop}
        onSelect={noop}
      />,
    );
    const duration = screen.getByText("5:55").element() as HTMLElement;
    expect(duration.className).toContain("tabular-nums");
  });

  it("truncates long titles via the truncate class", async () => {
    const screen = await render(
      <ResultRow
        result={buildResult({ track: "A".repeat(300) })}
        isHovered={false}
        isFocused={false}
        isSelecting={false}
        onHover={noop}
        onSelect={noop}
      />,
    );
    const title = screen.getByText("A".repeat(300)).element() as HTMLElement;
    expect(title.className).toContain("truncate");
    const overflow = window.getComputedStyle(title).overflow;
    expect(overflow.includes("hidden") || title.className.includes("truncate")).toBe(true);
  });
});

// -- Duration match display ---------------------------------------------------

describe("ResultRow duration match", () => {
  it("marks the duration as exact when expectedDurationSec matches to the second", async () => {
    const screen = await render(
      <ResultRow
        result={buildResult({ durationSec: 355 })}
        isHovered={false}
        isFocused={false}
        isSelecting={false}
        expectedDurationSec={355}
        onHover={noop}
        onSelect={noop}
      />,
    );
    const duration = screen.getByText("5:55").element();
    expect(duration.getAttribute("title")).toBe("Matches your duration");
    expect(duration.className).toContain("bg-composer-accent");
  });

  it("shows a delta suffix when within tolerance but not exact", async () => {
    const screen = await render(
      <ResultRow
        result={buildResult({ durationSec: 357 })}
        isHovered={false}
        isFocused={false}
        isSelecting={false}
        expectedDurationSec={355}
        onHover={noop}
        onSelect={noop}
      />,
    );
    await expect.element(screen.getByText("5:57")).toBeInTheDocument();
    await expect.element(screen.getByText("+2s")).toBeInTheDocument();
  });

  it("dims the duration when the mismatch exceeds tolerance", async () => {
    const screen = await render(
      <ResultRow
        result={buildResult({ durationSec: 400 })}
        isHovered={false}
        isFocused={false}
        isSelecting={false}
        expectedDurationSec={355}
        onHover={noop}
        onSelect={noop}
      />,
    );
    const duration = screen.getByText("6:40").element();
    expect(duration.className).toContain("opacity-60");
    expect(duration.className).toContain("text-composer-text-muted");
  });

  it("renders a plain duration when no expectedDurationSec is provided", async () => {
    const screen = await render(
      <ResultRow
        result={buildResult({ durationSec: 355 })}
        isHovered={false}
        isFocused={false}
        isSelecting={false}
        onHover={noop}
        onSelect={noop}
      />,
    );
    const duration = screen.getByText("5:55").element();
    expect(duration.className).not.toContain("bg-composer-accent");
    expect(duration.className).not.toContain("opacity-60");
    expect(duration.getAttribute("title")).toBeNull();
  });

  it("uses a minus sign for negative deltas", async () => {
    const screen = await render(
      <ResultRow
        result={buildResult({ durationSec: 354 })}
        isHovered={false}
        isFocused={false}
        isSelecting={false}
        expectedDurationSec={355}
        onHover={noop}
        onSelect={noop}
      />,
    );
    await expect.element(screen.getByText("−1s")).toBeInTheDocument();
  });
});

// -- Interaction --------------------------------------------------------------

describe("ResultRow interaction", () => {
  it("fires onSelect exactly once when clicked", async () => {
    let selects = 0;
    const screen = await render(
      <ResultRow
        result={buildResult()}
        isHovered={false}
        isFocused={false}
        isSelecting={false}
        onHover={noop}
        onSelect={() => selects++}
      />,
    );
    await screen.getByRole("option").click();
    expect(selects).toBe(1);
  });

  it("fires onHover on mouseenter", async () => {
    let hovers = 0;
    const screen = await render(
      <ResultRow
        result={buildResult()}
        isHovered={false}
        isFocused={false}
        isSelecting={false}
        onHover={() => hovers++}
        onSelect={noop}
      />,
    );
    await screen.getByRole("option").hover();
    expect(hovers).toBeGreaterThanOrEqual(1);
  });
});

// -- Hovered / focused / selecting --------------------------------------------

describe("ResultRow visual state", () => {
  it("applies the accent background when hovered", async () => {
    const screen = await render(
      <ResultRow
        result={buildResult()}
        isHovered
        isFocused={false}
        isSelecting={false}
        onHover={noop}
        onSelect={noop}
      />,
    );
    const row = screen.getByRole("option").element() as HTMLElement;
    expect(row.className).toContain("bg-composer-button/30");
  });

  it("applies the accent background when focused", async () => {
    const screen = await render(
      <ResultRow
        result={buildResult()}
        isHovered={false}
        isFocused
        isSelecting={false}
        onHover={noop}
        onSelect={noop}
      />,
    );
    const row = screen.getByRole("option").element() as HTMLElement;
    expect(row.className).toContain("bg-composer-button/30");
  });

  it("reflects hovered or focused state via aria-selected", async () => {
    const screen = await render(
      <ResultRow
        result={buildResult()}
        isHovered
        isFocused={false}
        isSelecting={false}
        onHover={noop}
        onSelect={noop}
      />,
    );
    const row = screen.getByRole("option").element();
    expect(row.getAttribute("aria-selected")).toBe("true");
  });

  it("aria-selected is false when neither hovered nor focused", async () => {
    const screen = await render(
      <ResultRow
        result={buildResult()}
        isHovered={false}
        isFocused={false}
        isSelecting={false}
        onHover={noop}
        onSelect={noop}
      />,
    );
    const row = screen.getByRole("option").element();
    expect(row.getAttribute("aria-selected")).toBe("false");
  });

  it("shows a spinner and ignores clicks while selecting", async () => {
    let selects = 0;
    const screen = await render(
      <ResultRow
        result={buildResult()}
        isHovered={false}
        isFocused={false}
        isSelecting
        onHover={noop}
        onSelect={() => selects++}
      />,
    );
    await expect.element(screen.getByLabelText("Loading")).toBeInTheDocument();
    await screen.getByRole("option").click();
    expect(selects).toBe(0);
  });
});
