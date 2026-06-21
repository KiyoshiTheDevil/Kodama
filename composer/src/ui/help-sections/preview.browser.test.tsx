import { describe, expect, it } from "vitest";
import { render } from "@/test/render";
import { PreviewSection } from "@/ui/help-sections/preview";

describe("PreviewSection", () => {
  it("renders the section content", async () => {
    const screen = await render(<PreviewSection />);
    await expect
      .element(screen.getByText("Playback controls (play/pause, seek) work the same as everywhere else."))
      .toBeInTheDocument();
  });
});
