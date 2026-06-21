import { formatTime } from "@/utils/format-time";

// -- Helpers ------------------------------------------------------------------

function parseDurationInput(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  const colonMatch = /^(\d+):(\d{1,2})$/.exec(trimmed);
  if (colonMatch) {
    const minutes = Number(colonMatch[1]);
    const seconds = Number(colonMatch[2]);
    if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || seconds >= 60) return undefined;
    return minutes * 60 + seconds;
  }
  const intMatch = /^(\d+)$/.exec(trimmed);
  if (intMatch) {
    const total = Number(intMatch[1]);
    if (!Number.isFinite(total)) return undefined;
    return total;
  }
  return undefined;
}

function formatDuration(totalSeconds: number): string {
  return formatTime(Math.max(0, Math.round(totalSeconds)), 0);
}

// -- Exports ------------------------------------------------------------------

export { formatDuration, parseDurationInput };
