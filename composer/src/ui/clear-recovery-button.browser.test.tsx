import { describe, expect, it } from "vitest";
import { ClearRecoveryButton } from "@/ui/clear-recovery-button";
import { readRecoveryMetadata } from "@/lib/recovery";
import { render } from "@/test/render";
import { seedProject } from "@/test/idb";

const RECOVERABLE_PROJECT = {
  version: 1,
  metadata: { title: "ToClear" },
  lines: [{ id: "a", text: "x", agentId: "v1" }],
};

describe("ClearRecoveryButton", () => {
  it("requires two clicks to clear: first shows confirm, second actually clears", async () => {
    await seedProject(RECOVERABLE_PROJECT);
    const screen = await render(<ClearRecoveryButton />);

    await screen.getByRole("button", { name: /Clear saved data/ }).click();
    await expect.element(screen.getByText(/Click again to confirm/)).toBeInTheDocument();
    expect((await readRecoveryMetadata()).found).toBe(true);

    await screen.getByRole("button", { name: /Confirm clear/ }).click();
    await expect.element(screen.getByText(/Reload Composer to start fresh/)).toBeInTheDocument();
    expect((await readRecoveryMetadata()).found).toBe(false);
  });

  it("renders the optional hint while idle", async () => {
    const screen = await render(<ClearRecoveryButton hint="this is the hint" />);
    await expect.element(screen.getByText(/this is the hint/)).toBeInTheDocument();
  });

  it("uses the custom clearedMessage after clearing", async () => {
    await seedProject(RECOVERABLE_PROJECT);
    const screen = await render(<ClearRecoveryButton clearedMessage="all gone" />);
    await screen.getByRole("button", { name: /Clear saved data/ }).click();
    await screen.getByRole("button", { name: /Confirm clear/ }).click();
    await expect.element(screen.getByText(/all gone/)).toBeInTheDocument();
  });
});
