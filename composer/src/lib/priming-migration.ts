import { parseLamePriming } from "@/audio/lame-priming";
import { isLineSynced, isWordSynced } from "@/domain/line/predicates";
import type { LyricLine } from "@/domain/line/model";
import type { WordTiming } from "@/domain/word/timing";
import { loadAudioFile, loadCurrentProject, replaceCurrentProject, type SavedProject } from "@/lib/persistence";

// -- Helpers ------------------------------------------------------------------

function shiftWord(word: WordTiming, shiftSec: number): WordTiming {
  return {
    ...word,
    begin: Math.max(0, word.begin - shiftSec),
    end: Math.max(0, word.end - shiftSec),
  };
}

function shiftLine(line: LyricLine, shiftSec: number): LyricLine {
  const next = { ...line } as LyricLine;
  if (isWordSynced(next)) {
    (next as { words: WordTiming[] }).words = next.words!.map((w) => shiftWord(w, shiftSec));
  }
  if (isLineSynced(next)) {
    (next as { begin: number; end: number }).begin = Math.max(0, next.begin - shiftSec);
    (next as { begin: number; end: number }).end = Math.max(0, next.end - shiftSec);
  }
  if (next.backgroundWords) {
    next.backgroundWords = next.backgroundWords.map((w) => shiftWord(w, shiftSec));
  }
  return next;
}

// -- Public API ---------------------------------------------------------------

function shiftAllTimings(lines: LyricLine[], shiftSec: number): LyricLine[] {
  if (shiftSec === 0) return lines;
  return lines.map((line) => shiftLine(line, shiftSec));
}

async function loadCurrentProjectWithPrimingMigration(): Promise<SavedProject | undefined> {
  const project = await loadCurrentProject();
  if (!project) return project;
  if (project.primingStripped === true) return project;
  const audioFile = await loadAudioFile();
  if (!audioFile) return project;
  const buf = await audioFile.arrayBuffer();
  const { samples, sampleRate } = parseLamePriming(buf);
  if (samples > 0 && sampleRate > 0) {
    const shiftSec = samples / sampleRate;
    project.lines = shiftAllTimings(project.lines ?? [], shiftSec);
  }
  project.primingStripped = true;
  await replaceCurrentProject(project);
  return project;
}

// -- Exports ------------------------------------------------------------------

export { shiftAllTimings, loadCurrentProjectWithPrimingMigration };
