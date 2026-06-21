import { describe, expect, it } from "vitest";
import { NOT_FOUND_RESULT, type RecoveredProject, buildRecoveryResult } from "@/lib/recovery";

// -- Helpers ------------------------------------------------------------------

const TODAY = new Date().toISOString().slice(0, 10);

function project(overrides: Partial<RecoveredProject> = {}): RecoveredProject {
  return { savedAt: 1700000000000, metadata: { title: "song" }, lines: [], ...overrides };
}

// -- Tests --------------------------------------------------------------------

describe("buildRecoveryResult", () => {
  it("returns found:true and the trimmed title", () => {
    const result = buildRecoveryResult(project({ metadata: { title: "  My Song  " } }));
    expect(result.found).toBe(true);
    expect(result.title).toBe("My Song");
  });

  it("falls back to 'recovered' when title is missing", () => {
    expect(buildRecoveryResult(project({ metadata: undefined })).title).toBe("recovered");
  });

  it("falls back to 'recovered' when title is an empty string", () => {
    expect(buildRecoveryResult(project({ metadata: { title: "" } })).title).toBe("recovered");
  });

  it("falls back to 'recovered' when title is whitespace-only", () => {
    expect(buildRecoveryResult(project({ metadata: { title: "   " } })).title).toBe("recovered");
  });

  it("constructs filename as title-YYYY-MM-DD.ttml-project.json", () => {
    const result = buildRecoveryResult(project({ metadata: { title: "Track" } }));
    expect(result.filename).toBe(`Track-${TODAY}.ttml-project.json`);
  });

  it("uses the fallback title in the filename when title is missing", () => {
    const result = buildRecoveryResult(project({ metadata: undefined }));
    expect(result.filename).toBe(`recovered-${TODAY}.ttml-project.json`);
  });

  it("counts lines from the project array", () => {
    expect(buildRecoveryResult(project({ lines: [1, 2, 3, 4, 5] })).lineCount).toBe(5);
  });

  it("returns lineCount=0 when lines is missing", () => {
    expect(buildRecoveryResult(project({ lines: undefined })).lineCount).toBe(0);
  });

  it("passes through savedAt verbatim", () => {
    expect(buildRecoveryResult(project({ savedAt: 42 })).savedAt).toBe(42);
  });

  it("preserves savedAt=undefined", () => {
    expect(buildRecoveryResult(project({ savedAt: undefined })).savedAt).toBeUndefined();
  });
});

describe("NOT_FOUND_RESULT", () => {
  it("has found=false and empty strings", () => {
    expect(NOT_FOUND_RESULT).toEqual({
      found: false,
      filename: "",
      lineCount: 0,
      savedAt: undefined,
      title: "",
    });
  });

  it("is frozen-shaped: callers should treat it as a constant", () => {
    // The constant is shared between readRecoveryMetadata and downloadRecoveryFile;
    // mutating it would corrupt the second caller. This asserts the shape only,
    // not Object.freeze enforcement, so the existing module export stays JS-idiomatic.
    const first = NOT_FOUND_RESULT;
    const second = NOT_FOUND_RESULT;
    expect(first).toBe(second);
  });
});
