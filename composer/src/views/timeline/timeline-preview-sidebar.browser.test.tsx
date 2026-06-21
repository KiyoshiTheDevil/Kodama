import { describe, expect, it } from "vitest";
import { TimelinePreviewSidebar } from "@/views/timeline/timeline-preview-sidebar";
import { useProjectStore } from "@/stores/project";
import { createLine, createWord } from "@/test/factories";
import { render } from "@/test/render";

describe("TimelinePreviewSidebar", () => {
  it("shows the 'No synced content' fallback for an empty project", async () => {
    useProjectStore.setState({ lines: [] });
    const screen = await render(<TimelinePreviewSidebar />);
    await expect.element(screen.getByText("No synced content")).toBeInTheDocument();
  });

  it("renders the preview header and line text once any line has timing", async () => {
    useProjectStore.setState({
      lines: [createLine({ text: "hello world", words: [createWord({ text: "hello", begin: 0, end: 1 })] })],
    });
    const screen = await render(<TimelinePreviewSidebar />);
    await expect.element(screen.getByText("Preview")).toBeInTheDocument();
    expect(screen.container.textContent).toContain("hello");
  });
});
