import { describe, expect, it } from "vitest";
import { render } from "@/test/render";
import { ExportSection } from "@/ui/help-sections/exporting";

describe("ExportSection", () => {
  it("renders the section content", async () => {
    const screen = await render(<ExportSection />);
    await expect.element(screen.getByText("Download TTML")).toBeInTheDocument();
  });
});
