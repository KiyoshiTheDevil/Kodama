import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ALT_KEY, isMac, MOD_KEY } from "./platform";

describe("platform mod-key constants", () => {
  it("MOD_KEY matches isMac", () => {
    expect(MOD_KEY).toBe(isMac ? "Cmd" : "Ctrl");
  });

  it("ALT_KEY matches isMac", () => {
    expect(ALT_KEY).toBe(isMac ? "Option" : "Alt");
  });
});

const SRC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const HARDCODE_WHITELIST = new Set(
  [
    "utils/platform.ts",
    "utils/platform.test.ts",
    "ui/help-modal.tsx",
    "ui/shortcut-rebind-row.tsx",
    "stores/shortcut-bindings.ts",
  ].map((p) => p.replace(/\//g, "/")),
);

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

const HARDCODE_PATTERNS = [
  /"Cmd\+/,
  /'Cmd\+/,
  /`Cmd\+/,
  /"Cmd \+/,
  /'Cmd \+/,
  /`Cmd \+/,
  /"Ctrl\+/,
  /'Ctrl\+/,
  /`Ctrl\+/,
];

describe("no hardcoded modifier-key strings outside whitelist", () => {
  it("every user-facing 'Cmd+' / 'Ctrl+' literal goes through platform.MOD_KEY", () => {
    const offenders: Array<{ file: string; line: number; text: string }> = [];

    for (const file of walk(SRC_ROOT)) {
      const rel = relative(SRC_ROOT, file).replace(/\\/g, "/");
      if (HARDCODE_WHITELIST.has(rel)) continue;
      if (rel.endsWith(".test.ts") || rel.endsWith(".test.tsx")) continue;

      const content = readFileSync(file, "utf8");
      const lines = content.split("\n");
      lines.forEach((line, idx) => {
        const trimmed = line.trim();
        if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
        if (HARDCODE_PATTERNS.some((re) => re.test(line))) {
          offenders.push({ file: rel, line: idx + 1, text: line.trim() });
        }
      });
    }

    expect(offenders).toEqual([]);
  });
});
