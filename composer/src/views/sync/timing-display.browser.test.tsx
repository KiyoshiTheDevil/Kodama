import { describe, expect, it } from "vitest";
import { TimingDisplay } from "@/views/sync/timing-display";
import { useAudioStore } from "@/stores/audio";
import { formatTimeMs } from "@/utils/sync-helpers";
import { render } from "@/test/render";

describe("TimingDisplay", () => {
  it("renders the Current label", async () => {
    const screen = await render(<TimingDisplay />);
    await expect.element(screen.getByText("Current")).toBeInTheDocument();
  });

  it("omits the Last Synced section when not provided", async () => {
    const screen = await render(<TimingDisplay />);
    expect(screen.container.textContent).not.toContain("Last Synced");
  });

  it("renders the Last Synced time when provided", async () => {
    const screen = await render(<TimingDisplay lastSyncedTime={3.456} />);
    await expect.element(screen.getByText("Last Synced")).toBeInTheDocument();
    expect(screen.container.textContent).toContain(formatTimeMs(3.456));
  });

  it("updates the current time display from the audio store via RAF", async () => {
    useAudioStore.setState({ currentTime: 12.5 });
    const screen = await render(<TimingDisplay />);
    await expect.poll(() => screen.container.textContent).toContain(formatTimeMs(12.5));
  });
});
