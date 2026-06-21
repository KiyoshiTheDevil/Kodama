import { describe, expect, it } from "vitest";
import { useEffect, useRef, useState } from "react";
import { MarqueeSelection } from "@/views/timeline/marquee-selection";
import { render } from "@/test/render";

interface HarnessProps {
  rect: { x: number; y: number; width: number; height: number };
  scrollLeft?: number;
  scrollTop?: number;
}

function Harness({ rect, scrollLeft = 0, scrollTop = 0 }: HarnessProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    if (ref.current) {
      ref.current.scrollLeft = scrollLeft;
      ref.current.scrollTop = scrollTop;
    }
    setReady(true);
  }, [scrollLeft, scrollTop]);
  return (
    <div ref={ref} style={{ overflow: "auto", width: 200, height: 200, position: "relative" }}>
      <div style={{ width: 1000, height: 1000 }} />
      {ready && <MarqueeSelection rect={rect} scrollContainerRef={ref} />}
    </div>
  );
}

describe("MarqueeSelection", () => {
  it("renders nothing when the scroll container ref is unset", async () => {
    await render(
      <MarqueeSelection rect={{ x: 0, y: 0, width: 10, height: 10 }} scrollContainerRef={{ current: null }} />,
    );
    expect(document.querySelector(".border-dashed")).toBeNull();
  });

  it("renders an absolutely positioned dashed rectangle sized by the rect prop", async () => {
    const screen = await render(<Harness rect={{ x: 5, y: 6, width: 20, height: 30 }} />);
    await expect.poll(() => screen.container.querySelector<HTMLElement>(".border-dashed")?.style.width).toBe("20px");
    const marquee = screen.container.querySelector(".border-dashed") as HTMLElement;
    expect(marquee.style.height).toBe("30px");
  });

  it("offsets its position by the scroll container's scrollLeft/scrollTop", async () => {
    const screen = await render(
      <Harness rect={{ x: 80, y: 100, width: 20, height: 30 }} scrollLeft={50} scrollTop={40} />,
    );
    await expect.poll(() => screen.container.querySelector<HTMLElement>(".border-dashed")?.style.left).toBe("30px");
    const marquee = screen.container.querySelector(".border-dashed") as HTMLElement;
    expect(marquee.style.top).toBe("60px");
  });
});
