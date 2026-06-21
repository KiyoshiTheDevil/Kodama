import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderHook } from "vitest-browser-react";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useProjectStore } from "@/stores/project";

const DEFAULT_TITLE = "Composer ・ Free TTML Lyrics Editor";

describe("useDocumentTitle", () => {
  let originalTitle: string;

  beforeEach(() => {
    originalTitle = document.title;
    document.title = DEFAULT_TITLE;
  });

  afterEach(() => {
    document.title = originalTitle;
  });

  it("leaves document.title at the captured default when metadata.title is empty", async () => {
    useProjectStore.setState((s) => ({ metadata: { ...s.metadata, title: "" } }));
    await renderHook(() => useDocumentTitle());
    expect(document.title).toBe(DEFAULT_TITLE);
  });

  it("sets document.title to 'Composer ・ {title}' when a song is loaded", async () => {
    useProjectStore.setState((s) => ({ metadata: { ...s.metadata, title: "Bohemian Rhapsody" } }));
    await renderHook(() => useDocumentTitle());
    expect(document.title).toBe("Composer ・ Bohemian Rhapsody");
  });

  it("updates document.title reactively when metadata.title changes", async () => {
    useProjectStore.setState((s) => ({ metadata: { ...s.metadata, title: "" } }));
    await renderHook(() => useDocumentTitle());
    expect(document.title).toBe(DEFAULT_TITLE);

    useProjectStore.getState().setMetadata({ title: "Imagine" });
    await expect.poll(() => document.title).toBe("Composer ・ Imagine");

    useProjectStore.getState().setMetadata({ title: "Let It Be" });
    await expect.poll(() => document.title).toBe("Composer ・ Let It Be");
  });

  it("restores the captured default when metadata.title is cleared", async () => {
    useProjectStore.setState((s) => ({ metadata: { ...s.metadata, title: "Hey Jude" } }));
    await renderHook(() => useDocumentTitle());
    expect(document.title).toBe("Composer ・ Hey Jude");

    useProjectStore.getState().setMetadata({ title: "" });
    await expect.poll(() => document.title).toBe(DEFAULT_TITLE);
  });

  it("trims whitespace-only titles and treats them as empty", async () => {
    useProjectStore.setState((s) => ({ metadata: { ...s.metadata, title: "   " } }));
    await renderHook(() => useDocumentTitle());
    expect(document.title).toBe(DEFAULT_TITLE);
  });

  it("restores the captured default on unmount", async () => {
    useProjectStore.setState((s) => ({ metadata: { ...s.metadata, title: "Yesterday" } }));
    const { unmount } = await renderHook(() => useDocumentTitle());
    expect(document.title).toBe("Composer ・ Yesterday");

    unmount();
    expect(document.title).toBe(DEFAULT_TITLE);
  });
});
