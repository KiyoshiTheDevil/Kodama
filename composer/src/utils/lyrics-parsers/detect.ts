// -- Types --------------------------------------------------------------------

type LyricsFileType = "txt" | "lrc" | "srt" | "ttml" | "unknown";

// -- Detection ----------------------------------------------------------------

function detectFileType(filename: string, content: string): LyricsFileType {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "txt") return "txt";
  if (ext === "lrc") return "lrc";
  if (ext === "srt") return "srt";
  if (ext === "ttml" || ext === "xml") {
    if (content.includes("<tt") || content.includes("xmlns:tt")) {
      return "ttml";
    }
  }
  // Try to detect by content
  if (content.includes("<tt") || content.includes("xmlns:tt")) return "ttml";
  if (/^\[\d{1,2}:\d{2}/.test(content)) return "lrc";
  if (/^\d+\r?\n\d{2}:\d{2}:\d{2}/.test(content)) return "srt";
  return "txt";
}

// -- Exports ------------------------------------------------------------------

export { detectFileType };
export type { LyricsFileType };
