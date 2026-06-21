import { describe, expect, it } from "vitest";
import { renderHook } from "vitest-browser-react";
import { usePanicRecovery } from "@/hooks/usePanicRecovery";
import { isMac } from "@/utils/platform";
import { seedProject } from "@/test/idb";

const RECOVERABLE_PROJECT = {
  version: 1,
  metadata: { title: "Hooked" },
  lines: [{ id: "x", text: "x", agentId: "v1" }],
};

function captureDownloads(): { filenames: string[]; cleanup: () => void } {
  const filenames: string[] = [];
  const originalCreate = document.createElement.bind(document);
  document.createElement = ((tag: string) => {
    const el = originalCreate(tag);
    if (tag.toLowerCase() === "a") {
      const anchor = el as HTMLAnchorElement;
      const click = anchor.click.bind(anchor);
      anchor.click = () => {
        filenames.push(anchor.download);
        click();
      };
    }
    return el;
    // biome-ignore lint/suspicious/noExplicitAny: monkey-patch for capture
  }) as any;
  return {
    filenames,
    cleanup: () => {
      document.createElement = originalCreate;
    },
  };
}

function dispatchPanicCombo(extra: Partial<KeyboardEventInit> = {}): void {
  window.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "e",
      shiftKey: true,
      altKey: true,
      metaKey: isMac,
      ctrlKey: !isMac,
      bubbles: true,
      ...extra,
    }),
  );
}

describe("usePanicRecovery", () => {
  it("downloads the project on the panic combo", async () => {
    await seedProject(RECOVERABLE_PROJECT);
    const capture = captureDownloads();
    try {
      await renderHook(() => usePanicRecovery());
      dispatchPanicCombo();
      for (let i = 0; i < 30 && capture.filenames.length === 0; i++) {
        await new Promise((r) => setTimeout(r, 20));
      }
      expect(capture.filenames.length).toBe(1);
      expect(capture.filenames[0]).toMatch(/^Hooked-/);
    } finally {
      capture.cleanup();
    }
  });

  it("ignores repeat=true keydowns to defend against stuck-key auto-repeat", async () => {
    await seedProject(RECOVERABLE_PROJECT);
    const capture = captureDownloads();
    try {
      await renderHook(() => usePanicRecovery());
      for (let i = 0; i < 10; i++) dispatchPanicCombo({ repeat: true });
      await new Promise((r) => setTimeout(r, 50));
      expect(capture.filenames.length).toBe(0);
    } finally {
      capture.cleanup();
    }
  });

  it("does not fire when the modifier is missing", async () => {
    await seedProject(RECOVERABLE_PROJECT);
    const capture = captureDownloads();
    try {
      await renderHook(() => usePanicRecovery());
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "e", shiftKey: true, bubbles: true }));
      await new Promise((r) => setTimeout(r, 50));
      expect(capture.filenames.length).toBe(0);
    } finally {
      capture.cleanup();
    }
  });

  it("matches via event.code when macOS Alt rewrites event.key to a dead-key glyph", async () => {
    await seedProject(RECOVERABLE_PROJECT);
    const capture = captureDownloads();
    try {
      await renderHook(() => usePanicRecovery());
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "´",
          code: "KeyE",
          shiftKey: true,
          altKey: true,
          metaKey: isMac,
          ctrlKey: !isMac,
          bubbles: true,
        }),
      );
      for (let i = 0; i < 30 && capture.filenames.length === 0; i++) {
        await new Promise((r) => setTimeout(r, 20));
      }
      expect(capture.filenames.length).toBe(1);
    } finally {
      capture.cleanup();
    }
  });
});
