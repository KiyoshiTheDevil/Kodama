// Lyrics parsers (LRC / TTML / Musixmatch richsync) + small time helpers. Pure functions,
// no external deps — extracted from App.jsx.

function parseLrc(lrc) {
  if (!lrc) return [];
  const lines = [];
  for (const line of lrc.split("\n")) {
    const m = line.match(/\[(\d+):(\d+\.\d+)\](.*)/);
    if (m) {
      const time = parseInt(m[1]) * 60 + parseFloat(m[2]);
      lines.push({ time, text: m[3].trim() });
    }
  }
  return lines.sort((a, b) => a.time - b.time);
}

function parseRichSync(richsync) {
  // Musixmatch RichSync: [{ ts, te, l: [{c, o}], x }, ...]
  // ts/te = line start/end in seconds, l[i].c = word/char, l[i].o = offset from ts
  if (!Array.isArray(richsync)) return [];
  return richsync
    .filter(line => line && typeof line.ts === "number")
    .map(line => {
      const words = (line.l || []).map((w, j) => {
        const wordStart = line.ts + (w.o || 0);
        const wordEnd = line.l[j + 1] ? line.ts + line.l[j + 1].o : line.te;
        return { text: w.c, time: wordStart, end: wordEnd, isSpace: (w.c || "").trim() === "" };
      });
      return { time: line.ts, endTime: line.te, words, wordSync: true, text: line.x || "" };
    });
}

function parseTtml(ttml) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(ttml, "text/xml");

  // Detect timing mode: "Line" = one timestamp per line, "Word" = per-word timestamps
  const ttEl = doc.querySelector("tt");
  const timingMode = ttEl?.getAttribute("itunes:timing") || ttEl?.getAttribute("composer:timing") || "Word";
  const isLineSync = timingMode === "Line";

  // Parse agents from <head><metadata><ttm:agent>
  const TTM_NS = "http://www.w3.org/ns/ttml#metadata";
  const agents = {};
  let leadAgentId = null;
  const agentEls = doc.getElementsByTagNameNS(TTM_NS, "agent");
  for (const a of agentEls) {
    const id = a.getAttribute("xml:id");
    const type = a.getAttribute("type");
    const nameEls = a.getElementsByTagNameNS(TTM_NS, "name");
    const name = nameEls[0]?.textContent?.trim();
    if (id) {
      agents[id] = { id, type, name };
      if (!leadAgentId && type === "person") leadAgentId = id;
    }
  }

  const lines = [];
  for (const p of doc.querySelectorAll("p")) {
    const begin = p.getAttribute("begin");
    const end = p.getAttribute("end");
    if (!begin) continue;
    const time = ttmlTimeToSeconds(begin);
    const endTime = end ? ttmlTimeToSeconds(end) : null;

    // Resolve agent and role
    const agentId = p.getAttribute("ttm:agent");
    const agent = agentId ? (agents[agentId] || null) : null;
    let agentRole = null;
    if (agent) {
      if (agent.type === "group") agentRole = "group";
      else if (agentId === leadAgentId) agentRole = "lead";
      else agentRole = "featured";
    }

    if (isLineSync) {
      // Line-sync main text + BG vocals that may have their own per-word timestamps.
      // Even in line-sync mode the x-bg span can contain timed inner spans — extract
      // those as bgWords so the RAF can animate them word-by-word.
      let mainText = "";
      const bgWords = [];

      const extractBgWords = (node, iBegin, iEnd) => {
        if (node.nodeType === Node.TEXT_NODE) {
          const t = node.textContent;
          if (t) bgWords.push({
            text: t,
            time: ttmlTimeToSeconds(iBegin || begin),
            end: ttmlTimeToSeconds(iEnd || end || begin),
            isSpace: t.trim() === "",
          });
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const b = node.getAttribute("begin") || iBegin || begin;
          const e = node.getAttribute("end")   || iEnd   || end || begin;
          for (const c of node.childNodes) extractBgWords(c, b, e);
        }
      };

      for (const child of p.childNodes) {
        if (child.nodeType === Node.TEXT_NODE) {
          mainText += child.textContent;
        } else if (child.nodeType === Node.ELEMENT_NODE) {
          if (child.getAttribute("ttm:role") === "x-bg")
            for (const c of child.childNodes) extractBgWords(c, begin, end);
          else
            mainText += child.textContent;
        }
      }
      mainText = mainText.trim();

      // Stretch line time-range to fully cover bg vocals (before or after main line)
      let effectiveTime = time;
      let effectiveEnd  = endTime;
      if (bgWords.length) {
        const bgNS = bgWords.filter(w => !w.isSpace);
        if (bgNS.length) {
          const bgFirst = Math.min(...bgNS.map(w => w.time));
          const bgLast  = Math.max(...bgNS.map(w => w.end));
          if (isFinite(bgFirst) && bgFirst < effectiveTime) effectiveTime = bgFirst;
          if (isFinite(bgLast)  && bgLast  > (effectiveEnd ?? 0)) effectiveEnd = bgLast;
        }
      }

      if (mainText || bgWords.length) {
        const lineObj = { time: effectiveTime, endTime: effectiveEnd,
          text: mainText || "\u00A0", wordSync: false, lineSync: true, agent, agentRole };
        if (bgWords.length) lineObj.bgWords = bgWords;
        lines.push(lineObj);
      }
      continue;
    }

    // Word-sync: extract per-span timestamps; separate background vocals (ttm:role="x-bg")
    const words = [];
    const bgWords = [];
    const processNode = (node, inheritBegin, inheritEnd, isBg = false) => {
      if (node.nodeType === Node.TEXT_NODE) {
        const text = node.textContent;
        if (text) {
          const w = {
            text,
            time: ttmlTimeToSeconds(inheritBegin || begin),
            end: ttmlTimeToSeconds(inheritEnd || end || begin),
            isSpace: text.trim() === "",
          };
          if (isBg) bgWords.push(w); else words.push(w);
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const nextIsBg = isBg || node.getAttribute("ttm:role") === "x-bg";
        const b = node.getAttribute("begin") || inheritBegin || begin;
        const e = node.getAttribute("end") || inheritEnd || end || begin;
        for (const child of node.childNodes) processNode(child, b, e, nextIsBg);
      }
    };

    for (const child of p.childNodes) processNode(child, begin, end, false);
    if (words.length || bgWords.length) {
      // Stretch the line's time range to fully cover bg vocals in both directions.
      // BG vocals can start before the main line (extend time backward) or end
      // after it (extend endTime forward) — the line must stay active throughout.
      let effectiveTime = time;
      let effectiveEnd = endTime;
      if (bgWords.length) {
        const bgNonSpace = bgWords.filter(w => !w.isSpace);
        if (bgNonSpace.length) {
          const bgFirst = Math.min(...bgNonSpace.map(w => w.time));
          const bgLast  = Math.max(...bgNonSpace.map(w => w.end));
          if (isFinite(bgFirst) && bgFirst < effectiveTime) effectiveTime = bgFirst;
          if (isFinite(bgLast)  && bgLast  > (effectiveEnd ?? 0)) effectiveEnd = bgLast;
        }
      }
      const lineObj = { time: effectiveTime, endTime: effectiveEnd, words, wordSync: true, agent, agentRole };
      if (bgWords.length) lineObj.bgWords = bgWords;
      lines.push(lineObj);
    }
  }
  return lines;
}

function ttmlTimeToSeconds(t) {
  if (!t) return 0;
  // Format: HH:MM:SS.mmm or MM:SS.mmm
  const parts = t.split(":");
  if (parts.length === 3) {
    return parseFloat(parts[0]) * 3600 + parseFloat(parts[1]) * 60 + parseFloat(parts[2]);
  } else if (parts.length === 2) {
    return parseFloat(parts[0]) * 60 + parseFloat(parts[1]);
  }
  return parseFloat(t);
}

function parseDurationToSeconds(str) {
  if (!str) return null;
  const parts = str.split(":").map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

export { parseLrc, parseRichSync, parseTtml, ttmlTimeToSeconds, parseDurationToSeconds };
