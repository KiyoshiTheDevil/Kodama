import { describe, expect, it } from "vitest";
import { type RippleTarget, SyncCarousel } from "@/views/sync/sync-carousel";
import { render } from "@/test/render";

const LINES = [
  { id: "l1", text: "First line", begin: 0 },
  { id: "l2", text: "Second line", begin: 1 },
  { id: "l3", text: "Third line", begin: 2 },
];

const WORD_LINES = [{ id: "line-1", text: "alpha beta gamma", begin: 0, words: [] }];

const RIPPLE_SELECTOR = ".bg-composer-accent\\/20";

describe("SyncCarousel", () => {
  it("renders the current line and adjacent lines", async () => {
    const screen = await render(<SyncCarousel lines={LINES} lineIndex={1} wordIndex={0} granularity="line" />);
    expect(screen.container.textContent).toContain("Second");
  });

  it("renders nothing extra for an empty lines array", async () => {
    const screen = await render(<SyncCarousel lines={[]} lineIndex={0} wordIndex={0} granularity="line" />);
    expect(screen.container.textContent ?? "").toBe("");
  });

  it("switches to word granularity rendering when granularity='word'", async () => {
    const screen = await render(<SyncCarousel lines={WORD_LINES} lineIndex={0} wordIndex={1} granularity="word" />);
    expect(screen.container.textContent).toContain("alpha");
  });
});

describe("SyncCarousel ripple", () => {
  it("renders no ripple ring when rippleTarget is null", async () => {
    const screen = await render(
      <SyncCarousel lines={WORD_LINES} lineIndex={0} wordIndex={0} granularity="word" rippleTarget={null} />,
    );
    expect(screen.container.querySelectorAll(RIPPLE_SELECTOR).length).toBe(0);
  });

  it("renders a ripple ring on the targeted word when rippleTarget matches", async () => {
    const target: RippleTarget = { lineId: "line-1", wordIndex: 0, nonce: 1 };
    const screen = await render(
      <SyncCarousel lines={WORD_LINES} lineIndex={0} wordIndex={0} granularity="word" rippleTarget={target} />,
    );
    expect(screen.container.querySelectorAll(RIPPLE_SELECTOR).length).toBe(1);
  });

  it("renders no ripple ring when granularity is 'line' even if rippleTarget is set", async () => {
    const target: RippleTarget = { lineId: "l1", wordIndex: 0, nonce: 1 };
    const screen = await render(
      <SyncCarousel lines={LINES} lineIndex={0} wordIndex={0} granularity="line" rippleTarget={target} />,
    );
    expect(screen.container.querySelectorAll(RIPPLE_SELECTOR).length).toBe(0);
  });

  it("re-renders the ripple ring when nonce changes for the same word", async () => {
    const initial: RippleTarget = { lineId: "line-1", wordIndex: 0, nonce: 1 };
    const screen = await render(
      <SyncCarousel lines={WORD_LINES} lineIndex={0} wordIndex={0} granularity="word" rippleTarget={initial} />,
    );
    const firstRipple = screen.container.querySelector(RIPPLE_SELECTOR);
    expect(firstRipple).not.toBeNull();

    const next: RippleTarget = { lineId: "line-1", wordIndex: 0, nonce: 2 };
    await screen.rerender(
      <SyncCarousel lines={WORD_LINES} lineIndex={0} wordIndex={0} granularity="word" rippleTarget={next} />,
    );

    const secondRipple = screen.container.querySelector(RIPPLE_SELECTOR);
    expect(secondRipple).not.toBeNull();
    expect(secondRipple).not.toBe(firstRipple);
  });
});
