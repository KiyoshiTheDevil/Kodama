import { describe, expect, it } from "vitest";
import { Scroll } from "@/ui/scroll";
import { render } from "@/test/render";
import { useRef } from "react";

function ViewportRefHarness({ onMount }: { onMount: (el: HTMLDivElement | null) => void }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const proxyRef = {
    get current() {
      return ref.current;
    },
    set current(value) {
      ref.current = value;
      onMount(value);
    },
  } as { current: HTMLDivElement | null };
  return (
    <Scroll viewportRef={proxyRef}>
      <div style={{ height: 1000 }}>scroll content</div>
    </Scroll>
  );
}

describe("Scroll", () => {
  it("renders children inside the OverlayScrollbars wrapper", async () => {
    const screen = await render(
      <Scroll>
        <div>scroll content</div>
      </Scroll>,
    );
    await expect.element(screen.getByText("scroll content")).toBeInTheDocument();
  });

  it("applies an extra className from props", async () => {
    const screen = await render(
      <Scroll className="extra-test-class">
        <div>body</div>
      </Scroll>,
    );
    const wrapper = screen.container.querySelector(".extra-test-class");
    expect(wrapper).not.toBeNull();
  });

  it("sets the viewportRef once OverlayScrollbars initializes", async () => {
    let observed: HTMLDivElement | null = null;
    await render(
      <ViewportRefHarness
        onMount={(el) => {
          observed = el;
        }}
      />,
    );
    await expect.poll(() => observed).not.toBeNull();
  });
});
