import { nanoid } from "nanoid";
import { describe, expect, it } from "vitest";
import { createLine } from "@/test/factories";
import { findIdenticalWords } from "@/utils/identical-word-matcher";

describe("findIdenticalWords", () => {
  it("returns exact-text matches across lines, main track", () => {
    const lines = [
      createLine({ id: "l1", words: [{ text: "running", begin: 0, end: 1 }] }),
      createLine({ id: "l2", words: [{ text: "running", begin: 2, end: 3 }] }),
      createLine({ id: "l3", words: [{ text: "walking", begin: 4, end: 5 }] }),
    ];
    const matches = findIdenticalWords(
      lines,
      { lineId: "l1", wordIndex: 0, type: "word" },
      { caseInsensitive: false, excludeSource: true, splitPoints: [3] },
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].lineId).toBe("l2");
  });

  it("case-sensitive default skips capitalization variants", () => {
    const lines = [
      createLine({ id: "l1", words: [{ text: "running", begin: 0, end: 1 }] }),
      createLine({ id: "l2", words: [{ text: "Running", begin: 2, end: 3 }] }),
    ];
    expect(
      findIdenticalWords(
        lines,
        { lineId: "l1", wordIndex: 0, type: "word" },
        { caseInsensitive: false, excludeSource: true, splitPoints: [3] },
      ),
    ).toHaveLength(0);
  });

  it("case-insensitive matches across capitalization variants", () => {
    const lines = [
      createLine({ id: "l1", words: [{ text: "running", begin: 0, end: 1 }] }),
      createLine({ id: "l2", words: [{ text: "Running", begin: 2, end: 3 }] }),
      createLine({ id: "l3", words: [{ text: "RUNNING", begin: 4, end: 5 }] }),
    ];
    expect(
      findIdenticalWords(
        lines,
        { lineId: "l1", wordIndex: 0, type: "word" },
        { caseInsensitive: true, excludeSource: true, splitPoints: [3] },
      ),
    ).toHaveLength(2);
  });

  it("skips words with an existing syllableGroupId", () => {
    const lines = [
      createLine({ id: "l1", words: [{ text: "running", begin: 0, end: 1 }] }),
      createLine({
        id: "l2",
        words: [{ text: "running", begin: 2, end: 3, syllableGroupId: nanoid(8) }],
      }),
    ];
    expect(
      findIdenticalWords(
        lines,
        { lineId: "l1", wordIndex: 0, type: "word" },
        { caseInsensitive: false, excludeSource: true, splitPoints: [3] },
      ),
    ).toHaveLength(0);
  });

  it("includes background words in the match set", () => {
    const lines = [
      createLine({
        id: "l1",
        words: [{ text: "yeah", begin: 0, end: 1 }],
        backgroundWords: [{ text: "yeah", begin: 0.5, end: 1.5 }],
      }),
    ];
    const matches = findIdenticalWords(
      lines,
      { lineId: "l1", wordIndex: 0, type: "word" },
      { caseInsensitive: false, excludeSource: true, splitPoints: [2] },
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].type).toBe("bg");
  });

  it("excludes source itself when excludeSource is true", () => {
    const lines = [createLine({ id: "l1", words: [{ text: "running", begin: 0, end: 1 }] })];
    expect(
      findIdenticalWords(
        lines,
        { lineId: "l1", wordIndex: 0, type: "word" },
        { caseInsensitive: false, excludeSource: true, splitPoints: [3] },
      ),
    ).toHaveLength(0);
  });

  it("excludes targets shorter than max(splitPoints) + 1", () => {
    const lines = [
      createLine({ id: "l1", words: [{ text: "running", begin: 0, end: 1 }] }),
      createLine({ id: "l2", words: [{ text: "run", begin: 2, end: 3 }] }),
    ];
    expect(
      findIdenticalWords(
        lines,
        { lineId: "l1", wordIndex: 0, type: "word" },
        { caseInsensitive: false, excludeSource: true, splitPoints: [5] },
      ),
    ).toHaveLength(0);
  });

  it("returns results ordered by lineIndex, then main before bg, then wordIndex", () => {
    const lines = [
      createLine({
        id: "l1",
        words: [
          { text: "go", begin: 0, end: 1 },
          { text: "go", begin: 1, end: 2 },
        ],
        backgroundWords: [{ text: "go", begin: 0.5, end: 1.5 }],
      }),
      createLine({ id: "l2", words: [{ text: "go", begin: 2, end: 3 }] }),
    ];
    const matches = findIdenticalWords(
      lines,
      { lineId: "l1", wordIndex: 0, type: "word" },
      { caseInsensitive: false, excludeSource: true, splitPoints: [1] },
    );
    expect(matches.map((m) => `${m.lineId}:${m.type}:${m.wordIndex}`)).toEqual(["l1:word:1", "l1:bg:0", "l2:word:0"]);
  });
});
