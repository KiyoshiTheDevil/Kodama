import { describe, expect, it } from "vitest";
import { App } from "@/App";
import { useProjectStore } from "@/stores/project";
import { render } from "@/test/render";

describe("App", () => {
  it("renders the app header and tab bar", async () => {
    useProjectStore.setState({ activeTab: "import" });
    const screen = await render(<App />);
    expect(screen.container.textContent).toContain("Composer");
    expect(screen.container.querySelector("nav")).not.toBeNull();
  });

  it("switches the active tab when a tab button is clicked", async () => {
    localStorage.setItem("composer-tour-seen", "true");
    useProjectStore.setState({ activeTab: "import" });
    const screen = await render(<App />);
    const editButton = screen.container.querySelector('[data-tour="tab-edit"]') as HTMLButtonElement;
    expect(editButton).not.toBeNull();
    editButton.click();
    expect(useProjectStore.getState().activeTab).toBe("edit");
  });
});
