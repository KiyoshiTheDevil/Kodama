import { describe, expect, it } from "vitest";
import { DEFAULT_AGENTS } from "@/domain/agent/colors";
import { importProjectFromFile } from "@/lib/persistence";

describe("persistence: syllableSplitDefaults", () => {
  it("round-trips syllableSplitDefaults through importProjectFromFile", async () => {
    const metadata = { title: "Song", artist: "", album: "", duration: 0 };
    const payload = {
      version: 1 as const,
      savedAt: Date.now(),
      metadata,
      agents: DEFAULT_AGENTS,
      lines: [],
      groups: [],
      granularity: "word" as const,
      syllableSplitDefaults: { applyToAll: true, caseInsensitive: true },
    };
    const file = new File([JSON.stringify(payload)], "song.ttml-project.json", { type: "application/json" });

    const parsed = await importProjectFromFile(file);

    expect(parsed.syllableSplitDefaults).toEqual({ applyToAll: true, caseInsensitive: true });
  });

  it("fills in defaults when older project file is missing syllableSplitDefaults", async () => {
    const metadata = { title: "Old Song", artist: "", album: "", duration: 0 };
    const legacyPayload = {
      version: 1 as const,
      savedAt: Date.now(),
      metadata,
      agents: DEFAULT_AGENTS,
      lines: [],
      groups: [],
      granularity: "word" as const,
    };
    const file = new File([JSON.stringify(legacyPayload)], "legacy.ttml-project.json", { type: "application/json" });

    const parsed = await importProjectFromFile(file);

    expect(parsed.syllableSplitDefaults).toEqual({ applyToAll: false, caseInsensitive: false });
  });
});

describe("persistence: primingStripped round-trip", () => {
  it("persists and reads back primingStripped through importProjectFromFile", async () => {
    const metadata = { title: "Song", artist: "", album: "", duration: 0 };
    const payload = {
      version: 1 as const,
      savedAt: Date.now(),
      metadata,
      agents: DEFAULT_AGENTS,
      lines: [],
      groups: [],
      granularity: "word" as const,
      syllableSplitDefaults: { applyToAll: false, caseInsensitive: false },
      primingStripped: true,
    };
    const file = new File([JSON.stringify(payload)], "song.ttml-project.json", { type: "application/json" });

    const parsed = await importProjectFromFile(file);

    expect(parsed.primingStripped).toBe(true);
  });

  it("leaves primingStripped undefined when importing a pre-strip project", async () => {
    const metadata = { title: "Old", artist: "", album: "", duration: 0 };
    const legacy = {
      version: 1 as const,
      savedAt: Date.now(),
      metadata,
      agents: DEFAULT_AGENTS,
      lines: [],
      groups: [],
      granularity: "word" as const,
    };
    const file = new File([JSON.stringify(legacy)], "legacy.ttml-project.json", { type: "application/json" });

    const parsed = await importProjectFromFile(file);

    expect(parsed.primingStripped).toBeUndefined();
  });

  it("preserves primingStripped=false explicitly", async () => {
    const metadata = { title: "Mid", artist: "", album: "", duration: 0 };
    const payload = {
      version: 1 as const,
      savedAt: Date.now(),
      metadata,
      agents: DEFAULT_AGENTS,
      lines: [],
      groups: [],
      granularity: "word" as const,
      primingStripped: false,
    };
    const file = new File([JSON.stringify(payload)], "mid.ttml-project.json", { type: "application/json" });

    const parsed = await importProjectFromFile(file);

    expect(parsed.primingStripped).toBe(false);
  });
});
