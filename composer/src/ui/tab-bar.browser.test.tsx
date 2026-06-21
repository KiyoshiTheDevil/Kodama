import { describe, expect, it } from "vitest";
import { TabBar } from "@/ui/tab-bar";
import { useProjectStore } from "@/stores/project";
import { useSettingsStore } from "@/stores/settings";
import { render } from "@/test/render";

const TAB_NAME_REGEX = {
  Import: /^Import/,
  Edit: /^Edit/,
  Sync: /^Sync/,
  Timeline: /^Timeline/,
  Preview: /^Preview/,
  Export: /^Export/,
} as const;

describe("TabBar", () => {
  it("renders one button per tab", async () => {
    const screen = await render(<TabBar />);
    await Promise.all(
      Object.values(TAB_NAME_REGEX).map((nameRegex) =>
        expect.element(screen.getByRole("button", { name: nameRegex })).toBeInTheDocument(),
      ),
    );
  });

  it("highlights the currently active tab from the project store", async () => {
    useProjectStore.setState({ activeTab: "sync" });
    const screen = await render(<TabBar />);
    const syncButton = screen.getByRole("button", { name: /^Sync/ }).element();
    expect(syncButton.className).toContain("border-composer-accent");
  });

  it("dispatches setActiveTab on the project store when a tab is clicked", async () => {
    useProjectStore.setState({ activeTab: "import" });
    const screen = await render(<TabBar />);
    await screen.getByRole("button", { name: /^Timeline/ }).click();
    expect(useProjectStore.getState().activeTab).toBe("timeline");
  });

  it("hides shortcut hints when settings.showShortcutHints is false", async () => {
    useSettingsStore.setState({ showShortcutHints: false });
    const screen = await render(<TabBar />);
    expect(screen.container.querySelector("svg")).toBeNull();
  });

  it("shows shortcut hints when settings.showShortcutHints is true", async () => {
    useSettingsStore.setState({ showShortcutHints: true });
    const screen = await render(<TabBar />);
    expect(screen.container.querySelectorAll("button > span > span").length).toBeGreaterThan(0);
  });
});
