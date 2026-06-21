import { describe, expect, it } from "vitest";
import { useSettingsStore } from "@/stores/settings";
import { SettingsModal } from "@/ui/settings-modal";
import { allowConsole } from "@/test/console-guard";
import { render } from "@/test/render";

describe("SettingsModal", () => {
  it("renders nothing when isOpen is false", async () => {
    await render(<SettingsModal isOpen={false} onClose={() => {}} onResetTour={() => {}} />);
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("opens with the Settings title and a sidebar of section buttons", async () => {
    const screen = await render(<SettingsModal isOpen onClose={() => {}} onResetTour={() => {}} />);
    await expect.element(screen.getByRole("heading", { name: "Settings" })).toBeInTheDocument();
    const sectionButtons = document.querySelectorAll("dialog button");
    expect(sectionButtons.length).toBeGreaterThan(5);
  });

  it("switches the visible content when a different section is clicked", async () => {
    const screen = await render(<SettingsModal isOpen onClose={() => {}} onResetTour={() => {}} />);
    await screen.getByRole("button", { name: /Shortcuts/i }).click();
    expect(document.querySelector("dialog")?.textContent ?? "").toContain("Shortcut");
  });

  it("invokes onClose when Escape is pressed", async () => {
    let closes = 0;
    await render(<SettingsModal isOpen onClose={() => closes++} onResetTour={() => {}} />);
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(closes).toBeGreaterThan(0);
  });

  describe("Cobalt instance edit row", () => {
    it("keeps focus on the URL input while typing", async () => {
      allowConsole(/cannot be a descendant of/);
      allowConsole(/cannot contain a nested/);
      useSettingsStore.setState({
        cobaltInstances: [{ id: "test-inst", label: "Self-hosted", url: "https://example.com" }],
        selectedCobaltInstanceId: "test-inst",
      });

      const screen = await render(<SettingsModal isOpen onClose={() => {}} onResetTour={() => {}} />);
      await screen.getByRole("button", { name: /Advanced/i }).click();
      await screen.getByRole("button", { name: /Self-hosted/i }).click();

      const urlInput = document.querySelector<HTMLInputElement>('dialog input[type="url"]');
      expect(urlInput).not.toBeNull();
      if (!urlInput) throw new Error("URL input not rendered");

      urlInput.focus();
      expect(document.activeElement).toBe(urlInput);

      const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      const setValue = (next: string) => {
        nativeSetter?.call(urlInput, next);
        urlInput.dispatchEvent(new Event("input", { bubbles: true }));
      };

      setValue("https://example.com/a");
      expect(document.activeElement).toBe(urlInput);
      setValue("https://example.com/ab");
      expect(document.activeElement).toBe(urlInput);
      setValue("https://example.com/abc");
      expect(document.activeElement).toBe(urlInput);
      expect(urlInput.value).toBe("https://example.com/abc");
    });
  });
});
