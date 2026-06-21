import { createRef } from "react";
import { describe, expect, it } from "vitest";
import { renderHook } from "vitest-browser-react";
import { createLine } from "@/test/factories";
import { useAudioStore } from "@/stores/audio";
import { useProjectStore } from "@/stores/project";
import { useSettingsStore } from "@/stores/settings";
import { useTimelineKeyboard } from "@/views/timeline/use-timeline-keyboard";
import { useTimelineStore } from "@/views/timeline/timeline-store";

describe("useTimelineKeyboard", () => {
  it("toggles snap when the snap shortcut is pressed in the timeline scope", async () => {
    useProjectStore.setState({ activeTab: "timeline" });
    useSettingsStore.getState().set("timelineSnap", false);
    const scrollContainerRef = createRef<HTMLDivElement | null>();
    await renderHook(() => useTimelineKeyboard(scrollContainerRef, [], 0));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "t", bubbles: true }));
    expect(useSettingsStore.getState().timelineSnap).toBe(true);
  });

  it("toggles rolling edit mode when the rolling edit shortcut is pressed", async () => {
    useProjectStore.setState({ activeTab: "timeline" });
    expect(useTimelineStore.getState().rollingEditMode).toBe(false);
    const scrollContainerRef = createRef<HTMLDivElement | null>();
    await renderHook(() => useTimelineKeyboard(scrollContainerRef, [], 0));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "r", bubbles: true }));
    expect(useTimelineStore.getState().rollingEditMode).toBe(true);
  });

  it("merges two space-separated words into one when the merge shortcut is pressed", async () => {
    const line = createLine({
      text: "every day",
      words: [
        { text: "every ", begin: 1, end: 1.5 },
        { text: "day", begin: 1.5, end: 2 },
      ],
    });
    useProjectStore.setState({ activeTab: "timeline", lines: [line] });
    useTimelineStore.setState({
      selectedWords: [
        { lineId: line.id, lineIndex: 0, wordIndex: 0, type: "word" },
        { lineId: line.id, lineIndex: 0, wordIndex: 1, type: "word" },
      ],
    });
    const scrollContainerRef = createRef<HTMLDivElement | null>();
    await renderHook(() => useTimelineKeyboard(scrollContainerRef, [line], 10));

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "m", bubbles: true }));

    const mergedLine = useProjectStore.getState().lines[0];
    expect(mergedLine.words).toEqual([{ text: "everyday", begin: 1, end: 2 }]);
  });
});

describe("useTimelineKeyboard · background provenance", () => {
  it("stamps backgroundTextSource manual when a bg word's begin is set to the playhead", async () => {
    useAudioStore.setState({ currentTime: 1.2, duration: 10 });
    const line = createLine({
      text: "main",
      words: [{ text: "main", begin: 0, end: 1 }],
      backgroundText: "ooh",
      backgroundWords: [{ text: "ooh", begin: 1, end: 2 }],
      backgroundTextSource: "extraction",
    });
    useProjectStore.setState({ activeTab: "timeline", lines: [line] });
    useTimelineStore.setState({
      selectedWords: [{ lineId: line.id, lineIndex: 0, wordIndex: 0, type: "bg" }],
    });
    const scrollContainerRef = createRef<HTMLDivElement | null>();
    await renderHook(() => useTimelineKeyboard(scrollContainerRef, [line], 10));

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "[", bubbles: true }));

    const updated = useProjectStore.getState().lines[0];
    expect(updated.backgroundTextSource).toBe("manual");
    expect(updated.backgroundWords?.[0].begin).toBeCloseTo(1.2);
  });

  it("stamps backgroundTextSource manual when bg words are merged", async () => {
    const line = createLine({
      text: "main",
      words: [{ text: "main", begin: 0, end: 1 }],
      backgroundText: "ooh aah",
      backgroundWords: [
        { text: "ooh ", begin: 1, end: 1.5 },
        { text: "aah", begin: 1.5, end: 2 },
      ],
      backgroundTextSource: "extraction",
    });
    useProjectStore.setState({ activeTab: "timeline", lines: [line] });
    useTimelineStore.setState({
      selectedWords: [
        { lineId: line.id, lineIndex: 0, wordIndex: 0, type: "bg" },
        { lineId: line.id, lineIndex: 0, wordIndex: 1, type: "bg" },
      ],
    });
    const scrollContainerRef = createRef<HTMLDivElement | null>();
    await renderHook(() => useTimelineKeyboard(scrollContainerRef, [line], 10));

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "m", bubbles: true }));

    const updated = useProjectStore.getState().lines[0];
    expect(updated.backgroundWords).toEqual([{ text: "oohaah", begin: 1, end: 2 }]);
    expect(updated.backgroundTextSource).toBe("manual");
  });

  it("leaves background provenance untouched when a main word's timing is set", async () => {
    useAudioStore.setState({ currentTime: 0.4, duration: 10 });
    const line = createLine({
      text: "main",
      words: [{ text: "main", begin: 0, end: 1 }],
      backgroundText: "ooh",
      backgroundWords: [{ text: "ooh", begin: 1, end: 2 }],
      backgroundTextSource: "extraction",
    });
    useProjectStore.setState({ activeTab: "timeline", lines: [line] });
    useTimelineStore.setState({
      selectedWords: [{ lineId: line.id, lineIndex: 0, wordIndex: 0, type: "word" }],
    });
    const scrollContainerRef = createRef<HTMLDivElement | null>();
    await renderHook(() => useTimelineKeyboard(scrollContainerRef, [line], 10));

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "[", bubbles: true }));

    expect(useProjectStore.getState().lines[0].backgroundTextSource).toBe("extraction");
  });
});
