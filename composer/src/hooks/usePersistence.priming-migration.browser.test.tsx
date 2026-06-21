import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { renderHook } from "vitest-browser-react";
import { parseLamePriming } from "@/audio/lame-priming";
import { DEFAULT_AGENTS } from "@/domain/agent/colors";
import type { WordTiming } from "@/domain/word/timing";
import { usePersistence } from "@/hooks/usePersistence";
import { clearCurrentProject, loadCurrentProject, saveAudioFile, saveCurrentProject } from "@/lib/persistence";
import { loadCurrentProjectWithPrimingMigration } from "@/lib/priming-migration";
import { useProjectStore } from "@/stores/project";
import { useSettingsStore } from "@/stores/settings";
import { createMp3File } from "@/test/audio-fixtures";

// -- Helpers ------------------------------------------------------------------

function seedSavedProject(opts: { primingStripped: boolean }): Promise<void> {
  return saveCurrentProject(
    { title: "t", artist: "", album: "", duration: 0 },
    DEFAULT_AGENTS,
    [
      {
        id: "L1",
        text: "hello world",
        agentId: DEFAULT_AGENTS[0].id,
        words: [
          { text: "hello", begin: 1.0, end: 1.5 },
          { text: "world", begin: 1.5, end: 2.0 },
        ],
      },
    ],
    [],
    "word",
    { applyToAll: false, caseInsensitive: false },
    { kind: "file", name: "silence.mp3" },
    [],
    [],
    "original",
    opts.primingStripped,
  );
}

// -- Tests --------------------------------------------------------------------

describe("loadCurrentProjectWithPrimingMigration", () => {
  beforeEach(async () => {
    await clearCurrentProject();
  });
  afterEach(async () => {
    await clearCurrentProject();
  });

  it("shifts saved line/word timings when project lacks primingStripped and audio has LAME priming", async () => {
    const mp3 = createMp3File();
    const { samples, sampleRate } = parseLamePriming(await mp3.arrayBuffer());
    expect(samples).toBeGreaterThan(0);
    expect(sampleRate).toBeGreaterThan(0);
    await saveAudioFile(mp3);
    await seedSavedProject({ primingStripped: false });

    const migrated = await loadCurrentProjectWithPrimingMigration();
    expect(migrated).toBeDefined();
    const shiftSec = samples / sampleRate;
    const words = (migrated!.lines[0] as { words: WordTiming[] }).words;
    expect(words[0].begin).toBeCloseTo(1.0 - shiftSec);
    expect(words[0].end).toBeCloseTo(1.5 - shiftSec);
    expect(words[1].begin).toBeCloseTo(1.5 - shiftSec);
    expect(words[1].end).toBeCloseTo(2.0 - shiftSec);
    expect(migrated!.primingStripped).toBe(true);
  });

  it("does not shift when primingStripped is already true", async () => {
    const mp3 = createMp3File();
    await saveAudioFile(mp3);
    await seedSavedProject({ primingStripped: true });

    const loaded = await loadCurrentProjectWithPrimingMigration();
    const words = (loaded!.lines[0] as { words: WordTiming[] }).words;
    expect(words[0].begin).toBeCloseTo(1.0);
    expect(words[1].end).toBeCloseTo(2.0);
    expect(loaded!.primingStripped).toBe(true);
  });

  it("leaves timings unchanged and does not set the flag when audio bytes are missing", async () => {
    await seedSavedProject({ primingStripped: false });

    const loaded = await loadCurrentProjectWithPrimingMigration();
    expect(loaded!.primingStripped).toBe(false);
    const words = (loaded!.lines[0] as { words: WordTiming[] }).words;
    expect(words[0].begin).toBeCloseTo(1.0);
    expect(words[1].end).toBeCloseTo(2.0);
  });

  it("returns undefined when there is no saved project", async () => {
    const loaded = await loadCurrentProjectWithPrimingMigration();
    expect(loaded).toBeUndefined();
  });

  it("sets primingStripped to true even when audio has zero priming", async () => {
    const noPrimingMp3 = new File([new Uint8Array([0, 1, 2, 3])], "not-mp3.bin", { type: "audio/mpeg" });
    expect(parseLamePriming(await noPrimingMp3.arrayBuffer()).samples).toBe(0);
    await saveAudioFile(noPrimingMp3);
    await seedSavedProject({ primingStripped: false });

    const loaded = await loadCurrentProjectWithPrimingMigration();
    expect(loaded!.primingStripped).toBe(true);
    const words = (loaded!.lines[0] as { words: WordTiming[] }).words;
    expect(words[0].begin).toBeCloseTo(1.0);
  });
});

describe("usePersistence priming-stripped flag survives the post-load debounced save", () => {
  const initialAutoSaveDelay = useSettingsStore.getState().autoSaveDelay;

  beforeEach(async () => {
    useSettingsStore.setState({ autoSaveDelay: 30 });
    await clearCurrentProject();
  });
  afterEach(async () => {
    useSettingsStore.setState({ autoSaveDelay: initialAutoSaveDelay });
    await clearCurrentProject();
  });

  async function waitForProjectHydration(): Promise<void> {
    for (let i = 0; i < 200; i++) {
      if (useProjectStore.getState().lines.length > 0) return;
      await new Promise((r) => setTimeout(r, 10));
    }
    throw new Error("project store never hydrated");
  }

  it("regression: post-migration debounced save does not overwrite primingStripped with false", async () => {
    const mp3 = createMp3File();
    expect(parseLamePriming(await mp3.arrayBuffer()).samples).toBeGreaterThan(0);
    await saveAudioFile(mp3);
    await saveCurrentProject(
      { title: "race", artist: "", album: "", duration: 0 },
      DEFAULT_AGENTS,
      [{ id: "L1", text: "hi", agentId: DEFAULT_AGENTS[0].id }],
      [],
      "word",
      { applyToAll: false, caseInsensitive: false },
      { kind: "file", name: "silence.mp3" },
      [],
      [],
      "original",
      false,
    );

    await renderHook(() => usePersistence());
    await waitForProjectHydration();
    await new Promise((r) => setTimeout(r, 150));

    const reloaded = await loadCurrentProject();
    expect(reloaded?.primingStripped).toBe(true);
  });

  it("flag stays true after debounced save even when audio has zero priming", async () => {
    const noPrimingMp3 = new File([new Uint8Array([0, 1, 2, 3])], "not-mp3.bin", { type: "audio/mpeg" });
    await saveAudioFile(noPrimingMp3);
    await saveCurrentProject(
      { title: "race-zero", artist: "", album: "", duration: 0 },
      DEFAULT_AGENTS,
      [{ id: "L1", text: "hi", agentId: DEFAULT_AGENTS[0].id }],
      [],
      "word",
      { applyToAll: false, caseInsensitive: false },
      { kind: "file", name: "not-mp3.bin" },
      [],
      [],
      "original",
      false,
    );

    await renderHook(() => usePersistence());
    await waitForProjectHydration();
    await new Promise((r) => setTimeout(r, 150));

    const reloaded = await loadCurrentProject();
    expect(reloaded?.primingStripped).toBe(true);
  });
});
