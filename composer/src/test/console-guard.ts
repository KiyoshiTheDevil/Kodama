import { afterEach, beforeEach } from "vitest";

type ConsoleMethod = "error" | "warn";
type ConsoleSpy = { method: ConsoleMethod; args: unknown[] };

interface ConsoleGuardState {
  captured: ConsoleSpy[];
  allowPatterns: RegExp[];
  originals: Partial<Record<ConsoleMethod, typeof console.error>>;
}

const globalAllowPatterns: RegExp[] = [];

function addGlobalAllowedConsolePattern(pattern: RegExp): void {
  globalAllowPatterns.push(pattern);
}

const state: ConsoleGuardState = {
  captured: [],
  allowPatterns: [],
  originals: {},
};

function formatArgs(args: unknown[]): string {
  return args
    .map((arg) => {
      if (arg instanceof Error) return arg.message;
      if (typeof arg === "string") return arg;
      try {
        return JSON.stringify(arg);
      } catch {
        return String(arg);
      }
    })
    .join(" ");
}

function isAllowed(args: unknown[]): boolean {
  const text = formatArgs(args);
  if (globalAllowPatterns.some((pattern) => pattern.test(text))) return true;
  return state.allowPatterns.some((pattern) => pattern.test(text));
}

function installConsoleGuard(): void {
  for (const method of ["error", "warn"] as const) {
    state.originals[method] = console[method];
    console[method] = (...args: unknown[]) => {
      state.captured.push({ method, args });
      state.originals[method]?.(...args);
    };
  }
}

function uninstallConsoleGuard(): void {
  for (const method of ["error", "warn"] as const) {
    const original = state.originals[method];
    if (original) console[method] = original;
  }
  state.originals = {};
}

function allowConsole(pattern: RegExp): void {
  state.allowPatterns.push(pattern);
}

function registerConsoleGuard(): void {
  beforeEach(() => {
    state.captured = [];
    state.allowPatterns = [];
    installConsoleGuard();
  });
  afterEach(() => {
    uninstallConsoleGuard();
    const unexpected = state.captured.filter((entry) => !isAllowed(entry.args));
    if (unexpected.length > 0) {
      const summary = unexpected.map((entry) => `console.${entry.method}: ${formatArgs(entry.args)}`).join("\n");
      throw new Error(`Unexpected console output:\n${summary}`);
    }
  });
}

export { registerConsoleGuard, allowConsole, addGlobalAllowedConsolePattern };
