import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DOMAIN_ROOT = join(SRC_ROOT, "domain");
const FORBIDDEN_IMPORT = /from\s+["']@\/(stores|views|hooks|pages|ui|audio)\//;

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (full.endsWith(".ts") || full.endsWith(".tsx")) yield full;
  }
}

describe("domain layer isolation", () => {
  it("no src/domain file imports from stores/views/hooks/pages/ui/audio", () => {
    const offenders: Array<{ file: string; line: number; text: string }> = [];
    for (const file of walk(DOMAIN_ROOT)) {
      if (file.endsWith(".test.ts") || file.endsWith(".test.tsx")) continue;
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, idx) => {
          if (FORBIDDEN_IMPORT.test(line)) {
            offenders.push({ file: relative(SRC_ROOT, file), line: idx + 1, text: line.trim() });
          }
        });
    }
    expect(offenders).toEqual([]);
  });
});
