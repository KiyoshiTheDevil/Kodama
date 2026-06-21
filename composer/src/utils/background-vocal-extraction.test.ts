import { describe, expect, it } from "vitest";
import type { LyricLine } from "@/domain/line/model";
import { createLine } from "@/test/factories";
import {
  classifyLine,
  extractBackgroundVocals,
  extractInlineFromLine,
  lineHasInlineParens,
  scanParenGroups,
} from "@/utils/background-vocal-extraction";

// -- Specification table -------------------------------------------------------

describe("scanParenGroups: specification table", () => {
  it("returns balanced with no groups for plain text", () => {
    const scan = scanParenGroups("Hello world");
    expect(scan.status).toBe("balanced");
    expect(scan.groups).toEqual([]);
  });

  it("returns one group for a single balanced pair", () => {
    const text = "Hello (ooh) world";
    const scan = scanParenGroups(text);
    expect(scan.status).toBe("balanced");
    expect(scan.groups).toHaveLength(1);
    expect(scan.groups[0].inner).toBe("ooh");
    expect(scan.groups[0].start).toBe(text.indexOf("("));
    expect(scan.groups[0].end).toBe(text.indexOf(")"));
  });

  it("returns two groups for two balanced pairs", () => {
    const scan = scanParenGroups("Hi (a) and (b)");
    expect(scan.status).toBe("balanced");
    expect(scan.groups).toHaveLength(2);
    expect(scan.groups[0].inner).toBe("a");
    expect(scan.groups[1].inner).toBe("b");
  });

  it("returns unbalanced for an unclosed open paren", () => {
    const scan = scanParenGroups("Hello (ooh");
    expect(scan.status).toBe("unbalanced");
    expect(scan.groups).toEqual([]);
  });

  it("returns unbalanced for a stray close paren", () => {
    const scan = scanParenGroups("yeah)");
    expect(scan.status).toBe("unbalanced");
    expect(scan.groups).toEqual([]);
  });

  it("returns unbalanced when depth goes negative before recovering", () => {
    const scan = scanParenGroups("Hello )ooh(");
    expect(scan.status).toBe("unbalanced");
    expect(scan.groups).toEqual([]);
  });

  it("returns nested for back-to-back opens", () => {
    const scan = scanParenGroups("((ooh))");
    expect(scan.status).toBe("nested");
    expect(scan.groups).toEqual([]);
  });

  it("returns nested for an open paren inside an open group", () => {
    const scan = scanParenGroups("(ooh (ah))");
    expect(scan.status).toBe("nested");
    expect(scan.groups).toEqual([]);
  });

  it("returns balanced with no groups for an empty string", () => {
    const scan = scanParenGroups("");
    expect(scan.status).toBe("balanced");
    expect(scan.groups).toEqual([]);
  });
});

// -- Inner content edge cases --------------------------------------------------

describe("scanParenGroups: inner content", () => {
  it("treats an empty pair as a balanced group with empty inner", () => {
    const scan = scanParenGroups("()");
    expect(scan.status).toBe("balanced");
    expect(scan.groups).toHaveLength(1);
    expect(scan.groups[0].inner).toBe("");
  });

  it("returns raw inner without trimming surrounding spaces", () => {
    const scan = scanParenGroups("( a b )");
    expect(scan.status).toBe("balanced");
    expect(scan.groups).toHaveLength(1);
    expect(scan.groups[0].inner).toBe(" a b ");
  });

  it("preserves inner whitespace exactly for a multi-word group", () => {
    const scan = scanParenGroups("la (ooh ah  yeah) la");
    expect(scan.status).toBe("balanced");
    expect(scan.groups[0].inner).toBe("ooh ah  yeah");
  });
});

// -- Group positioning ---------------------------------------------------------

describe("scanParenGroups: group positioning", () => {
  it("handles adjacent groups with no separator", () => {
    const text = "(a)(b)";
    const scan = scanParenGroups(text);
    expect(scan.status).toBe("balanced");
    expect(scan.groups).toHaveLength(2);
    expect(scan.groups[0].inner).toBe("a");
    expect(scan.groups[1].inner).toBe("b");
  });

  it("handles a group at the start of the string", () => {
    const text = "(a) b";
    const scan = scanParenGroups(text);
    expect(scan.status).toBe("balanced");
    expect(scan.groups).toHaveLength(1);
    expect(scan.groups[0].start).toBe(0);
    expect(scan.groups[0].end).toBe(2);
    expect(scan.groups[0].inner).toBe("a");
  });

  it("handles a group at the end of the string", () => {
    const text = "a (b)";
    const scan = scanParenGroups(text);
    expect(scan.status).toBe("balanced");
    expect(scan.groups).toHaveLength(1);
    expect(scan.groups[0].start).toBe(text.length - 3);
    expect(scan.groups[0].end).toBe(text.length - 1);
    expect(scan.groups[0].inner).toBe("b");
  });

  it("reports start at '(' and end at ')' for every group", () => {
    const text = "Hi (a) and (b)";
    const scan = scanParenGroups(text);
    expect(scan.status).toBe("balanced");
    for (const group of scan.groups) {
      expect(text[group.start]).toBe("(");
      expect(text[group.end]).toBe(")");
      expect(text.slice(group.start + 1, group.end)).toBe(group.inner);
    }
  });

  it("reports correct indices for adjacent groups", () => {
    const scan = scanParenGroups("(a)(b)");
    expect(scan.groups[0].start).toBe(0);
    expect(scan.groups[0].end).toBe(2);
    expect(scan.groups[1].start).toBe(3);
    expect(scan.groups[1].end).toBe(5);
  });
});

// -- Unbalanced edge cases -----------------------------------------------------

describe("scanParenGroups: unbalanced edge cases", () => {
  it("returns unbalanced for a lone close paren", () => {
    const scan = scanParenGroups(")");
    expect(scan.status).toBe("unbalanced");
    expect(scan.groups).toEqual([]);
  });

  it("returns unbalanced for a lone open paren", () => {
    const scan = scanParenGroups("(");
    expect(scan.status).toBe("unbalanced");
    expect(scan.groups).toEqual([]);
  });

  it("returns unbalanced when a close paren precedes a balanced pair", () => {
    const scan = scanParenGroups(")(a)");
    expect(scan.status).toBe("unbalanced");
    expect(scan.groups).toEqual([]);
  });

  it("returns unbalanced when an extra open paren trails balanced groups", () => {
    const scan = scanParenGroups("(a) (b) (");
    expect(scan.status).toBe("unbalanced");
    expect(scan.groups).toEqual([]);
  });
});

// -- classifyLine: specification table -----------------------------------------

describe("classifyLine: specification table", () => {
  it("classifies plain text as none", () => {
    const result = classifyLine("Hello world");
    expect(result.kind).toBe("none");
    expect(result.mainText).toBe("Hello world");
    expect(result.bgText).toBe("");
  });

  it("classifies a mid-line group as inline", () => {
    const result = classifyLine("Hello (ooh) world");
    expect(result.kind).toBe("inline");
    expect(result.mainText).toBe("Hello world");
    expect(result.bgText).toBe("ooh");
  });

  it("classifies a trailing group as inline", () => {
    const result = classifyLine("Hello (ooh)");
    expect(result.kind).toBe("inline");
    expect(result.mainText).toBe("Hello");
    expect(result.bgText).toBe("ooh");
  });

  it("classifies a leading group as inline", () => {
    const result = classifyLine("(ooh) world");
    expect(result.kind).toBe("inline");
    expect(result.mainText).toBe("world");
    expect(result.bgText).toBe("ooh");
  });

  it("classifies multiple inline groups, joining bg text with a space", () => {
    const result = classifyLine("Hi (a) and (b) bye");
    expect(result.kind).toBe("inline");
    expect(result.mainText).toBe("Hi and bye");
    expect(result.bgText).toBe("a b");
  });

  it("classifies a single full-line group as standalone", () => {
    const result = classifyLine("(ooh yeah)");
    expect(result.kind).toBe("standalone");
    expect(result.mainText).toBe("");
    expect(result.bgText).toBe("ooh yeah");
  });

  it("classifies multiple groups covering the whole line as standalone", () => {
    const result = classifyLine("(ooh) (yeah)");
    expect(result.kind).toBe("standalone");
    expect(result.mainText).toBe("");
    expect(result.bgText).toBe("ooh yeah");
  });

  it("classifies an unclosed group as skip", () => {
    const result = classifyLine("Hello (ooh");
    expect(result.kind).toBe("skip");
  });

  it("classifies nested groups as skip", () => {
    const result = classifyLine("((ooh))");
    expect(result.kind).toBe("skip");
  });

  it("classifies a trailing unclosed group as skip", () => {
    const result = classifyLine("Hello (ooh) world (ah");
    expect(result.kind).toBe("skip");
  });

  it("leaves a line with an empty group untouched as none", () => {
    const result = classifyLine("Hello ()");
    expect(result.kind).toBe("none");
    expect(result.mainText).toBe("Hello ()");
    expect(result.bgText).toBe("");
  });

  it("classifies a whitespace-only group as none with empty bg text", () => {
    const result = classifyLine("(  )");
    expect(result.kind).toBe("none");
    expect(result.bgText).toBe("");
  });
});

// -- classifyLine: whitespace handling -----------------------------------------

describe("classifyLine: whitespace handling", () => {
  it("trims leading and trailing spaces inside a group for bg text", () => {
    const result = classifyLine("la (  ooh  ) la");
    expect(result.kind).toBe("inline");
    expect(result.bgText).toBe("ooh");
    expect(result.mainText).toBe("la la");
  });

  it("collapses runs of two or more spaces in mainText to one space", () => {
    const result = classifyLine("a  (x)  b");
    expect(result.kind).toBe("inline");
    expect(result.mainText).toBe("a b");
    expect(result.bgText).toBe("x");
  });

  it("classifies a whitespace-only line as none", () => {
    const result = classifyLine("   ");
    expect(result.kind).toBe("none");
    expect(result.bgText).toBe("");
    expect(result.mainText).toBe("   ");
  });

  it("classifies an empty string as none", () => {
    const result = classifyLine("");
    expect(result.kind).toBe("none");
    expect(result.bgText).toBe("");
    expect(result.mainText).toBe("");
  });
});

// -- classifyLine: mixed empty and non-empty groups ----------------------------

describe("classifyLine: mixed empty and non-empty groups", () => {
  it("filters out an empty group when joining bg text", () => {
    const result = classifyLine("Hi (a) and () bye");
    expect(result.kind).toBe("inline");
    expect(result.bgText).toBe("a");
    expect(result.mainText).toBe("Hi and bye");
  });

  it("filters out a whitespace-only group when joining bg text", () => {
    const result = classifyLine("Hi (a) and (   ) bye");
    expect(result.kind).toBe("inline");
    expect(result.bgText).toBe("a");
    expect(result.mainText).toBe("Hi and bye");
  });

  it("classifies a standalone line when the only non-empty group covers everything", () => {
    const result = classifyLine("() (ooh)");
    expect(result.kind).toBe("standalone");
    expect(result.bgText).toBe("ooh");
    expect(result.mainText).toBe("");
  });
});

// -- classifyLine: returned shape ----------------------------------------------

describe("classifyLine: returned shape", () => {
  it("returns a well-formed shape for skip outcomes", () => {
    const result = classifyLine("Hello (ooh");
    expect(result.kind).toBe("skip");
    expect(result.groups).toEqual([]);
    expect(result.bgText).toBe("");
    expect(result.mainText).toBe("Hello (ooh");
  });

  it("returns a well-formed shape for none outcomes with no groups", () => {
    const result = classifyLine("Hello world");
    expect(result.kind).toBe("none");
    expect(result.groups).toEqual([]);
    expect(result.bgText).toBe("");
    expect(result.mainText).toBe("Hello world");
  });

  it("retains scanned groups for none outcomes with empty groups", () => {
    const result = classifyLine("Hello ()");
    expect(result.kind).toBe("none");
    expect(result.groups).toHaveLength(1);
    expect(result.groups[0].inner).toBe("");
  });

  it("exposes scanned groups for inline outcomes", () => {
    const result = classifyLine("Hi (a) and (b) bye");
    expect(result.groups).toHaveLength(2);
    expect(result.groups[0].inner).toBe("a");
    expect(result.groups[1].inner).toBe("b");
  });
});

// -- extractInlineFromLine -----------------------------------------------------

describe("extractInlineFromLine", () => {
  it("extracts an inline group from an untimed line", () => {
    const line: LyricLine = { id: "1", text: "Hello (ooh) world", agentId: "v1" };
    const result = extractInlineFromLine(line, { mergeStandaloneLines: false, preserveBrackets: false });
    expect(result.text).toBe("Hello world");
    expect(result.backgroundText).toBe("ooh");
  });

  it("appends to existing backgroundText on an untimed line", () => {
    const line: LyricLine = {
      id: "1",
      text: "Hello (ooh)",
      agentId: "v1",
      backgroundText: "ah",
    };
    const result = extractInlineFromLine(line, { mergeStandaloneLines: false, preserveBrackets: false });
    expect(result.text).toBe("Hello");
    expect(result.backgroundText).toBe("ah ooh");
  });

  it("sets backgroundText to just the extracted text when none exists", () => {
    const line: LyricLine = {
      id: "1",
      text: "Hello (ooh) world",
      agentId: "v1",
      backgroundText: undefined,
    };
    const result = extractInlineFromLine(line, { mergeStandaloneLines: false, preserveBrackets: false });
    expect(result.backgroundText).toBe("ooh");
  });

  it("returns the same reference for a line with no parentheses", () => {
    const line: LyricLine = { id: "1", text: "Hello world", agentId: "v1" };
    expect(extractInlineFromLine(line, { mergeStandaloneLines: false, preserveBrackets: false })).toBe(line);
  });

  it("returns the same reference for a standalone line", () => {
    const line: LyricLine = { id: "1", text: "(ooh yeah)", agentId: "v1" };
    expect(extractInlineFromLine(line, { mergeStandaloneLines: false, preserveBrackets: false })).toBe(line);
  });

  it("returns the same reference for a skip line", () => {
    const line: LyricLine = { id: "1", text: "Hello (ooh", agentId: "v1" };
    expect(extractInlineFromLine(line, { mergeStandaloneLines: false, preserveBrackets: false })).toBe(line);
  });

  it("preserves begin and end on a line-synced line", () => {
    const line: LyricLine = {
      id: "1",
      text: "Hi (ooh) there",
      agentId: "v1",
      begin: 1,
      end: 3,
    };
    const result = extractInlineFromLine(line, { mergeStandaloneLines: false, preserveBrackets: false });
    expect(result.text).toBe("Hi there");
    expect(result.backgroundText).toBe("ooh");
    expect(result.begin).toBe(1);
    expect(result.end).toBe(3);
    expect(result.words).toBeUndefined();
  });

  it("extracts an inline group from a word-synced line", () => {
    const line: LyricLine = {
      id: "1",
      text: "Hi (ooh) there",
      agentId: "v1",
      words: [
        { text: "Hi ", begin: 0, end: 1 },
        { text: "(ooh) ", begin: 1, end: 2 },
        { text: "there", begin: 2, end: 3 },
      ],
    };
    const result = extractInlineFromLine(line, { mergeStandaloneLines: false, preserveBrackets: false });
    expect(result).not.toBe(line);
    expect(result.text).toBe("Hi there");
    expect(result.backgroundText).toBe("ooh");
    expect(result.backgroundWords).toBeUndefined();
    expect(result.words).toEqual([
      { text: "Hi ", begin: 0, end: 1 },
      { text: "there", begin: 2, end: 3 },
    ]);
  });

  it("does not mutate the input line", () => {
    const line: LyricLine = {
      id: "1",
      text: "Hello (ooh) world",
      agentId: "v1",
      backgroundText: "ah",
    };
    extractInlineFromLine(line, { mergeStandaloneLines: false, preserveBrackets: false });
    expect(line.text).toBe("Hello (ooh) world");
    expect(line.backgroundText).toBe("ah");
  });

  it("returns the same reference for a line-synced line carrying manual background words", () => {
    const line: LyricLine = {
      id: "1",
      text: "Hi (ooh) there",
      agentId: "v1",
      begin: 1,
      end: 3,
      backgroundWords: [{ text: "clap", begin: 1.2, end: 1.8 }],
    };
    expect(extractInlineFromLine(line, { mergeStandaloneLines: false, preserveBrackets: false })).toBe(line);
  });

  it("returns the same reference for an untimed line carrying manual background words", () => {
    const line: LyricLine = {
      id: "1",
      text: "Hi (ooh) there",
      agentId: "v1",
      backgroundWords: [{ text: "clap", begin: 1.2, end: 1.8 }],
    };
    expect(extractInlineFromLine(line, { mergeStandaloneLines: false, preserveBrackets: false })).toBe(line);
  });

  it("still extracts a line-synced line when backgroundWords is an empty array", () => {
    const line: LyricLine = {
      id: "1",
      text: "Hi (ooh) there",
      agentId: "v1",
      begin: 1,
      end: 3,
      backgroundWords: [],
    };
    const result = extractInlineFromLine(line, { mergeStandaloneLines: false, preserveBrackets: false });
    expect(result.text).toBe("Hi there");
    expect(result.backgroundText).toBe("ooh");
  });
});

// -- extractInlineFromLine: word-synced extraction -----------------------------

describe("extractInlineFromLine: word-synced extraction", () => {
  it("extracts a mid-line paren word and preserves survivor timing", () => {
    const line: LyricLine = {
      id: "1",
      text: "Hello (ooh) world",
      agentId: "v1",
      words: [
        { text: "Hello ", begin: 0.5, end: 1.2 },
        { text: "(ooh) ", begin: 1.2, end: 1.9 },
        { text: "world", begin: 1.9, end: 2.7 },
      ],
    };
    const result = extractInlineFromLine(line, { mergeStandaloneLines: false, preserveBrackets: false });
    expect(result).not.toBe(line);
    expect(result.text).toBe("Hello world");
    expect(result.backgroundText).toBe("ooh");
    expect(result.backgroundWords).toBeUndefined();
    expect(result.words).toEqual([
      { text: "Hello ", begin: 0.5, end: 1.2 },
      { text: "world", begin: 1.9, end: 2.7 },
    ]);
  });

  it("extracts a trailing paren word and trims the last survivor's trailing space", () => {
    const line: LyricLine = {
      id: "1",
      text: "Hello (ooh)",
      agentId: "v1",
      words: [
        { text: "Hello ", begin: 0, end: 1 },
        { text: "(ooh)", begin: 1, end: 2 },
      ],
    };
    const result = extractInlineFromLine(line, { mergeStandaloneLines: false, preserveBrackets: false });
    expect(result).not.toBe(line);
    expect(result.text).toBe("Hello");
    expect(result.backgroundText).toBe("ooh");
    expect(result.words).toEqual([{ text: "Hello", begin: 0, end: 1 }]);
  });

  it("extracts a multi-token group spanning several words", () => {
    const line: LyricLine = {
      id: "1",
      text: "Hello (ooh yeah) world",
      agentId: "v1",
      words: [
        { text: "Hello ", begin: 0, end: 1 },
        { text: "(ooh ", begin: 1, end: 1.5 },
        { text: "yeah) ", begin: 1.5, end: 2 },
        { text: "world", begin: 2, end: 3 },
      ],
    };
    const result = extractInlineFromLine(line, { mergeStandaloneLines: false, preserveBrackets: false });
    expect(result).not.toBe(line);
    expect(result.text).toBe("Hello world");
    expect(result.backgroundText).toBe("ooh yeah");
    expect(result.words).toEqual([
      { text: "Hello ", begin: 0, end: 1 },
      { text: "world", begin: 2, end: 3 },
    ]);
  });

  it("returns the same reference when a paren is glued onto a word token", () => {
    const line: LyricLine = {
      id: "1",
      text: "Hello(ooh) world",
      agentId: "v1",
      words: [
        { text: "Hello(ooh) ", begin: 0, end: 1 },
        { text: "world", begin: 1, end: 2 },
      ],
    };
    expect(extractInlineFromLine(line, { mergeStandaloneLines: false, preserveBrackets: false })).toBe(line);
  });

  it("preserves explicit and syllableGroupId fields on survivors", () => {
    const line: LyricLine = {
      id: "1",
      text: "Hello (ooh) world",
      agentId: "v1",
      words: [
        { text: "Hello ", begin: 0, end: 1, explicit: true, syllableGroupId: "g1" },
        { text: "(ooh) ", begin: 1, end: 2 },
        { text: "world", begin: 2, end: 3, explicit: true, syllableGroupId: "g2" },
      ],
    };
    const result = extractInlineFromLine(line, { mergeStandaloneLines: false, preserveBrackets: false });
    expect(result.words).toEqual([
      { text: "Hello ", begin: 0, end: 1, explicit: true, syllableGroupId: "g1" },
      { text: "world", begin: 2, end: 3, explicit: true, syllableGroupId: "g2" },
    ]);
  });

  it("extracts cleanly when the line has syllable-split words", () => {
    const line: LyricLine = {
      id: "1",
      text: "Hel|lo (ooh) world",
      agentId: "v1",
      words: [
        { text: "Hel", begin: 0, end: 0.5 },
        { text: "lo ", begin: 0.5, end: 1 },
        { text: "(ooh) ", begin: 1, end: 2 },
        { text: "world", begin: 2, end: 3 },
      ],
    };
    const result = extractInlineFromLine(line, { mergeStandaloneLines: false, preserveBrackets: false });
    expect(result).not.toBe(line);
    expect(result.text).toBe("Hel|lo world");
    expect(result.backgroundText).toBe("ooh");
    expect(result.words).toEqual([
      { text: "Hel", begin: 0, end: 0.5 },
      { text: "lo ", begin: 0.5, end: 1 },
      { text: "world", begin: 2, end: 3 },
    ]);
  });

  it("returns the same reference when the line already has background words", () => {
    const line: LyricLine = {
      id: "1",
      text: "Hello (ooh) world",
      agentId: "v1",
      words: [
        { text: "Hello ", begin: 0, end: 1 },
        { text: "(ooh) ", begin: 1, end: 2 },
        { text: "world", begin: 2, end: 3 },
      ],
      backgroundWords: [{ text: "ah", begin: 0, end: 1 }],
    };
    expect(extractInlineFromLine(line, { mergeStandaloneLines: false, preserveBrackets: false })).toBe(line);
  });

  it("appends to existing backgroundText on a word-synced line", () => {
    const line: LyricLine = {
      id: "1",
      text: "Hello (ooh) world",
      agentId: "v1",
      backgroundText: "ah",
      words: [
        { text: "Hello ", begin: 0, end: 1 },
        { text: "(ooh) ", begin: 1, end: 2 },
        { text: "world", begin: 2, end: 3 },
      ],
    };
    const result = extractInlineFromLine(line, { mergeStandaloneLines: false, preserveBrackets: false });
    expect(result.backgroundText).toBe("ah ooh");
  });

  it("does not mutate the input line or its words array", () => {
    const words = [
      { text: "Hello ", begin: 0, end: 1 },
      { text: "(ooh) ", begin: 1, end: 2 },
      { text: "world", begin: 2, end: 3 },
    ];
    const line: LyricLine = { id: "1", text: "Hello (ooh) world", agentId: "v1", words };
    extractInlineFromLine(line, { mergeStandaloneLines: false, preserveBrackets: false });
    expect(line.text).toBe("Hello (ooh) world");
    expect(line.words).toBe(words);
    expect(line.words).toEqual([
      { text: "Hello ", begin: 0, end: 1 },
      { text: "(ooh) ", begin: 1, end: 2 },
      { text: "world", begin: 2, end: 3 },
    ]);
  });

  it("returns the same reference for a word-synced standalone line", () => {
    const line: LyricLine = {
      id: "1",
      text: "(ooh yeah)",
      agentId: "v1",
      words: [
        { text: "(ooh ", begin: 0, end: 1 },
        { text: "yeah)", begin: 1, end: 2 },
      ],
    };
    expect(extractInlineFromLine(line, { mergeStandaloneLines: false, preserveBrackets: false })).toBe(line);
  });
});

// -- extractBackgroundVocals: specification table ------------------------------

describe("extractBackgroundVocals: specification table", () => {
  it("extracts an inline line regardless of mergeStandaloneLines", () => {
    for (const mergeStandaloneLines of [true, false]) {
      const lines = [createLine({ id: "1", text: "A (ooh) B" })];
      const result = extractBackgroundVocals(lines, { mergeStandaloneLines, preserveBrackets: false });
      expect(result).toHaveLength(1);
      expect(result[0].text).toBe("A B");
      expect(result[0].backgroundText).toBe("ooh");
    }
  });

  it("merges a standalone line into the previous line when merge is enabled", () => {
    const lines = [createLine({ id: "1", text: "Real line" }), createLine({ id: "2", text: "(ooh yeah)" })];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: false });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
    expect(result[0].text).toBe("Real line");
    expect(result[0].backgroundText).toBe("ooh yeah");
  });

  it("leaves a standalone line in place when merge is disabled", () => {
    const lines = [createLine({ id: "1", text: "Real line" }), createLine({ id: "2", text: "(ooh yeah)" })];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: false, preserveBrackets: false });
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(lines[0]);
    expect(result[1]).toBe(lines[1]);
  });

  it("merges consecutive standalone lines into the same previous line", () => {
    const lines = [
      createLine({ id: "1", text: "Real line" }),
      createLine({ id: "2", text: "(ooh)" }),
      createLine({ id: "3", text: "(yeah)" }),
    ];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: false });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
    expect(result[0].text).toBe("Real line");
    expect(result[0].backgroundText).toBe("ooh yeah");
  });

  it("does not merge a leading standalone line with no valid predecessor", () => {
    const lines = [createLine({ id: "1", text: "(ooh)" }), createLine({ id: "2", text: "Real line" })];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: false });
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(lines[0]);
    expect(result[1]).toBe(lines[1]);
  });

  it("does not merge into an empty-text predecessor", () => {
    const lines = [
      createLine({ id: "1", text: "Real" }),
      createLine({ id: "2", text: "" }),
      createLine({ id: "3", text: "(ooh)" }),
    ];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: false });
    expect(result).toHaveLength(3);
    expect(result[0]).toBe(lines[0]);
    expect(result[1]).toBe(lines[1]);
    expect(result[2]).toBe(lines[2]);
  });

  it("does not merge when the predecessor is a linked line", () => {
    const lines = [
      createLine({ id: "1", text: "Chorus", groupId: "g1", instanceIdx: 0 }),
      createLine({ id: "2", text: "(ooh)" }),
    ];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: false });
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(lines[0]);
    expect(result[1]).toBe(lines[1]);
  });

  it("does not merge when the standalone line is itself linked", () => {
    const lines = [
      createLine({ id: "1", text: "Real" }),
      createLine({ id: "2", text: "(ooh)", groupId: "g1", instanceIdx: 0 }),
    ];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: false });
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(lines[0]);
    expect(result[1]).toBe(lines[1]);
  });

  it("merges a standalone line into a predecessor that was itself inline-extracted", () => {
    const lines = [createLine({ id: "1", text: "A (ooh) B" }), createLine({ id: "2", text: "(yeah)" })];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: false });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
    expect(result[0].text).toBe("A B");
    expect(result[0].backgroundText).toBe("ooh yeah");
  });
});

// -- extractBackgroundVocals: none and skip lines -----------------------------

describe("extractBackgroundVocals: none and skip lines", () => {
  it("pushes a none line by reference", () => {
    const lines = [createLine({ id: "1", text: "Plain line" })];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: false });
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(lines[0]);
  });

  it("pushes a skip line by reference", () => {
    const lines = [createLine({ id: "1", text: "Hello (ooh" })];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: false });
    expect(result).toHaveLength(1);
    expect(result[0]).toBe(lines[0]);
  });

  it("does not merge a standalone line into a skip predecessor", () => {
    const lines = [createLine({ id: "1", text: "Hello (ooh" }), createLine({ id: "2", text: "(yeah)" })];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: false });
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(lines[0]);
    expect(result[1]).toBe(lines[1]);
  });
});

// -- extractBackgroundVocals: timing-aware standalone merge -------------------

describe("extractBackgroundVocals: timing-aware standalone merge", () => {
  it("merges an untimed standalone line into an untimed predecessor as text only", () => {
    const lines = [createLine({ id: "1", text: "Real line" }), createLine({ id: "2", text: "(ooh yeah)" })];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: false });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
    expect(result[0].backgroundText).toBe("ooh yeah");
    expect(result[0].backgroundWords).toBeUndefined();
  });

  it("carries word-synced standalone timing into an untimed predecessor with no background", () => {
    const lines = [
      createLine({ id: "1", text: "Real line" }),
      createLine({
        id: "2",
        text: "(ooh yeah)",
        words: [
          { text: "(ooh ", begin: 5.0, end: 5.6 },
          { text: "yeah)", begin: 5.6, end: 6.2 },
        ],
      }),
    ];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: false });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
    expect(result[0].backgroundWords).toEqual([
      { text: "ooh ", begin: 5.0, end: 5.6 },
      { text: "yeah", begin: 5.6, end: 6.2 },
    ]);
    expect(result[0].backgroundText).toBe("ooh yeah");
  });

  it("appends carried words after the predecessor's existing background words", () => {
    const lines = [
      createLine({
        id: "1",
        text: "Real line",
        backgroundText: "ah ",
        backgroundWords: [{ text: "ah ", begin: 1.0, end: 1.5 }],
      }),
      createLine({
        id: "2",
        text: "(ooh yeah)",
        words: [
          { text: "(ooh ", begin: 5.0, end: 5.6 },
          { text: "yeah)", begin: 5.6, end: 6.2 },
        ],
      }),
    ];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: false });
    expect(result).toHaveLength(1);
    expect(result[0].backgroundWords).toEqual([
      { text: "ah ", begin: 1.0, end: 1.5 },
      { text: "ooh ", begin: 5.0, end: 5.6 },
      { text: "yeah", begin: 5.6, end: 6.2 },
    ]);
    expect(result[0].backgroundText).toBe("ah ooh yeah");
  });

  it("falls back to text-only when predecessor has background text but no words", () => {
    const lines = [
      createLine({ id: "1", text: "Real line", backgroundText: "ah" }),
      createLine({
        id: "2",
        text: "(ooh yeah)",
        words: [
          { text: "(ooh ", begin: 5.0, end: 5.6 },
          { text: "yeah)", begin: 5.6, end: 6.2 },
        ],
      }),
    ];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: false });
    expect(result).toHaveLength(1);
    expect(result[0].backgroundText).toBe("ah ooh yeah");
    expect(result[0].backgroundWords).toBeUndefined();
  });

  it("seeds background words from a line-synced standalone via createInitialBgWords", () => {
    const lines = [
      createLine({ id: "1", text: "Real line" }),
      createLine({ id: "2", text: "(ooh)", begin: 4.0, end: 6.0 }),
    ];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: false });
    expect(result).toHaveLength(1);
    expect(result[0].backgroundText).toBe("ooh");
    const bgWords = result[0].backgroundWords;
    expect(bgWords).toHaveLength(1);
    expect(bgWords?.[0].text).toBe("ooh");
    expect(bgWords?.[0].begin).toBe(4.0);
    expect(bgWords?.[0].end).toBe(6.0);
  });

  it("spans the standalone time range across multiple words from a line-synced standalone", () => {
    const lines = [
      createLine({ id: "1", text: "Real line" }),
      createLine({ id: "2", text: "(ooh yeah)", begin: 4.0, end: 6.0 }),
    ];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: false });
    const bgWords = result[0].backgroundWords;
    expect(bgWords).toHaveLength(2);
    expect(bgWords?.[0].begin).toBe(4.0);
    expect(bgWords?.[bgWords.length - 1].end).toBe(6.0);
  });

  it("does not merge an untimed standalone into a predecessor with timed background words", () => {
    const lines = [
      createLine({
        id: "1",
        text: "Real line",
        backgroundText: "ah",
        backgroundWords: [{ text: "ah", begin: 1.0, end: 1.5 }],
      }),
      createLine({ id: "2", text: "(ooh)" }),
    ];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: false });
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(lines[0]);
    expect(result[1]).toBe(lines[1]);
    expect(result[0].backgroundWords).toEqual([{ text: "ah", begin: 1.0, end: 1.5 }]);
  });

  it("falls back to text-only when standalone word count does not match bg text", () => {
    const lines = [
      createLine({ id: "1", text: "Real line" }),
      createLine({
        id: "2",
        text: "( ooh yeah )",
        words: [
          { text: "( ", begin: 5.0, end: 5.2 },
          { text: "ooh ", begin: 5.2, end: 5.6 },
          { text: "yeah ", begin: 5.6, end: 6.0 },
          { text: ")", begin: 6.0, end: 6.2 },
        ],
      }),
    ];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: false });
    expect(result).toHaveLength(1);
    expect(result[0].backgroundText).toBe("ooh yeah");
    expect(result[0].backgroundWords).toBeUndefined();
  });
});

// -- extractBackgroundVocals: merge gate -------------------------------------

describe("extractBackgroundVocals: merge gate", () => {
  it("does not merge a standalone line into a standalone predecessor", () => {
    const lines = [createLine({ id: "1", text: "(ooh)" }), createLine({ id: "2", text: "(yeah)" })];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: false });
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(lines[0]);
    expect(result[1]).toBe(lines[1]);
  });

  it("still merges a standalone line into a real lyric predecessor", () => {
    const lines = [
      createLine({ id: "1", text: "Real" }),
      createLine({ id: "2", text: "(ooh)" }),
      createLine({ id: "3", text: "(yeah)" }),
    ];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: false });
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
    expect(result[0].text).toBe("Real");
    expect(result[0].backgroundText).toBe("ooh yeah");
  });
});

// -- extractBackgroundVocals: reference stability -----------------------------

describe("extractBackgroundVocals: reference stability", () => {
  it("returns every line by reference when no parentheses are present", () => {
    for (const mergeStandaloneLines of [true, false]) {
      const lines = [
        createLine({ id: "1", text: "First line" }),
        createLine({ id: "2", text: "Second line" }),
        createLine({ id: "3", text: "Third line" }),
      ];
      const result = extractBackgroundVocals(lines, { mergeStandaloneLines, preserveBrackets: false });
      expect(result).toHaveLength(lines.length);
      for (let i = 0; i < lines.length; i++) {
        expect(result[i]).toBe(lines[i]);
      }
    }
  });
});

// -- extractBackgroundVocals: existing backgroundText -------------------------

describe("extractBackgroundVocals: existing backgroundText", () => {
  it("appends a merged standalone bg text after the predecessor's existing bg text", () => {
    const lines = [
      createLine({ id: "1", text: "Real line", backgroundText: "ah" }),
      createLine({ id: "2", text: "(ooh)" }),
    ];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: false });
    expect(result).toHaveLength(1);
    expect(result[0].backgroundText).toBe("ah ooh");
  });
});

// -- extractBackgroundVocals: input not mutated -------------------------------

describe("extractBackgroundVocals: input not mutated", () => {
  it("does not mutate the input array or its line objects", () => {
    const lines = [
      createLine({ id: "1", text: "A (ooh) B", backgroundText: "ah" }),
      createLine({ id: "2", text: "(yeah)" }),
      createLine({ id: "3", text: "Plain" }),
    ];
    const originalLength = lines.length;
    extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: false });
    expect(lines).toHaveLength(originalLength);
    expect(lines[0].text).toBe("A (ooh) B");
    expect(lines[0].backgroundText).toBe("ah");
    expect(lines[1].text).toBe("(yeah)");
    expect(lines[2].text).toBe("Plain");
  });

  it("does not mutate a timed standalone line or its words array", () => {
    const standaloneWords = [
      { text: "(ooh ", begin: 5.0, end: 5.6 },
      { text: "yeah)", begin: 5.6, end: 6.2 },
    ];
    const lines = [
      createLine({ id: "1", text: "Real line" }),
      createLine({ id: "2", text: "(ooh yeah)", words: standaloneWords }),
    ];
    const standaloneWordsRef = lines[1].words;
    extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: false });
    expect(lines).toHaveLength(2);
    expect(lines[1].text).toBe("(ooh yeah)");
    expect(lines[1].words).toBe(standaloneWordsRef);
    expect(lines[1].words).toEqual([
      { text: "(ooh ", begin: 5.0, end: 5.6 },
      { text: "yeah)", begin: 5.6, end: 6.2 },
    ]);
    expect(lines[0].backgroundWords).toBeUndefined();
  });
});

// -- extractBackgroundVocals: idempotence -------------------------------------

describe("extractBackgroundVocals: idempotence", () => {
  it("yields no further changes when run on its own output", () => {
    const lines = [
      createLine({ id: "1", text: "A (ooh) B" }),
      createLine({ id: "2", text: "(yeah)" }),
      createLine({ id: "3", text: "Plain line" }),
      createLine({ id: "4", text: "C (ah) D" }),
    ];
    const first = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: false });
    const second = extractBackgroundVocals(first, { mergeStandaloneLines: true, preserveBrackets: false });
    expect(second).toHaveLength(first.length);
    for (let i = 0; i < first.length; i++) {
      expect(second[i]).toBe(first[i]);
      expect(second[i].text).toBe(first[i].text);
      expect(second[i].backgroundText).toBe(first[i].backgroundText);
    }
  });

  it("yields no further changes for a mix including timed standalone lines", () => {
    const lines = [
      createLine({
        id: "1",
        text: "Real line",
        words: [
          { text: "Real ", begin: 0, end: 1 },
          { text: "line", begin: 1, end: 2 },
        ],
      }),
      createLine({
        id: "2",
        text: "(ooh yeah)",
        words: [
          { text: "(ooh ", begin: 5.0, end: 5.6 },
          { text: "yeah)", begin: 5.6, end: 6.2 },
        ],
      }),
      createLine({ id: "3", text: "Plain line" }),
    ];
    const first = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: false });
    const second = extractBackgroundVocals(first, { mergeStandaloneLines: true, preserveBrackets: false });
    expect(second).toHaveLength(first.length);
    for (let i = 0; i < first.length; i++) {
      expect(second[i]).toBe(first[i]);
      expect(second[i].backgroundText).toBe(first[i].backgroundText);
      expect(second[i].backgroundWords).toEqual(first[i].backgroundWords);
    }
  });
});

// -- re-paste doubling --------------------------------------------------------

describe("re-paste doubling", () => {
  it("does not double background text when a standalone line is re-merged", () => {
    const first = extractBackgroundVocals(
      [
        { id: "a", text: "hello", agentId: "v1" },
        { id: "b", text: "(ooh)", agentId: "v1" },
      ],
      { mergeStandaloneLines: true, preserveBrackets: false },
    );
    expect(first).toHaveLength(1);
    expect(first[0].backgroundText).toBe("ooh");
    expect(first[0].backgroundTextSource).toBe("extraction");

    const second = extractBackgroundVocals([first[0], { id: "b", text: "(ooh)", agentId: "v1" }], {
      mergeStandaloneLines: true,
      preserveBrackets: false,
    });
    expect(second).toHaveLength(1);
    expect(second[0].backgroundText).toBe("ooh");
  });

  it("keeps manually entered background when a standalone line merges in", () => {
    const merged = extractBackgroundVocals(
      [
        { id: "a", text: "hello", agentId: "v1", backgroundText: "clap", backgroundTextSource: "manual" },
        { id: "b", text: "(ooh)", agentId: "v1" },
      ],
      { mergeStandaloneLines: true, preserveBrackets: false },
    );
    expect(merged[0].backgroundText).toBe("clap ooh");
    expect(merged[0].backgroundTextSource).toBe("manual");
  });
});

// -- provenance: inline extraction --------------------------------------------

describe("extractInlineFromLine: provenance", () => {
  it("stamps extraction source on a freshly extracted untimed line", () => {
    const line: LyricLine = { id: "1", text: "Hello (ooh) world", agentId: "v1" };
    const result = extractInlineFromLine(line, { mergeStandaloneLines: false, preserveBrackets: false });
    expect(result.backgroundText).toBe("ooh");
    expect(result.backgroundTextSource).toBe("extraction");
  });

  it("replaces extraction-sourced background instead of appending on re-paste", () => {
    const line: LyricLine = {
      id: "1",
      text: "Hello (ooh)",
      agentId: "v1",
      backgroundText: "ooh",
      backgroundTextSource: "extraction",
    };
    const result = extractInlineFromLine(line, { mergeStandaloneLines: false, preserveBrackets: false });
    expect(result.text).toBe("Hello");
    expect(result.backgroundText).toBe("ooh");
    expect(result.backgroundTextSource).toBe("extraction");
  });

  it("appends onto manual background and keeps the manual source", () => {
    const line: LyricLine = {
      id: "1",
      text: "Hello (ooh)",
      agentId: "v1",
      backgroundText: "clap",
      backgroundTextSource: "manual",
    };
    const result = extractInlineFromLine(line, { mergeStandaloneLines: false, preserveBrackets: false });
    expect(result.backgroundText).toBe("clap ooh");
    expect(result.backgroundTextSource).toBe("manual");
  });

  it("treats undefined provenance as manual and appends conservatively", () => {
    const line: LyricLine = {
      id: "1",
      text: "Hello (ooh)",
      agentId: "v1",
      backgroundText: "clap",
    };
    const result = extractInlineFromLine(line, { mergeStandaloneLines: false, preserveBrackets: false });
    expect(result.backgroundText).toBe("clap ooh");
    expect(result.backgroundTextSource).toBe("manual");
  });

  it("stamps extraction source on a freshly extracted word-synced line", () => {
    const line: LyricLine = {
      id: "1",
      text: "Hello (ooh) world",
      agentId: "v1",
      words: [
        { text: "Hello ", begin: 0, end: 1 },
        { text: "(ooh) ", begin: 1, end: 2 },
        { text: "world", begin: 2, end: 3 },
      ],
    };
    const result = extractInlineFromLine(line, { mergeStandaloneLines: false, preserveBrackets: false });
    expect(result.backgroundText).toBe("ooh");
    expect(result.backgroundTextSource).toBe("extraction");
  });

  it("replaces extraction-sourced background on a word-synced re-paste", () => {
    const line: LyricLine = {
      id: "1",
      text: "Hello (ooh) world",
      agentId: "v1",
      backgroundText: "ooh",
      backgroundTextSource: "extraction",
      words: [
        { text: "Hello ", begin: 0, end: 1 },
        { text: "(ooh) ", begin: 1, end: 2 },
        { text: "world", begin: 2, end: 3 },
      ],
    };
    const result = extractInlineFromLine(line, { mergeStandaloneLines: false, preserveBrackets: false });
    expect(result.backgroundText).toBe("ooh");
    expect(result.backgroundTextSource).toBe("extraction");
  });

  it("appends onto manual background on a word-synced line", () => {
    const line: LyricLine = {
      id: "1",
      text: "Hello (ooh) world",
      agentId: "v1",
      backgroundText: "clap",
      backgroundTextSource: "manual",
      words: [
        { text: "Hello ", begin: 0, end: 1 },
        { text: "(ooh) ", begin: 1, end: 2 },
        { text: "world", begin: 2, end: 3 },
      ],
    };
    const result = extractInlineFromLine(line, { mergeStandaloneLines: false, preserveBrackets: false });
    expect(result.backgroundText).toBe("clap ooh");
    expect(result.backgroundTextSource).toBe("manual");
  });
});

// -- provenance: standalone merge ---------------------------------------------

describe("extractBackgroundVocals: standalone merge provenance", () => {
  it("stamps extraction source when an untimed standalone merges into a clean predecessor", () => {
    const lines = [createLine({ id: "1", text: "Real line" }), createLine({ id: "2", text: "(ooh)" })];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: false });
    expect(result[0].backgroundText).toBe("ooh");
    expect(result[0].backgroundTextSource).toBe("extraction");
  });

  it("keeps manual source when a standalone merges into a manual-background predecessor", () => {
    const lines = [
      createLine({ id: "1", text: "Real line", backgroundText: "ah", backgroundTextSource: "manual" }),
      createLine({ id: "2", text: "(ooh)" }),
    ];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: false });
    expect(result[0].backgroundText).toBe("ah ooh");
    expect(result[0].backgroundTextSource).toBe("manual");
  });

  it("treats undefined-provenance background text as manual on standalone merge", () => {
    const lines = [
      createLine({ id: "1", text: "Real line", backgroundText: "ah" }),
      createLine({ id: "2", text: "(ooh)" }),
    ];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: false });
    expect(result[0].backgroundText).toBe("ah ooh");
    expect(result[0].backgroundTextSource).toBe("manual");
  });

  it("replaces extraction-sourced background text on standalone re-merge", () => {
    const lines = [
      createLine({ id: "1", text: "Real line", backgroundText: "ooh", backgroundTextSource: "extraction" }),
      createLine({ id: "2", text: "(ooh)" }),
    ];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: false });
    expect(result[0].backgroundText).toBe("ooh");
    expect(result[0].backgroundTextSource).toBe("extraction");
  });

  it("merges two standalone lines into a clean predecessor within one pass", () => {
    const lines = [
      createLine({ id: "1", text: "Real line" }),
      createLine({ id: "2", text: "(ooh)" }),
      createLine({ id: "3", text: "(ah)" }),
    ];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: false });
    expect(result).toHaveLength(1);
    expect(result[0].backgroundText).toBe("ooh ah");
    expect(result[0].backgroundTextSource).toBe("extraction");
  });

  it("carries timed standalone words and stamps extraction source on a clean predecessor", () => {
    const lines = [
      createLine({ id: "1", text: "Real line" }),
      createLine({
        id: "2",
        text: "(ooh yeah)",
        words: [
          { text: "(ooh ", begin: 5.0, end: 5.6 },
          { text: "yeah)", begin: 5.6, end: 6.2 },
        ],
      }),
    ];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: false });
    expect(result[0].backgroundWords).toEqual([
      { text: "ooh ", begin: 5.0, end: 5.6 },
      { text: "yeah", begin: 5.6, end: 6.2 },
    ]);
    expect(result[0].backgroundTextSource).toBe("extraction");
  });

  it("combines timed standalone words onto manual background words and keeps manual source", () => {
    const lines = [
      createLine({
        id: "1",
        text: "Real line",
        backgroundText: "ah ",
        backgroundTextSource: "manual",
        backgroundWords: [{ text: "ah ", begin: 1.0, end: 1.5 }],
      }),
      createLine({
        id: "2",
        text: "(ooh yeah)",
        words: [
          { text: "(ooh ", begin: 5.0, end: 5.6 },
          { text: "yeah)", begin: 5.6, end: 6.2 },
        ],
      }),
    ];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: false });
    expect(result[0].backgroundWords).toEqual([
      { text: "ah ", begin: 1.0, end: 1.5 },
      { text: "ooh ", begin: 5.0, end: 5.6 },
      { text: "yeah", begin: 5.6, end: 6.2 },
    ]);
    expect(result[0].backgroundTextSource).toBe("manual");
  });

  it("replaces extraction-sourced background words when a timed standalone re-merges", () => {
    const lines = [
      createLine({
        id: "1",
        text: "Real line",
        backgroundText: "ooh yeah",
        backgroundTextSource: "extraction",
        backgroundWords: [
          { text: "ooh ", begin: 5.0, end: 5.6 },
          { text: "yeah", begin: 5.6, end: 6.2 },
        ],
      }),
      createLine({
        id: "2",
        text: "(ooh yeah)",
        words: [
          { text: "(ooh ", begin: 5.0, end: 5.6 },
          { text: "yeah)", begin: 5.6, end: 6.2 },
        ],
      }),
    ];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: false });
    expect(result).toHaveLength(1);
    expect(result[0].backgroundWords).toEqual([
      { text: "ooh ", begin: 5.0, end: 5.6 },
      { text: "yeah", begin: 5.6, end: 6.2 },
    ]);
    expect(result[0].backgroundTextSource).toBe("extraction");
  });

  it("merges a timed standalone into an untimed extraction-sourced predecessor by replacement", () => {
    const lines = [
      createLine({ id: "1", text: "Real line", backgroundText: "ooh", backgroundTextSource: "extraction" }),
      createLine({
        id: "2",
        text: "(ooh yeah)",
        words: [
          { text: "(ooh ", begin: 5.0, end: 5.6 },
          { text: "yeah)", begin: 5.6, end: 6.2 },
        ],
      }),
    ];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: false });
    expect(result[0].backgroundText).toBe("ooh yeah");
    expect(result[0].backgroundWords).toEqual([
      { text: "ooh ", begin: 5.0, end: 5.6 },
      { text: "yeah", begin: 5.6, end: 6.2 },
    ]);
    expect(result[0].backgroundTextSource).toBe("extraction");
  });

  it("merges an untimed standalone into a predecessor with extraction-sourced background words", () => {
    const lines = [
      createLine({
        id: "1",
        text: "Real line",
        backgroundText: "ah",
        backgroundTextSource: "extraction",
        backgroundWords: [{ text: "ah", begin: 1.0, end: 1.5 }],
      }),
      createLine({ id: "2", text: "(ooh)" }),
    ];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: false });
    expect(result).toHaveLength(1);
    expect(result[0].backgroundText).toBe("ooh");
    expect(result[0].backgroundWords).toBeUndefined();
    expect(result[0].backgroundTextSource).toBe("extraction");
  });
});

// -- mergeStandaloneLines disabled --------------------------------------------

describe("extractBackgroundVocals: standalone merge disabled", () => {
  it("leaves standalone all-parens lines untouched but still extracts inline lines", () => {
    const lines = [createLine({ id: "1", text: "A (ooh) B" }), createLine({ id: "2", text: "(yeah)" })];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: false, preserveBrackets: false });
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe("A B");
    expect(result[0].backgroundText).toBe("ooh");
    expect(result[0].backgroundTextSource).toBe("extraction");
    expect(result[1]).toBe(lines[1]);
  });
});

// -- re-paste idempotence -----------------------------------------------------

describe("extractBackgroundVocals: re-paste idempotence with provenance", () => {
  it("is a no-op on its own already-extracted standalone-merge output", () => {
    const lines = [createLine({ id: "1", text: "Real line" }), createLine({ id: "2", text: "(ooh)" })];
    const first = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: false });
    const second = extractBackgroundVocals(first, { mergeStandaloneLines: true, preserveBrackets: false });
    expect(second).toHaveLength(first.length);
    for (let i = 0; i < first.length; i++) {
      expect(second[i]).toBe(first[i]);
    }
  });

  it("is a no-op on its own already-extracted inline output", () => {
    const lines = [createLine({ id: "1", text: "Hello (ooh) world" })];
    const first = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: false });
    const second = extractBackgroundVocals(first, { mergeStandaloneLines: true, preserveBrackets: false });
    expect(second[0]).toBe(first[0]);
    expect(second[0].backgroundText).toBe(first[0].backgroundText);
    expect(second[0].backgroundTextSource).toBe("extraction");
  });
});

// -- linked lines -------------------------------------------------------------
//
// Inline extraction is an in-place content edit, so it is intentionally applied
// to linked lines (lines belonging to a timeline group/instance). These tests
// pin that an inline-extracted linked line keeps its link metadata intact and
// that linked siblings carrying identical text extract identically, so the
// whole-list transform never desyncs an instance set.

describe("extractInlineFromLine: linked lines", () => {
  it("extracts an untimed inline group and keeps link metadata intact", () => {
    const line: LyricLine = {
      id: "l1",
      text: "Hello (ooh)",
      agentId: "v1",
      groupId: "g1",
      instanceIdx: 0,
      templateLineIdx: 0,
    };
    const result = extractInlineFromLine(line, { mergeStandaloneLines: false, preserveBrackets: false });
    expect(result.text).toBe("Hello");
    expect(result.backgroundText).toBe("ooh");
    expect(result.groupId).toBe("g1");
    expect(result.instanceIdx).toBe(0);
    expect(result.templateLineIdx).toBe(0);
  });

  it("extracts a word-synced inline group and keeps link metadata intact", () => {
    const line: LyricLine = {
      id: "l1",
      text: "Hello (ooh)",
      agentId: "v1",
      groupId: "g1",
      instanceIdx: 1,
      templateLineIdx: 2,
      words: [
        { text: "Hello ", begin: 30, end: 31 },
        { text: "(ooh)", begin: 31, end: 32 },
      ],
    };
    const result = extractInlineFromLine(line, { mergeStandaloneLines: false, preserveBrackets: false });
    expect(result.text).toBe("Hello");
    expect(result.backgroundText).toBe("ooh");
    expect(result.words).toEqual([{ text: "Hello", begin: 30, end: 31 }]);
    expect(result.groupId).toBe("g1");
    expect(result.instanceIdx).toBe(1);
    expect(result.templateLineIdx).toBe(2);
  });
});

describe("extractBackgroundVocals: linked sibling lines", () => {
  it("extracts both untimed linked siblings identically", () => {
    const lines = [
      createLine({ id: "s0", text: "Hello (ooh)", groupId: "g1", instanceIdx: 0 }),
      createLine({ id: "s1", text: "Hello (ooh)", groupId: "g1", instanceIdx: 1 }),
    ].map((line, idx) => ({ ...line, templateLineIdx: 0, instanceIdx: idx }));

    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: false });

    expect(result).toHaveLength(2);
    for (const line of result) {
      expect(line.text).toBe("Hello");
      expect(line.backgroundText).toBe("ooh");
      expect(line.groupId).toBe("g1");
      expect(line.templateLineIdx).toBe(0);
    }
    expect(result[0].instanceIdx).toBe(0);
    expect(result[1].instanceIdx).toBe(1);
  });

  it("extracts both word-synced linked siblings identically while keeping instance timing", () => {
    const s0: LyricLine = {
      id: "s0",
      text: "Hello (ooh)",
      agentId: "v1",
      groupId: "g1",
      instanceIdx: 0,
      templateLineIdx: 0,
      words: [
        { text: "Hello ", begin: 0, end: 1 },
        { text: "(ooh)", begin: 1, end: 2 },
      ],
    };
    const s1: LyricLine = {
      id: "s1",
      text: "Hello (ooh)",
      agentId: "v1",
      groupId: "g1",
      instanceIdx: 1,
      templateLineIdx: 0,
      words: [
        { text: "Hello ", begin: 30, end: 31.5 },
        { text: "(ooh)", begin: 31.5, end: 33 },
      ],
    };

    const result = extractBackgroundVocals([s0, s1], { mergeStandaloneLines: true, preserveBrackets: false });

    expect(result).toHaveLength(2);
    expect(result[0].text).toBe("Hello");
    expect(result[1].text).toBe("Hello");
    expect(result[0].backgroundText).toBe("ooh");
    expect(result[1].backgroundText).toBe("ooh");
    expect(result[0].words).toEqual([{ text: "Hello", begin: 0, end: 1 }]);
    expect(result[1].words).toEqual([{ text: "Hello", begin: 30, end: 31.5 }]);
    expect(result[0].groupId).toBe("g1");
    expect(result[1].groupId).toBe("g1");
    expect(result[0].templateLineIdx).toBe(0);
    expect(result[1].templateLineIdx).toBe(0);
  });
});

// -- lineHasInlineParens ------------------------------------------------------

describe("lineHasInlineParens", () => {
  it("returns true for an inline line", () => {
    expect(lineHasInlineParens(createLine({ id: "1", text: "A (ooh) B" }))).toBe(true);
  });

  it("returns false for a plain line", () => {
    expect(lineHasInlineParens(createLine({ id: "1", text: "Plain line" }))).toBe(false);
  });

  it("returns false for a standalone line", () => {
    expect(lineHasInlineParens(createLine({ id: "1", text: "(ooh yeah)" }))).toBe(false);
  });

  it("returns false for a skip line", () => {
    expect(lineHasInlineParens(createLine({ id: "1", text: "Hello (ooh" }))).toBe(false);
  });
});

// -- preserveBrackets: text-only bg -------------------------------------------

describe("preserveBrackets: text-only bg", () => {
  it("wraps a single inline group in one outer pair", () => {
    const lines = [createLine({ id: "1", text: "A (ooh) B" })];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: true });
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("A B");
    expect(result[0].backgroundText).toBe("(ooh)");
  });

  it("wraps multiple inline groups on the same line in one outer pair", () => {
    const lines = [createLine({ id: "1", text: "A (ooh) (yeah) B" })];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: true });
    expect(result[0].text).toBe("A B");
    expect(result[0].backgroundText).toBe("(ooh yeah)");
  });

  it("merges a standalone into prev with one outer pair", () => {
    const lines = [createLine({ id: "1", text: "Real line" }), createLine({ id: "2", text: "(ooh yeah)" })];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: true });
    expect(result).toHaveLength(1);
    expect(result[0].backgroundText).toBe("(ooh yeah)");
  });

  it("merges multiple consecutive standalones into one outer pair", () => {
    const lines = [
      createLine({ id: "1", text: "Real line" }),
      createLine({ id: "2", text: "(ooh)" }),
      createLine({ id: "3", text: "(yeah)" }),
    ];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: true });
    expect(result).toHaveLength(1);
    expect(result[0].backgroundText).toBe("(ooh yeah)");
  });

  it("merges inline-then-standalone same-pass into one outer pair", () => {
    const lines = [createLine({ id: "1", text: "A (ooh) B" }), createLine({ id: "2", text: "(yeah)" })];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: true });
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("A B");
    expect(result[0].backgroundText).toBe("(ooh yeah)");
  });

  it("appends a bracketed addition next to existing manual bg text", () => {
    const lines = [
      createLine({
        id: "1",
        text: "Real line",
        backgroundText: "ah",
        backgroundTextSource: "manual",
      }),
      createLine({ id: "2", text: "(ooh)" }),
    ];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: true });
    expect(result).toHaveLength(1);
    expect(result[0].backgroundText).toBe("ah (ooh)");
  });

  it("groups multiple bracketed additions inside one pair after manual bg", () => {
    const lines = [
      createLine({
        id: "1",
        text: "Real line",
        backgroundText: "ah",
        backgroundTextSource: "manual",
      }),
      createLine({ id: "2", text: "(ooh)" }),
      createLine({ id: "3", text: "(yeah)" }),
    ];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: true });
    expect(result).toHaveLength(1);
    expect(result[0].backgroundText).toBe("ah (ooh yeah)");
  });

  it("preserves backgroundTextSource as extraction for fresh additions", () => {
    const lines = [createLine({ id: "1", text: "A (ooh) B" })];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: true });
    expect(result[0].backgroundTextSource).toBe("extraction");
  });

  it("is idempotent on already-bracketed extracted bg (no double wrap)", () => {
    const lines = [createLine({ id: "1", text: "A (ooh) B" })];
    const once = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: true });
    const twice = extractBackgroundVocals(once, { mergeStandaloneLines: true, preserveBrackets: true });
    expect(twice[0].backgroundText).toBe("(ooh)");
    expect(twice[0].text).toBe("A B");
  });

  it("does not change main text under preserveBrackets", () => {
    const lines = [createLine({ id: "1", text: "A (ooh) (yeah) B" })];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: true });
    expect(result[0].text).toBe("A B");
  });

  it("does not peel a trailing ')' from manual bg text", () => {
    const lines = [
      createLine({
        id: "1",
        text: "Real line",
        backgroundText: "my note)",
        backgroundTextSource: "manual",
      }),
      createLine({ id: "2", text: "(ooh)" }),
    ];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: true });
    expect(result).toHaveLength(1);
    expect(result[0].backgroundText).toBe("my note) (ooh)");
  });
});

// -- preserveBrackets: invariants ---------------------------------------------

describe("preserveBrackets: invariants", () => {
  it("regression: off-state inline single group matches pre-task output", () => {
    const lines = [createLine({ id: "1", text: "A (ooh) B" })];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: false });
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("A B");
    expect(result[0].backgroundText).toBe("ooh");
  });

  it("regression: off-state standalone merge matches pre-task output", () => {
    const lines = [createLine({ id: "1", text: "Real line" }), createLine({ id: "2", text: "(ooh yeah)" })];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: false });
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Real line");
    expect(result[0].backgroundText).toBe("ooh yeah");
  });

  it("off-state and on-state produce different bg text for inline parens", () => {
    const lines = [createLine({ id: "1", text: "A (ooh) B" })];
    const off = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: false });
    const on = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: true });
    expect(off[0].backgroundText).toBe("ooh");
    expect(on[0].backgroundText).toBe("(ooh)");
    expect(off[0].backgroundText).not.toBe(on[0].backgroundText);
  });

  it("paren-free line is reference-equality pass-through regardless of flag", () => {
    const lines = [createLine({ id: "1", text: "Plain line" })];
    const off = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: false });
    const on = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: true });
    expect(off[0]).toBe(lines[0]);
    expect(on[0]).toBe(lines[0]);
  });

  it("inline groups plus same-pass standalone merge yield exactly one outer pair", () => {
    const lines = [createLine({ id: "1", text: "A (ooh) (yeah) B" }), createLine({ id: "2", text: "(la)" })];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: true });
    expect(result).toHaveLength(1);
    const bg = result[0].backgroundText ?? "";
    expect((bg.match(/\(/g) ?? []).length).toBe(1);
    expect((bg.match(/\)/g) ?? []).length).toBe(1);
    expect(bg).toBe("(ooh yeah la)");
  });
});

describe("preserveBrackets: word-synced bg", () => {
  it("brackets a multi-word standalone carried into prev with no existing bg", () => {
    const lines = [
      createLine({ id: "1", text: "Real line" }),
      createLine({
        id: "2",
        text: "(ooh yeah)",
        words: [
          { text: "(ooh ", begin: 5.0, end: 5.6 },
          { text: "yeah)", begin: 5.6, end: 6.2 },
        ],
      }),
    ];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: true });
    expect(result).toHaveLength(1);
    expect(result[0].backgroundWords).toEqual([
      { text: "(ooh ", begin: 5.0, end: 5.6 },
      { text: "yeah)", begin: 5.6, end: 6.2 },
    ]);
    expect(result[0].backgroundText).toBe("(ooh yeah)");
  });

  it("brackets a single-word standalone", () => {
    const lines = [
      createLine({ id: "1", text: "Real line" }),
      createLine({
        id: "2",
        text: "(ooh)",
        words: [{ text: "(ooh)", begin: 5.0, end: 5.6 }],
      }),
    ];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: true });
    expect(result[0].backgroundWords).toEqual([{ text: "(ooh)", begin: 5.0, end: 5.6 }]);
    expect(result[0].backgroundText).toBe("(ooh)");
  });

  it("merges a second standalone into the same outer pair, stripping seam brackets", () => {
    const lines = [
      createLine({ id: "1", text: "Real line" }),
      createLine({
        id: "2",
        text: "(ooh)",
        words: [{ text: "(ooh)", begin: 5.0, end: 5.5 }],
      }),
      createLine({
        id: "3",
        text: "(yeah)",
        words: [{ text: "(yeah)", begin: 5.6, end: 6.1 }],
      }),
    ];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: true });
    expect(result).toHaveLength(1);
    expect(result[0].backgroundWords).toEqual([
      { text: "(ooh ", begin: 5.0, end: 5.5 },
      { text: "yeah)", begin: 5.6, end: 6.1 },
    ]);
    expect(result[0].backgroundText).toBe("(ooh yeah)");
  });

  it("appends bracketed carry next to existing manual bg words without merging into manual pair", () => {
    const lines = [
      createLine({
        id: "1",
        text: "Real line",
        backgroundText: "ah ",
        backgroundWords: [{ text: "ah ", begin: 1.0, end: 1.5 }],
        backgroundTextSource: "manual",
      }),
      createLine({
        id: "2",
        text: "(ooh)",
        words: [{ text: "(ooh)", begin: 5.0, end: 5.5 }],
      }),
    ];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: true });
    expect(result).toHaveLength(1);
    expect(result[0].backgroundWords).toEqual([
      { text: "ah ", begin: 1.0, end: 1.5 },
      { text: "(ooh)", begin: 5.0, end: 5.5 },
    ]);
  });

  it("falls back to text-only addition when standalone has no words", () => {
    const lines = [createLine({ id: "1", text: "Real line" }), createLine({ id: "2", text: "(ooh)" })];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: true });
    expect(result[0].backgroundWords).toBeUndefined();
    expect(result[0].backgroundText).toBe("(ooh)");
  });

  it("off-state: word carry is unchanged (regression guard)", () => {
    const lines = [
      createLine({ id: "1", text: "Real line" }),
      createLine({
        id: "2",
        text: "(ooh yeah)",
        words: [
          { text: "(ooh ", begin: 5.0, end: 5.6 },
          { text: "yeah)", begin: 5.6, end: 6.2 },
        ],
      }),
    ];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: false });
    expect(result[0].backgroundWords).toEqual([
      { text: "ooh ", begin: 5.0, end: 5.6 },
      { text: "yeah", begin: 5.6, end: 6.2 },
    ]);
    expect(result[0].backgroundText).toBe("ooh yeah");
  });

  it("does not fuse a manually-bracketed bg with a fresh bracketed carry", () => {
    const lines = [
      createLine({
        id: "1",
        text: "Real line",
        backgroundText: "(clap)",
        backgroundWords: [{ text: "(clap)", begin: 1.0, end: 1.5 }],
        backgroundTextSource: "manual",
      }),
      createLine({
        id: "2",
        text: "(ooh)",
        words: [{ text: "(ooh)", begin: 5.0, end: 5.5 }],
      }),
    ];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: true });
    expect(result).toHaveLength(1);
    expect(result[0].backgroundWords).toEqual([
      { text: "(clap)", begin: 1.0, end: 1.5 },
      { text: "(ooh)", begin: 5.0, end: 5.5 },
    ]);
  });
});

describe("preserveBrackets: word-synced invariants", () => {
  it("preserves timing values exactly across bracket wrapping", () => {
    const lines = [
      createLine({ id: "1", text: "Real line" }),
      createLine({
        id: "2",
        text: "(ooh yeah)",
        words: [
          { text: "(ooh ", begin: 5.123, end: 5.617 },
          { text: "yeah)", begin: 5.617, end: 6.234 },
        ],
      }),
    ];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: true });
    const w = result[0].backgroundWords ?? [];
    expect(w[0].begin).toBe(5.123);
    expect(w[0].end).toBe(5.617);
    expect(w[1].begin).toBe(5.617);
    expect(w[1].end).toBe(6.234);
  });

  it("reconstructed backgroundText stays consistent with bracketed words", () => {
    const lines = [
      createLine({ id: "1", text: "Real line" }),
      createLine({
        id: "2",
        text: "(ooh)",
        words: [{ text: "(ooh)", begin: 5.0, end: 5.5 }],
      }),
      createLine({
        id: "3",
        text: "(yeah)",
        words: [{ text: "(yeah)", begin: 5.6, end: 6.1 }],
      }),
    ];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: true });
    expect(result[0].backgroundText).toBe("(ooh yeah)");
  });

  it("does not introduce parens in the main line text", () => {
    const lines = [
      createLine({ id: "1", text: "Real line" }),
      createLine({
        id: "2",
        text: "(ooh)",
        words: [{ text: "(ooh)", begin: 5.0, end: 5.5 }],
      }),
    ];
    const result = extractBackgroundVocals(lines, { mergeStandaloneLines: true, preserveBrackets: true });
    expect(result[0].text).toBe("Real line");
  });
});
