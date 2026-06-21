import type { Agent, AgentType } from "@/domain/agent/model";
import type { LinkGroup } from "@/domain/group/template";
import { reconcileLine, type LyricLine } from "@/domain/line/model";
import { reconstructLineText } from "@/domain/line/reconstruct-text";
import type { ProjectMetadata } from "@/domain/project/metadata";
import { inferSyllableGroupIds } from "@/domain/word/syllable-groups";
import type { WordTiming } from "@/domain/word/timing";
import { getSplitCharacter } from "@/utils/split-character";
import { declareMissingNamespaces, extractTimedWords, parseTtmlTimestamp } from "@/utils/lyrics-parsers/ttml-helpers";
import { generateLineId, type ParseResult } from "@/utils/lyrics-parsers/shared";

// -- Constants ----------------------------------------------------------------

const COMPOSER_NS = "https://composer.boidu.dev/ttml";

// -- TTML Parser --------------------------------------------------------------

function parseTtml(content: string, _fallbackDuration?: number): ParseResult {
  const metadata: Partial<ProjectMetadata> = {};
  const lines: LyricLine[] = [];

  const parser = new DOMParser();
  const unescapedContent = content.replace(/\\"/g, '"').replace(/\\n/g, "\n");
  const cleanedContent = declareMissingNamespaces(unescapedContent);
  const doc = parser.parseFromString(cleanedContent, "text/xml");

  // Check for parse errors
  const parseError = doc.querySelector("parsererror");
  if (parseError) {
    return { lines: [], metadata: {}, hasTimingData: false };
  }

  // Extract metadata (use getElementsByTagName for namespace compatibility)
  const titleEl = doc.getElementsByTagName("title")[0];
  if (titleEl?.textContent) metadata.title = titleEl.textContent;

  // Also check ttm:title for Apple Music format
  const ttmTitleEl = doc.getElementsByTagName("ttm:title")[0];
  if (ttmTitleEl?.textContent && !metadata.title) metadata.title = ttmTitleEl.textContent;

  const artistEl = doc.querySelector('[type="artist"]');
  if (artistEl?.textContent) metadata.artist = artistEl.textContent;

  const albumEl = doc.querySelector('[type="album"]');
  if (albumEl?.textContent) metadata.album = albumEl.textContent;

  // Extract agents from metadata
  const agents: Agent[] = [];
  const agentEls = doc.getElementsByTagName("ttm:agent");
  for (const el of agentEls) {
    const id = el.getAttribute("xml:id");
    const type = (el.getAttribute("type") as AgentType) || "person";
    const nameEl = el.getElementsByTagName("ttm:name")[0];
    const name = nameEl?.textContent || `Voice ${agents.length + 1}`;
    if (id) {
      agents.push({ id, type, name });
    }
  }

  // Parse composer:groups registry
  const groups: LinkGroup[] = [];
  const groupEls = Array.from(doc.getElementsByTagName("composer:group")).concat(
    Array.from(doc.getElementsByTagNameNS(COMPOSER_NS, "group")),
  );
  const seenGroupIds = new Set<string>();
  for (const el of groupEls) {
    const id = el.getAttribute("id");
    if (!id || seenGroupIds.has(id)) continue;
    seenGroupIds.add(id);
    const label = el.getAttribute("label") ?? "Group";
    const color = el.getAttribute("color") ?? "#9ca3af";
    const versionStr = el.getAttribute("templateVersion");
    const templateVersion = versionStr ? Number.parseInt(versionStr, 10) || 1 : 1;
    groups.push({ id, label, color, templateVersion });
  }

  // Parse lyrics - look for <p> elements with timing
  const paragraphs = doc.getElementsByTagName("p");

  for (const p of paragraphs) {
    const begin = parseTtmlTimestamp(p.getAttribute("begin") ?? "");
    const end = parseTtmlTimestamp(p.getAttribute("end") ?? "");
    const agentId = p.getAttribute("ttm:agent")?.replace("#", "") ?? "v1";

    // Extract composer: group attrs (try plain attribute first, then namespaced lookup)
    const rawGroupId = p.getAttribute("composer:groupId") ?? p.getAttributeNS(COMPOSER_NS, "groupId") ?? null;
    const knownGroupId = rawGroupId && seenGroupIds.has(rawGroupId) ? rawGroupId : null;
    if (rawGroupId && !knownGroupId) {
      console.warn(`[Composer] TTML <p> references unknown groupId="${rawGroupId}"; treating line as standalone.`);
    }
    const instanceIdxStr =
      p.getAttribute("composer:instanceIdx") ?? p.getAttributeNS(COMPOSER_NS, "instanceIdx") ?? null;
    const templateLineIdxStr =
      p.getAttribute("composer:templateLineIdx") ?? p.getAttributeNS(COMPOSER_NS, "templateLineIdx") ?? null;
    const detachedStr = p.getAttribute("composer:detached") ?? p.getAttributeNS(COMPOSER_NS, "detached") ?? null;

    const groupFields = knownGroupId
      ? {
          groupId: knownGroupId,
          instanceIdx: instanceIdxStr ? Number.parseInt(instanceIdxStr, 10) || 0 : 0,
          templateLineIdx: templateLineIdxStr ? Number.parseInt(templateLineIdxStr, 10) || 0 : 0,
          ...(detachedStr === "true" ? { detached: true } : {}),
        }
      : {};

    // Find background vocal container (x-bg role)
    // Note: use getElementsByTagName for namespace compatibility
    const allSpansInP = p.getElementsByTagName("span");
    let bgContainer: Element | null = null;
    for (const span of allSpansInP) {
      const role = span.getAttribute("ttm:role") || span.getAttributeNS("http://www.w3.org/ns/ttml#metadata", "role");
      if (role === "x-bg") {
        bgContainer = span;
        break;
      }
    }

    let backgroundText: string | undefined;
    let backgroundWords: WordTiming[] | undefined;

    if (bgContainer) {
      backgroundWords = inferSyllableGroupIds(extractTimedWords(bgContainer, null));
      if (backgroundWords.length > 0) {
        backgroundText = reconstructLineText(backgroundWords, getSplitCharacter());
      } else {
        backgroundText = bgContainer.textContent || undefined;
      }
    }

    // Imported background is authored content (not auto-extracted by this app);
    // stamp it manual so a later re-paste of parenthesised lyrics does not
    // double it, and so the provenance triple stays coherent.
    const backgroundTextSource: "manual" | undefined =
      backgroundText || (backgroundWords && backgroundWords.length > 0) ? "manual" : undefined;

    // Check for word-level timing (span elements NOT inside x-bg)
    const words = inferSyllableGroupIds(extractTimedWords(p, bgContainer));

    if (words.length > 0) {
      lines.push(
        reconcileLine({
          id: generateLineId(),
          text: reconstructLineText(words, getSplitCharacter()),
          agentId,
          words,
          backgroundText,
          backgroundWords,
          backgroundTextSource,
          ...groupFields,
        }),
      );
    } else {
      // Line-level timing only - extract text without bg content
      let text = "";
      for (const node of p.childNodes) {
        if (node.nodeType === Node.TEXT_NODE) {
          text += node.textContent ?? "";
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as Element;
          const role = el.getAttribute("ttm:role") || el.getAttributeNS("http://www.w3.org/ns/ttml#metadata", "role");
          if (role !== "x-bg") {
            text += el.textContent ?? "";
          }
        }
      }
      text = text.trim();

      if (text) {
        lines.push(
          reconcileLine({
            id: generateLineId(),
            text,
            agentId,
            begin: begin || undefined,
            end: end || undefined,
            backgroundText,
            backgroundWords,
            backgroundTextSource,
            ...groupFields,
          }),
        );
      }
    }
  }

  return {
    lines,
    metadata,
    hasTimingData: lines.some((l) => l.begin !== undefined || l.words?.length),
    agents: agents.length > 0 ? agents : undefined,
    groups: groups.length > 0 ? groups : undefined,
  };
}

// -- Exports ------------------------------------------------------------------

export { parseTtml };
