// -- Types --------------------------------------------------------------------

type SyncType = "syllable" | "word" | "line" | "unsynced";

// -- Constants ----------------------------------------------------------------

const LRC_LINE_TIMESTAMP_REGEX = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/;
const LRC_INLINE_WORD_TAG_REGEX = /<(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?>/;

// -- LRC ----------------------------------------------------------------------

function detectLrcSyncType(content: string): SyncType {
  if (!content || !content.trim()) return "unsynced";

  const rawLines = content.split(/\r?\n/);
  let sawLineTimestamp = false;

  for (const rawLine of rawLines) {
    const line = rawLine.trim();
    if (!line) continue;

    if (LRC_INLINE_WORD_TAG_REGEX.test(line) && LRC_LINE_TIMESTAMP_REGEX.test(line)) {
      return "word";
    }

    if (!sawLineTimestamp && LRC_LINE_TIMESTAMP_REGEX.test(line) && !isMetadataLine(line)) {
      sawLineTimestamp = true;
    }
  }

  return sawLineTimestamp ? "line" : "unsynced";
}

function isMetadataLine(line: string): boolean {
  return /^\[[a-z]+:[^\]]+\]$/i.test(line);
}

// -- TTML ---------------------------------------------------------------------

function detectTtmlSyncType(xml: string): SyncType {
  if (!xml || !xml.trim()) return "unsynced";

  const fromDom = detectTtmlSyncTypeViaDom(xml);
  if (fromDom !== null) return fromDom;

  return detectTtmlSyncTypeViaRegex(xml);
}

function detectTtmlSyncTypeViaDom(xml: string): SyncType | null {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, "text/xml");
    if (doc.querySelector("parsererror")) return null;

    const paragraphs = doc.getElementsByTagName("p");
    if (paragraphs.length === 0) return null;

    let sawLineLevel = false;
    for (const p of paragraphs) {
      const nestedSpans = p.getElementsByTagName("span");
      for (const span of nestedSpans) {
        if (span.getAttribute("begin")) return "syllable";
      }
      if (p.getAttribute("begin")) sawLineLevel = true;
    }

    return sawLineLevel ? "line" : "unsynced";
  } catch (error) {
    console.warn("[Composer] detectTtmlSyncType DOMParser failed", error);
    return null;
  }
}

function detectTtmlSyncTypeViaRegex(xml: string): SyncType {
  if (/<span\b[^>]*\bbegin\s*=/.test(xml)) return "syllable";
  if (/<p\b[^>]*\bbegin\s*=/.test(xml)) return "line";
  return "unsynced";
}

// -- Exports ------------------------------------------------------------------

export { detectLrcSyncType, detectTtmlSyncType };
export type { SyncType };
