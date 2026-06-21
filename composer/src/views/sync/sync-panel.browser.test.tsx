import { describe, expect, it } from "vitest";
import { SyncPanel } from "@/views/sync/sync-panel";
import { useAudioStore } from "@/stores/audio";
import { useProjectStore } from "@/stores/project";
import { render } from "@/test/render";

describe("SyncPanel", () => {
  it("shows the 'No audio loaded' empty state when no source is set", async () => {
    useAudioStore.setState({ source: null });
    useProjectStore.setState({ lines: [] });
    const screen = await render(<SyncPanel />);
    await expect.element(screen.getByText("No audio loaded")).toBeInTheDocument();
  });
});
