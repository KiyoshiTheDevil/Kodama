import { describe, expect, it } from "vitest";
import { renderHook } from "vitest-browser-react";
import { useGlobalShortcuts } from "@/hooks/useGlobalShortcuts";
import { useProjectStore } from "@/stores/project";

describe("useGlobalShortcuts", () => {
  it("switches to import on Mod+1", async () => {
    useProjectStore.setState({ activeTab: "preview" });
    const setActiveTab = (tab: string) => useProjectStore.setState({ activeTab: tab as never });
    await renderHook(() =>
      useGlobalShortcuts({
        setActiveTab,
        setHelpOpen: () => {},
        setSettingsOpen: () => {},
      }),
    );
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "1", metaKey: true, ctrlKey: true, bubbles: true }));
    expect(useProjectStore.getState().activeTab).toBe("import");
  });

  it("opens help when the help shortcut is pressed", async () => {
    let helpOpen = false;
    await renderHook(() =>
      useGlobalShortcuts({
        setActiveTab: () => {},
        setHelpOpen: (open) => {
          helpOpen = open;
        },
        setSettingsOpen: () => {},
      }),
    );
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "?", shiftKey: true, bubbles: true }));
    expect(helpOpen).toBe(true);
  });
});
