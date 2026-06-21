import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// CI guard for derived data-model concepts. Line-synced detection, word and
// instance bounds, and instance membership must go through `src/domain/**`,
// never be re-derived inline at call sites. Inline re-derivation is what makes
// these concepts impossible to evolve safely.
//
// This is a regex heuristic, not a completeness proof: it catches the common
// inline forms. A derivation routed through an intermediate variable (e.g.
// `const last = words.at(-1); last.end`) escapes it; the `LyricLine`
// discriminated union is the compile-time wall for those cases.

const SRC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Files allowed to contain the raw patterns: only `domain/**`, the modules that
// legitimately own these derivations. Nothing outside `domain/**` currently
// needs an exemption, so `WHITELIST_EXACT` is empty. If a file outside
// `domain/**` ever has a genuine, intentional reason to construct or derive one
// of these concepts inline, add its `src`-relative path here with a note saying
// why.
const WHITELIST_EXACT = new Set<string>([]);

function isWhitelisted(relPath: string): boolean {
  if (relPath.startsWith("domain/")) return true;
  return WHITELIST_EXACT.has(relPath);
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

interface ForbiddenPattern {
  name: string;
  regex: RegExp;
  use: string;
}

const FORBIDDEN: ForbiddenPattern[] = [
  {
    name: "inline line-synced check",
    regex: /\.begin !== undefined &&\s*[\w.]+\.end !== undefined/,
    use: "isLineSynced from @/domain/line/predicates",
  },
  {
    name: "inline first-word-begin access",
    regex: /\bwords\[0\]\.begin\b/,
    use: "firstBegin from @/domain/word/bounds",
  },
  {
    name: "inline last-word-end access",
    regex: /words\[words\.length - 1\]\.end\b/,
    use: "lastEnd from @/domain/word/bounds",
  },
  {
    name: "inline standalone check",
    regex: /\.groupId === undefined \|\|\s*[\w.]+\.instanceIdx === undefined/,
    use: "isLinked from @/domain/instance/predicates",
  },
  {
    name: "inline linked-line check",
    regex: /\.groupId !== undefined &&\s*[\w.]+\.instanceIdx !== undefined/,
    use: "isLinked from @/domain/instance/predicates",
  },
  {
    name: "inline word-selection identity check",
    regex: /\.wordIndex === [\w.]+\.wordIndex\b/,
    use: "sameWordSelection / isWordSelected from @/domain/selection/identity",
  },
  {
    name: "inline syllable-group run scan",
    regex: /\.syllableGroupId (?:===|!==) (?!undefined)/,
    use: "computeByGroupId / hasIntraGroupGap from @/domain/word/syllable-groups",
  },
];

describe("no common inline domain derivations outside src/domain", () => {
  for (const pattern of FORBIDDEN) {
    it(`has no ${pattern.name} (use ${pattern.use})`, () => {
      const offenders: Array<{ file: string; line: number; text: string }> = [];

      for (const file of walk(SRC_ROOT)) {
        const rel = relative(SRC_ROOT, file).replace(/\\/g, "/");
        if (isWhitelisted(rel)) continue;
        if (rel.endsWith(".test.ts") || rel.endsWith(".test.tsx")) continue;

        const lines = readFileSync(file, "utf8").split("\n");
        lines.forEach((line, idx) => {
          const trimmed = line.trim();
          if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
          if (pattern.regex.test(line)) {
            offenders.push({ file: rel, line: idx + 1, text: trimmed });
          }
        });
      }

      expect(offenders).toEqual([]);
    });
  }
});
