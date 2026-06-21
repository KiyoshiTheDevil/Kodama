import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// CI guard for the boot-time persistence race.
//
// `usePersistence` restores project + audio state from IndexedDB asynchronously
// at boot. Any URL-driven hook that reads `window.location.search` /
// `window.location.hash` AND writes to the project or audio stores must wait
// for persistence to settle (await `getPersistenceSettled`) before writing,
// otherwise persistence's async restore lands last and clobbers the URL hook's
// writes.
//
// `usePersistence.ts` itself is exempt (it is the writer of the signal).

const SRC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const HOOKS_ROOT = join(SRC_ROOT, "hooks");

const WHITELIST_EXACT = new Set<string>(["hooks/usePersistence.ts"]);

const URL_READ_PATTERNS: RegExp[] = [/window\.location\.search\b/, /window\.location\.hash\b/];

// Writers to project/audio stores at boot. Heuristics intentionally broad so
// new setters get flagged by default; add to STATE_WRITER_PATTERNS if a hook
// legitimately needs to write a different store.
const STATE_WRITER_PATTERNS: RegExp[] = [
  /\.setMetadata\b/,
  /\.setLines\b/,
  /\.setGroups\b/,
  /\.setAgents\b/,
  /\.setGranularity\b/,
  /\.setSyllableSplitDefaults\b/,
  /\.setDismissedSuggestions\b/,
  /\.setDismissedExplicitSuggestions\b/,
  /\.setSource\b/,
  /\.setYouTubeSource\b/,
  /\.setYouTubeFile\b/,
  /\.reset\(\)/,
  // `useLoadYouTubeSource` indirectly writes audio + project via its returned callback.
  /useLoadYouTubeSource\b/,
];

const SETTLED_IMPORT_PATTERN = /from\s+["']@\/lib\/persistence-settled["']/;
const SETTLED_AWAIT_PATTERN = /\bgetPersistenceSettled\s*\(\s*\)/;

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === "node_modules" || entry === "dist" || entry === ".git") continue;
      yield* walk(full);
    } else if ((entry.endsWith(".ts") || entry.endsWith(".tsx")) && !entry.includes(".test.")) {
      yield full;
    }
  }
}

interface Offender {
  relPath: string;
  reason: string;
}

function scan(): Offender[] {
  const offenders: Offender[] = [];

  for (const filePath of walk(HOOKS_ROOT)) {
    const relPath = relative(SRC_ROOT, filePath).replace(/\\/g, "/");
    if (WHITELIST_EXACT.has(relPath)) continue;

    const source = readFileSync(filePath, "utf8");

    const readsUrl = URL_READ_PATTERNS.some((re) => re.test(source));
    if (!readsUrl) continue;

    const writesState = STATE_WRITER_PATTERNS.some((re) => re.test(source));
    if (!writesState) continue;

    const importsSettled = SETTLED_IMPORT_PATTERN.test(source);
    const usesSettled = SETTLED_AWAIT_PATTERN.test(source);

    if (!importsSettled || !usesSettled) {
      const missing: string[] = [];
      if (!importsSettled) missing.push("import { getPersistenceSettled } from '@/lib/persistence-settled'");
      if (!usesSettled) missing.push("call/await getPersistenceSettled() before writing state");
      offenders.push({ relPath, reason: missing.join(" + ") });
    }
  }

  return offenders;
}

// -- Tests --------------------------------------------------------------------

describe("boot-race gate", () => {
  it("every URL-driven hook that writes project/audio state awaits getPersistenceSettled", () => {
    const offenders = scan();
    if (offenders.length > 0) {
      const summary = offenders.map((o) => `  - ${o.relPath}: missing ${o.reason}`).join("\n");
      throw new Error(
        `Found ${offenders.length} hook(s) that read URL params and write project/audio state without awaiting getPersistenceSettled.\n\n${summary}\n\nAdd 'await getPersistenceSettled()' before the write, or whitelist the file in src/test/boot-race-gate.test.ts if intentional.`,
      );
    }
    expect(offenders).toEqual([]);
  });
});
