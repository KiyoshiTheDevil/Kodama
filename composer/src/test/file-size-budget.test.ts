import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Non-test source files are held to a 300-line guideline: a file past that
// mark is doing too much and should be split into focused modules.
//
// BASELINE_OVER_BUDGET is a ratchet. It records the files that are CURRENTLY
// over 300 lines. The rules:
//   - It may only SHRINK. When a baselined file is split below 300, its entry
//     MUST be deleted from the set (the stale-entry test below forces this).
//   - A NEW entry must NEVER be added. If a new file crosses 300, do not
//     baseline it: split the file instead. The subset test below fails the
//     build for any over-budget file not already on the baseline.

const SRC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LINE_BUDGET = 300;

const BASELINE_OVER_BUDGET = new Set<string>([
  "views/timeline/use-timeline-keyboard.ts",
  "views/edit.tsx",
  "views/timeline/timeline-panel.tsx",
  "views/sync/sync-panel.tsx",
  "hooks/useSyncHandlers.ts",
  "views/timeline/utils.ts",
  "views/timeline/word-track.tsx",
  "views/timeline/paste-preview.tsx",
  "views/timeline/use-timeline-dnd.ts",
  // timeline-context-menu.tsx is intentionally exempt: it is a pure
  // declarative menu JSX tree. Carving it into per-target sub-components is
  // negative value (it would force four new .browser.test.tsx files for a
  // zero-behaviour-change extraction).
  "views/timeline/timeline-context-menu.tsx",
  "views/timeline/timeline-info-panel.tsx",
  "views/sync/scrollable-line.tsx",
  "views/timeline/line-row.tsx",
  // shortcut-definitions.ts is intentionally exempt: it is a flat declarative
  // list of keyboard shortcut definitions. Splitting it per scope would need
  // a re-export module (barrel files are banned here), which is negative value.
  "stores/shortcut-definitions.ts",
]);

function isTestFile(relPath: string): boolean {
  return relPath.endsWith(".test.ts") || relPath.endsWith(".test.tsx") || relPath.endsWith(".browser.test.tsx");
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === "dist" || entry === ".git") continue;
      yield* walk(full);
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      yield full;
    }
  }
}

function lineCount(file: string): number {
  const content = readFileSync(file, "utf8");
  if (content === "") return 0;
  const parts = content.split("\n");
  // A trailing newline produces an empty final element; it is not a real line.
  return parts[parts.length - 1] === "" ? parts.length - 1 : parts.length;
}

function collectOverBudget(): Map<string, number> {
  const overBudget = new Map<string, number>();
  for (const file of walk(SRC_ROOT)) {
    const rel = relative(SRC_ROOT, file).replace(/\\/g, "/");
    if (isTestFile(rel)) continue;
    const count = lineCount(file);
    if (count > LINE_BUDGET) overBudget.set(rel, count);
  }
  return overBudget;
}

describe("file size budget", () => {
  it("no non-test src file exceeds 300 lines outside the baseline", () => {
    const overBudget = collectOverBudget();
    const newOffenders = [...overBudget.entries()]
      .filter(([rel]) => !BASELINE_OVER_BUDGET.has(rel))
      .map(([rel, count]) => `${rel} (${count} lines)`);

    expect(newOffenders).toEqual([]);
  });

  it("every BASELINE_OVER_BUDGET entry is still over budget", () => {
    const overBudget = collectOverBudget();
    const staleEntries = [...BASELINE_OVER_BUDGET].filter((rel) => !overBudget.has(rel));

    expect(staleEntries).toEqual([]);
  });
});
