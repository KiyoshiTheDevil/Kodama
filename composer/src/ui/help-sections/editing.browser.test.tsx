import { describe, expect, it } from "vitest";
import { useSettingsStore } from "@/stores/settings";
import { render } from "@/test/render";
import { EditSection } from "@/ui/help-sections/editing";

describe("EditSection", () => {
  it("renders the section content", async () => {
    const screen = await render(<EditSection />);
    await expect.element(screen.getByRole("heading", { name: "Agents (singers)" })).toBeInTheDocument();
  });

  it("shows the configured split character in the example", async () => {
    useSettingsStore.setState({ splitCharacter: "|" });
    const screen = await render(<EditSection />);
    await expect.element(screen.getByText(/beau\|ti\|ful/)).toBeInTheDocument();
  });
});
