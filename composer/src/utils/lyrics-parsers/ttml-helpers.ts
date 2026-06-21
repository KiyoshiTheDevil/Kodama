import type { WordTiming } from "@/domain/word/timing";

// -- Constants ----------------------------------------------------------------

const ELEMENT_PREFIX_REGEX = /<\/?([A-Za-z][\w.-]*):/g;
const ATTRIBUTE_PREFIX_REGEX = /\s([A-Za-z][\w.-]*):[\w.-]+\s*=/g;
const DECLARED_PREFIX_REGEX = /xmlns:([A-Za-z][\w.-]*)\s*=/g;
const ROOT_TT_TAG_REGEX = /<tt\b[^>]*>/;

// -- Helpers ------------------------------------------------------------------

function declareMissingNamespaces(content: string): string {
  const rootMatch = content.match(ROOT_TT_TAG_REGEX);
  if (!rootMatch) return content;

  const rootTag = rootMatch[0];
  const declared = new Set<string>(["xml", "xmlns"]);
  for (const match of rootTag.matchAll(DECLARED_PREFIX_REGEX)) {
    declared.add(match[1]);
  }

  const used = new Set<string>();
  for (const match of content.matchAll(ELEMENT_PREFIX_REGEX)) {
    used.add(match[1]);
  }
  for (const match of content.matchAll(ATTRIBUTE_PREFIX_REGEX)) {
    used.add(match[1]);
  }

  const missing: string[] = [];
  for (const prefix of used) {
    if (!declared.has(prefix)) missing.push(prefix);
  }
  if (missing.length === 0) return content;

  const additions = missing.map((prefix) => ` xmlns:${prefix}="urn:composer:unbound:${prefix}"`).join("");
  const patchedRootTag = rootTag.replace(/>$/, `${additions}>`);
  return content.replace(rootTag, patchedRootTag);
}

function parseTtmlTimestamp(timestamp: string): number {
  // Format: HH:MM:SS.mmm or MM:SS.mmm or SS.mmm
  if (!timestamp) return 0;

  const parts = timestamp.split(":");
  if (parts.length === 3) {
    // HH:MM:SS.mmm
    const hours = Number.parseInt(parts[0], 10);
    const minutes = Number.parseInt(parts[1], 10);
    const [secs, ms] = parts[2].split(".");
    const seconds = Number.parseInt(secs, 10);
    const millis = ms ? Number.parseInt(ms.padEnd(3, "0"), 10) : 0;
    return hours * 3600 + minutes * 60 + seconds + millis / 1000;
  }
  if (parts.length === 2) {
    // MM:SS.mmm
    const minutes = Number.parseInt(parts[0], 10);
    const [secs, ms] = parts[1].split(".");
    const seconds = Number.parseInt(secs, 10);
    const millis = ms ? Number.parseInt(ms.padEnd(3, "0"), 10) : 0;
    return minutes * 60 + seconds + millis / 1000;
  }
  // SS.mmm
  const [secs, ms] = timestamp.split(".");
  const seconds = Number.parseInt(secs, 10);
  const millis = ms ? Number.parseInt(ms.padEnd(3, "0"), 10) : 0;
  return seconds + millis / 1000;
}

function readExplicitFlag(el: Element): boolean {
  for (const attr of el.attributes) {
    const local = (attr.localName ?? attr.name).toLowerCase();
    if (local === "explicit" || local === "obscene") {
      const raw = (attr.value ?? "").trim().toLowerCase();
      if (raw === "" || raw === "true" || raw === "1" || raw === "yes") return true;
      return false;
    }
  }
  return false;
}

function extractTimedWords(parent: Element, excludeContainer?: Element | null): WordTiming[] {
  const words: WordTiming[] = [];

  for (const node of parent.childNodes) {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element;
      const role = el.getAttribute("ttm:role") || el.getAttributeNS("http://www.w3.org/ns/ttml#metadata", "role");

      // Skip x-bg containers (handled separately)
      if (role === "x-bg" || excludeContainer?.contains(el)) continue;

      // Handle span with timing
      if (el.tagName.toLowerCase() === "span" && el.hasAttribute("begin")) {
        const begin = parseTtmlTimestamp(el.getAttribute("begin") ?? "");
        const end = parseTtmlTimestamp(el.getAttribute("end") ?? "");
        const text = el.textContent ?? "";
        if (text.trim()) {
          const word: WordTiming = { text, begin, end };
          if (readExplicitFlag(el)) word.explicit = true;
          words.push(word);
        }
      }
    } else if (node.nodeType === Node.TEXT_NODE) {
      // Whitespace between spans - append to preceding word
      const content = node.textContent ?? "";
      if (/\s/.test(content) && words.length > 0) {
        const lastWord = words[words.length - 1];
        if (!lastWord.text.endsWith(" ")) {
          lastWord.text += " ";
        }
      }
    }
  }

  return words;
}

// -- Exports ------------------------------------------------------------------

export { declareMissingNamespaces, parseTtmlTimestamp, extractTimedWords };
