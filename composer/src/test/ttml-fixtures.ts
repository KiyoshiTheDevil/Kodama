import { useProjectStore } from "@/stores/project";
import { createLine } from "@/test/factories";
import { generateTTML } from "@/utils/ttml";

// -- Fixtures -----------------------------------------------------------------

/**
 * Three word-synced lyric lines with wide, non-overlapping time windows,
 * rendered to a real TTML string via the production generator. Used by the
 * preview renderer tests to drive highlight and line-click behaviour.
 *
 * Windows: "first line here" 2-6s, "second line now" 12-18s, "third line ends"
 * 24-30s.
 */
function buildSyncedTtml(): string {
  const lines = [
    createLine({
      id: "line-a",
      text: "first line here",
      words: [
        { text: "first ", begin: 2, end: 3 },
        { text: "line ", begin: 3, end: 4 },
        { text: "here", begin: 4, end: 6 },
      ],
    }),
    createLine({
      id: "line-b",
      text: "second line now",
      words: [
        { text: "second ", begin: 12, end: 14 },
        { text: "line ", begin: 14, end: 16 },
        { text: "now", begin: 16, end: 18 },
      ],
    }),
    createLine({
      id: "line-c",
      text: "third line ends",
      words: [
        { text: "third ", begin: 24, end: 26 },
        { text: "line ", begin: 26, end: 28 },
        { text: "ends", begin: 28, end: 30 },
      ],
    }),
  ];
  const { metadata, agents } = useProjectStore.getState();
  return generateTTML({ metadata, agents, lines, groups: [], granularity: "word" });
}

// -- Exports ------------------------------------------------------------------

export { buildSyncedTtml };
