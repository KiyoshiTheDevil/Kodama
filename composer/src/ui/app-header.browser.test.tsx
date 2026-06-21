import { describe, expect, it } from "vitest";
import { AppHeader } from "@/ui/app-header";
import { render } from "@/test/render";

describe("AppHeader", () => {
  it("renders the Composer logo and brand text", async () => {
    const screen = await render(<AppHeader onSettingsOpen={() => {}} onHelpOpen={() => {}} onTourStart={() => {}} />);
    await expect.element(screen.getByRole("img", { name: "Composer Logo" })).toBeInTheDocument();
    expect(screen.container.textContent).toContain("Composer");
  });

  it("calls onSettingsOpen when the settings button is clicked", async () => {
    let calls = 0;
    const screen = await render(
      <AppHeader onSettingsOpen={() => calls++} onHelpOpen={() => {}} onTourStart={() => {}} />,
    );
    await screen.getByRole("button", { name: "Settings" }).click();
    expect(calls).toBe(1);
  });

  it("calls onHelpOpen when the help button is clicked", async () => {
    let calls = 0;
    const screen = await render(
      <AppHeader onSettingsOpen={() => {}} onHelpOpen={() => calls++} onTourStart={() => {}} />,
    );
    await screen.getByRole("button", { name: /Keyboard shortcuts/ }).click();
    expect(calls).toBe(1);
  });

  it("calls onTourStart when the tour button is clicked", async () => {
    let calls = 0;
    const screen = await render(
      <AppHeader onSettingsOpen={() => {}} onHelpOpen={() => {}} onTourStart={() => calls++} />,
    );
    await screen.getByRole("button", { name: "Product tour" }).click();
    expect(calls).toBe(1);
  });
});
