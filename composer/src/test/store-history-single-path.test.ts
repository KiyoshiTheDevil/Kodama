import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SLICE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../stores/project");

describe("history has a single write path", () => {
  it("no slice except history-slice mutates history/historyIndex directly", () => {
    const offenders: string[] = [];
    for (const f of readdirSync(SLICE_DIR)) {
      if (!f.endsWith("-slice.ts") || f === "history-slice.ts") continue;
      const src = readFileSync(join(SLICE_DIR, f), "utf8");
      if (/\bhistory(Index)?\s*:/.test(src)) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });
});
