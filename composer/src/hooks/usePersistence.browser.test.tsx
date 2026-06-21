import { describe, expect, it } from "vitest";
import { renderHook } from "vitest-browser-react";
import { usePersistence } from "@/hooks/usePersistence";
import { useProjectStore } from "@/stores/project";
import { allowConsole } from "@/test/console-guard";
import { seedProject } from "@/test/idb";

async function waitForLoad(): Promise<void> {
  for (let i = 0; i < 50; i++) {
    if (useProjectStore.getState().lines.length > 0 || useProjectStore.getState().agents.length > 0) return;
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe("usePersistence malformed-project handling", () => {
  it("logs a warn and falls back to DEFAULT_AGENTS when agents is missing", async () => {
    allowConsole(/malformed fields/);
    await seedProject({
      version: 1,
      savedAt: Date.now(),
      metadata: { title: "NoAgents" },
      lines: [{ id: "a", text: "x", agentId: "v1" }],
      granularity: "word",
    });
    await renderHook(() => usePersistence());
    await waitForLoad();
    expect(useProjectStore.getState().agents.length).toBeGreaterThan(0);
    expect(useProjectStore.getState().agents[0].id).toBe("v1");
  });

  it("logs a warn when lines is missing entirely", async () => {
    allowConsole(/malformed fields/);
    await seedProject({
      version: 1,
      savedAt: Date.now(),
      metadata: { title: "NoLines" },
      agents: [{ id: "v1", type: "person", name: "Lead" }],
      granularity: "word",
    });
    await renderHook(() => usePersistence());
    await new Promise((r) => setTimeout(r, 100));
    expect(useProjectStore.getState().lines).toEqual([]);
  });

  it("does NOT warn when the saved project is well-formed", async () => {
    await seedProject({
      version: 1,
      savedAt: Date.now(),
      metadata: { title: "AllGood" },
      lines: [{ id: "a", text: "hello", agentId: "v1" }],
      agents: [{ id: "v1", type: "person", name: "Lead" }],
      granularity: "word",
    });
    await renderHook(() => usePersistence());
    await waitForLoad();
    expect(useProjectStore.getState().agents[0].name).toBe("Lead");
  });

  it("substitutes the settings default when granularity is missing instead of writing undefined", async () => {
    allowConsole(/malformed fields/);
    await seedProject({
      version: 1,
      savedAt: Date.now(),
      metadata: { title: "NoGranularity" },
      lines: [{ id: "a", text: "x", agentId: "v1" }],
      agents: [{ id: "v1", type: "person", name: "Lead" }],
    });
    await renderHook(() => usePersistence());
    await waitForLoad();
    const granularity = useProjectStore.getState().granularity;
    expect(granularity).toBeDefined();
    expect(["line", "word"]).toContain(granularity);
  });
});
