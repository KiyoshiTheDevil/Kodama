import { describe, expect, it } from "vitest";
import { DivergenceModalHost } from "@/ui/divergence-modal";
import { useDivergenceStore } from "@/stores/divergence-store";
import { useSettingsStore } from "@/stores/settings";
import { render } from "@/test/render";

describe("DivergenceModalHost", () => {
  it("renders nothing when the store has no active divergence prompt", async () => {
    await render(<DivergenceModalHost />);
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("opens with the group label and sibling count when the store opens", async () => {
    const screen = await render(<DivergenceModalHost />);
    useDivergenceStore.getState().open({ affectedSiblingCount: 3, groupLabel: "Chorus" });
    await expect.element(screen.getByRole("heading", { name: "Word structure changed" })).toBeInTheDocument();
    expect(document.body.textContent).toContain("Chorus");
    expect(document.body.textContent).toContain("3 other instances");
  });

  it("pluralizes singular sibling count correctly", async () => {
    const screen = await render(<DivergenceModalHost />);
    useDivergenceStore.getState().open({ affectedSiblingCount: 1 });
    await expect.element(screen.getByRole("heading", { name: "Word structure changed" })).toBeInTheDocument();
    expect(document.body.textContent).toContain("1 other instance");
    expect(document.body.textContent).not.toContain("1 other instances");
  });

  // -- Resolution -------------------------------------------------------------

  it("resolves with 'apply' when Apply to all is clicked", async () => {
    const screen = await render(<DivergenceModalHost />);
    const result = useDivergenceStore.getState().open({ affectedSiblingCount: 2 });
    await screen.getByRole("button", { name: "Apply to all" }).click();
    expect(await result).toBe("apply");
  });

  it("resolves with 'detach' when Detach is clicked", async () => {
    const screen = await render(<DivergenceModalHost />);
    const result = useDivergenceStore.getState().open({ affectedSiblingCount: 2 });
    await screen.getByRole("button", { name: "Detach" }).click();
    expect(await result).toBe("detach");
  });

  it("resolves with 'cancel' when Cancel is clicked", async () => {
    const screen = await render(<DivergenceModalHost />);
    const result = useDivergenceStore.getState().open({ affectedSiblingCount: 2 });
    await screen.getByRole("button", { name: "Cancel" }).click();
    expect(await result).toBe("cancel");
  });

  // -- Don't ask again --------------------------------------------------------

  it("persists 'apply' as the new default when 'Don't ask again' is checked and Apply is clicked", async () => {
    expect(useSettingsStore.getState().linkedDivergenceAction).toBe("ask");
    const screen = await render(<DivergenceModalHost />);
    const result = useDivergenceStore.getState().open({ affectedSiblingCount: 2 });
    await expect.element(screen.getByText(/Don't ask again/)).toBeInTheDocument();
    await screen.getByLabelText(/Don't ask again/).click();
    await screen.getByRole("button", { name: "Apply to all" }).click();
    expect(await result).toBe("apply");
    expect(useSettingsStore.getState().linkedDivergenceAction).toBe("apply");
  });

  it("does NOT persist a preference when 'Don't ask again' is checked but Cancel is clicked", async () => {
    const screen = await render(<DivergenceModalHost />);
    const result = useDivergenceStore.getState().open({ affectedSiblingCount: 2 });
    await expect.element(screen.getByText(/Don't ask again/)).toBeInTheDocument();
    await screen.getByLabelText(/Don't ask again/).click();
    await screen.getByRole("button", { name: "Cancel" }).click();
    expect(await result).toBe("cancel");
    expect(useSettingsStore.getState().linkedDivergenceAction).toBe("ask");
  });
});
