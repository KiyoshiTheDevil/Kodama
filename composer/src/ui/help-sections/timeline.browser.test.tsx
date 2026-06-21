import { describe, expect, it } from "vitest";
import { render } from "@/test/render";
import { TimelineSection } from "@/ui/help-sections/timeline";

describe("TimelineSection", () => {
  it("renders the section content", async () => {
    const screen = await render(<TimelineSection />);
    await expect.element(screen.getByRole("heading", { name: "Layout" })).toBeInTheDocument();
  });

  it("renders inline shortcut key badges", async () => {
    const screen = await render(<TimelineSection />);
    await expect.poll(() => screen.container.querySelectorAll("[data-inline-key-badge]").length).toBeGreaterThan(0);
  });

  it("documents the rolling edit tool", async () => {
    const screen = await render(<TimelineSection />);
    expect(screen.container.textContent).toContain("the rolling edit tool");
  });

  it("documents splitting a word into independent words", async () => {
    const screen = await render(<TimelineSection />);
    expect(screen.container.textContent).toContain("separate independent words");
  });

  it("documents explicit-word marking and detection", async () => {
    const screen = await render(<TimelineSection />);
    await expect.element(screen.getByRole("heading", { name: "Explicit words" })).toBeInTheDocument();
    await expect.element(screen.getByText(/composer:explicit/)).toBeInTheDocument();
  });

  it("does not list a stale Select toolbar entry", async () => {
    const screen = await render(<TimelineSection />);
    expect(screen.container.textContent).not.toContain("disables double-click word creation");
  });

  it("documents wheel-over-waveform scrubbing", async () => {
    const screen = await render(<TimelineSection />);
    await expect
      .element(screen.getByText(/Scroll the wheel while the cursor is over the waveform strip/))
      .toBeInTheDocument();
  });

  it("documents the scroll wheel timeline setting", async () => {
    const screen = await render(<TimelineSection />);
    await expect.element(screen.getByText(/Turn on "Scroll wheel scrolls timeline" in Settings/)).toBeInTheDocument();
  });

  it("documents playhead-drag edge auto-scroll", async () => {
    const screen = await render(<TimelineSection />);
    await expect.element(screen.getByText(/auto-scrolls the view/i)).toBeInTheDocument();
  });

  it("documents selecting the word under the playhead", async () => {
    const screen = await render(<TimelineSection />);
    await expect.element(screen.getByText(/cycle through any overlapping words/i)).toBeInTheDocument();
  });

  it("documents audio scrub preview at native pitch", async () => {
    const screen = await render(<TimelineSection />);
    await expect.element(screen.getByRole("heading", { name: "Audio scrub preview" })).toBeInTheDocument();
    await expect.element(screen.getByText(/at normal pitch/)).toBeInTheDocument();
  });

  it("does not describe a plain wheel as horizontal-only", async () => {
    const screen = await render(<TimelineSection />);
    expect(screen.container.textContent).not.toContain("Scroll horizontally to move through time");
  });
});
