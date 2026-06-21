import { describe, expect, it } from "vitest";
import type { Agent } from "@/domain/agent/model";
import type { LyricLine } from "@/domain/line/model";
import { useProjectStore } from "@/stores/project";
import type { ParseResult } from "@/utils/lyrics-parsers/shared";
import {
  importParsedLyrics,
  type ImportParsedLyricsContext,
} from "@/views/lyrics-import-modal/use-import-modal-actions";

// -- Helpers ------------------------------------------------------------------

function lineFactory(id: string, text: string, agentId = "v1"): LyricLine {
  return { id, text, agentId };
}

function emptyParseResult(): ParseResult {
  return { lines: [], metadata: {}, hasTimingData: false };
}

function parseResult(overrides: Partial<ParseResult> = {}): ParseResult {
  return {
    lines: [lineFactory("a", "Hello"), lineFactory("b", "World")],
    metadata: {},
    hasTimingData: false,
    ...overrides,
  };
}

function buildContext(overrides: Partial<ImportParsedLyricsContext> = {}): ImportParsedLyricsContext {
  return {
    confirm: async () => true,
    agents: [{ id: "v1", type: "person", name: "Voice 1" }],
    audioDuration: 0,
    applyBackgroundExtraction: false,
    backgroundExtractionMergeStandalone: false,
    backgroundExtractionPreserveBrackets: false,
    source: { label: "Test", filename: "test.lrc" },
    ...overrides,
  };
}

// -- Empty input --------------------------------------------------------------

describe("importParsedLyrics empty input", () => {
  it("returns false when the parsed result has no lines", async () => {
    const beforeLines = useProjectStore.getState().lines;
    const result = await importParsedLyrics(emptyParseResult(), buildContext());
    expect(result).toBe(false);
    expect(useProjectStore.getState().lines).toBe(beforeLines);
  });
});

// -- Confirm replace ----------------------------------------------------------

describe("importParsedLyrics confirm flow", () => {
  it("does not prompt when no existing lines are present", async () => {
    let promptCount = 0;
    const result = await importParsedLyrics(
      parseResult(),
      buildContext({
        confirm: async () => {
          promptCount++;
          return true;
        },
      }),
    );
    expect(result).toBe(true);
    expect(promptCount).toBe(0);
    expect(useProjectStore.getState().lines.length).toBe(2);
  });

  it("prompts when existing lines are present and rejects the import on cancel", async () => {
    useProjectStore.getState().setLines([lineFactory("existing", "Old")]);
    let promptCount = 0;
    const result = await importParsedLyrics(
      parseResult(),
      buildContext({
        confirm: async () => {
          promptCount++;
          return false;
        },
      }),
    );
    expect(result).toBe(false);
    expect(promptCount).toBe(1);
    expect(useProjectStore.getState().lines.length).toBe(1);
    expect(useProjectStore.getState().lines[0].text).toBe("Old");
  });

  it("replaces lines when the user confirms", async () => {
    useProjectStore.getState().setLines([lineFactory("existing", "Old")]);
    const result = await importParsedLyrics(parseResult(), buildContext({ confirm: async () => true }));
    expect(result).toBe(true);
    expect(useProjectStore.getState().lines.length).toBe(2);
    expect(useProjectStore.getState().lines.map((l) => l.text)).toEqual(["Hello", "World"]);
  });
});

// -- Distribute timing --------------------------------------------------------

describe("importParsedLyrics timing distribution", () => {
  it("does not distribute timing when audioDuration is zero and there is no timing data", async () => {
    await importParsedLyrics(parseResult({ hasTimingData: false }), buildContext({ audioDuration: 0 }));
    const lines = useProjectStore.getState().lines;
    expect(lines[0].words).toBeUndefined();
    expect(lines[0].begin).toBeUndefined();
    expect(lines[0].end).toBeUndefined();
  });

  it("distributes timing across the audio when parsed lacks timing data", async () => {
    await importParsedLyrics(parseResult({ hasTimingData: false }), buildContext({ audioDuration: 120 }));
    const lines = useProjectStore.getState().lines;
    expect(lines[0].words).toBeDefined();
    expect(lines[0].words?.length).toBeGreaterThan(0);
    const firstWord = lines[0].words?.[0];
    const lastLine = lines[lines.length - 1];
    const lastWord = lastLine.words?.[lastLine.words.length - 1];
    expect(firstWord?.begin).toBe(0);
    expect(lastWord?.end).toBeCloseTo(120, 3);
  });

  it("does not distribute when parsed already has timing data", async () => {
    const timed: LyricLine = {
      id: "t",
      text: "Hi",
      agentId: "v1",
      words: [{ text: "Hi", begin: 1, end: 2 }],
    };
    await importParsedLyrics(
      { lines: [timed], metadata: {}, hasTimingData: true },
      buildContext({ audioDuration: 60 }),
    );
    const stored = useProjectStore.getState().lines;
    expect(stored.length).toBe(1);
    expect(stored[0].words).toEqual([{ text: "Hi", begin: 1, end: 2 }]);
  });
});

// -- Background extraction ----------------------------------------------------

describe("importParsedLyrics background extraction", () => {
  it("applies background extraction when the flag is set", async () => {
    const inline: LyricLine = { id: "x", text: "Hello (world)", agentId: "v1" };
    await importParsedLyrics(
      { lines: [inline], metadata: {}, hasTimingData: false },
      buildContext({ applyBackgroundExtraction: true }),
    );
    const stored = useProjectStore.getState().lines;
    expect(stored.length).toBe(1);
    expect(stored[0].text).toBe("Hello");
    expect(stored[0].backgroundText).toBe("world");
  });

  it("passes original lines through when the flag is unset", async () => {
    const inline: LyricLine = { id: "x", text: "Hello (world)", agentId: "v1" };
    await importParsedLyrics(
      { lines: [inline], metadata: {}, hasTimingData: false },
      buildContext({ applyBackgroundExtraction: false }),
    );
    const stored = useProjectStore.getState().lines;
    expect(stored.length).toBe(1);
    expect(stored[0].text).toBe("Hello (world)");
    expect(stored[0].backgroundText).toBeUndefined();
  });
});

// -- Agents -------------------------------------------------------------------

describe("importParsedLyrics agents", () => {
  it("adds new imported agents", async () => {
    await importParsedLyrics(
      {
        ...parseResult(),
        agents: [{ id: "v2", type: "person", name: "Voice 2" }],
      },
      buildContext(),
    );
    const stored = useProjectStore.getState().agents;
    expect(stored.find((a) => a.id === "v2")).toEqual({ id: "v2", type: "person", name: "Voice 2" });
  });

  it("updates name and type on existing agents", async () => {
    const existing: Agent = { id: "v1", type: "person", name: "Voice 1" };
    useProjectStore.getState().addAgent(existing);
    await importParsedLyrics(
      {
        ...parseResult(),
        agents: [{ id: "v1", type: "character", name: "Renamed" }],
      },
      buildContext({ agents: [existing] }),
    );
    const stored = useProjectStore.getState().agents.find((a) => a.id === "v1");
    expect(stored).toBeDefined();
    expect(stored?.name).toBe("Renamed");
    expect(stored?.type).toBe("character");
  });
});

// -- Metadata -----------------------------------------------------------------

describe("importParsedLyrics metadata", () => {
  it("does not call setMetadata when metadata is empty", async () => {
    const before = useProjectStore.getState().metadata;
    await importParsedLyrics(parseResult({ metadata: {} }), buildContext());
    expect(useProjectStore.getState().metadata).toEqual(before);
  });

  it("applies metadata when keys are present", async () => {
    await importParsedLyrics(parseResult({ metadata: { title: "Bohemian Rhapsody" } }), buildContext());
    expect(useProjectStore.getState().metadata.title).toBe("Bohemian Rhapsody");
  });
});

// -- Groups -------------------------------------------------------------------

describe("importParsedLyrics groups", () => {
  it("writes empty groups when not provided", async () => {
    await importParsedLyrics(parseResult(), buildContext());
    expect(useProjectStore.getState().groups).toEqual([]);
  });

  it("writes the provided groups", async () => {
    const groups = [{ id: "g1", label: "Chorus", color: "#a3c9ff", templateVersion: 0 }];
    await importParsedLyrics({ ...parseResult(), groups }, buildContext());
    expect(useProjectStore.getState().groups).toEqual(groups);
  });
});

// -- onResult callback --------------------------------------------------------

describe("importParsedLyrics onResult", () => {
  it("calls onResult with the parsed result and source info after a successful import", async () => {
    const calls: { parsed: ParseResult; label: string; filename: string }[] = [];
    const parsed = parseResult();
    await importParsedLyrics(
      parsed,
      buildContext({
        source: { label: "LRCLib", filename: "lrclib-123.lrc" },
        onResult: (p, src) => calls.push({ parsed: p, label: src.label, filename: src.filename }),
      }),
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].label).toBe("LRCLib");
    expect(calls[0].filename).toBe("lrclib-123.lrc");
    expect(calls[0].parsed).toBe(parsed);
  });

  it("does not call onResult when import was rejected via confirm", async () => {
    useProjectStore.getState().setLines([lineFactory("existing", "Old")]);
    let calls = 0;
    await importParsedLyrics(
      parseResult(),
      buildContext({
        confirm: async () => false,
        onResult: () => calls++,
      }),
    );
    expect(calls).toBe(0);
  });

  it("does not call onResult when parsed has no lines", async () => {
    let calls = 0;
    await importParsedLyrics(emptyParseResult(), buildContext({ onResult: () => calls++ }));
    expect(calls).toBe(0);
  });
});
