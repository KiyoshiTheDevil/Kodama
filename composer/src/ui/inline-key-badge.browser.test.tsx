import { describe, expect, it } from "vitest";
import { InlineKeyBadge } from "@/ui/inline-key-badge";
import { render } from "@/test/render";

describe("InlineKeyBadge", () => {
  it("renders a single key", async () => {
    const screen = await render(<InlineKeyBadge keys={["Z"]} />);
    await expect.element(screen.getByText("Z")).toBeInTheDocument();
  });

  it("renders multiple keys as separate badges", async () => {
    const screen = await render(<InlineKeyBadge keys={["Shift", "P"]} />);
    expect(screen.container.querySelectorAll("span > span").length).toBe(2);
    await expect.element(screen.getByText("P")).toBeInTheDocument();
  });

  it("renders the Mod key, with an icon on macOS and Ctrl text elsewhere", async () => {
    const screen = await render(<InlineKeyBadge keys={["Mod"]} />);
    const badges = screen.container.querySelectorAll("span > span");
    expect(badges.length).toBe(1);
    const badge = badges[0] as HTMLElement;
    const isMac = /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
    if (isMac) {
      expect(badge.querySelector("svg")).not.toBeNull();
    } else {
      expect(badge.querySelector("svg")).toBeNull();
      expect(badge.textContent).toBe("Ctrl");
    }
  });

  it("preserves the supplied key order", async () => {
    const screen = await render(<InlineKeyBadge keys={["A", "B", "C"]} />);
    const badges = Array.from(screen.container.querySelectorAll("span > span"));
    const labels = badges.map((badge) => badge.textContent?.trim() ?? "");
    expect(labels).toEqual(["A", "B", "C"]);
  });

  it("renders an Unbound placeholder when keys is empty", async () => {
    const screen = await render(<InlineKeyBadge keys={[]} />);
    await expect.element(screen.getByText("Unbound")).toBeInTheDocument();
  });

  it("does not render key badges when keys is empty", async () => {
    const screen = await render(<InlineKeyBadge keys={[]} />);
    expect(screen.container.querySelectorAll("span > span").length).toBe(0);
  });
});
