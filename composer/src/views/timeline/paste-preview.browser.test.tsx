import { describe, expect, it } from "vitest";
import { useRef } from "react";
import { PastePreview } from "@/views/timeline/paste-preview";
import { render } from "@/test/render";

function Harness() {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <div ref={ref} style={{ overflow: "auto", width: 400, height: 200 }}>
      <PastePreview clipboard={{ entries: [] }} scrollContainerRef={ref} />
    </div>
  );
}

describe("PastePreview", () => {
  it("renders nothing for an empty paste clipboard", async () => {
    const screen = await render(<Harness />);
    expect(screen.container.textContent ?? "").toBe("");
  });
});
