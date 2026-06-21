import { describe, expect, it } from "vitest";
import { PreviewPanel } from "@/views/preview";
import { useAudioStore } from "@/stores/audio";
import { useProjectStore } from "@/stores/project";
import { render } from "@/test/render";

describe("PreviewPanel", () => {
  it("shows the 'No audio loaded' empty state when no source is set", async () => {
    useAudioStore.setState({ source: null });
    useProjectStore.setState({ lines: [] });
    const screen = await render(<PreviewPanel />);
    await expect.element(screen.getByText("No audio loaded")).toBeInTheDocument();
  });
});
