import { describe, expect, it } from "vitest";
import { renderHook } from "vitest-browser-react";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";

describe("useKeyboardShortcuts", () => {
  it("invokes the action when the matching key is pressed", async () => {
    let count = 0;
    await renderHook(() => useKeyboardShortcuts([{ key: "z", action: () => count++, description: "Bump" }]));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", bubbles: true }));
    expect(count).toBe(1);
  });

  it("does NOT invoke the action when modifiers differ", async () => {
    let count = 0;
    await renderHook(() =>
      useKeyboardShortcuts([{ key: "z", shift: true, action: () => count++, description: "Bump" }]),
    );
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", bubbles: true }));
    expect(count).toBe(0);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", shiftKey: true, bubbles: true }));
    expect(count).toBe(1);
  });

  it("does not register handlers when enabled=false", async () => {
    let count = 0;
    await renderHook(() =>
      useKeyboardShortcuts([{ key: "z", action: () => count++, description: "Bump" }], { enabled: false }),
    );
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", bubbles: true }));
    expect(count).toBe(0);
  });

  it("ignores keydown events flagged as repeat (OS auto-repeat / stuck key)", async () => {
    let count = 0;
    await renderHook(() => useKeyboardShortcuts([{ key: " ", action: () => count++, description: "Toggle" }]));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true }));
    expect(count).toBe(1);
    for (let i = 0; i < 20; i++) {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: " ", repeat: true, bubbles: true }));
    }
    expect(count).toBe(1);
  });
});
