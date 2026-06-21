import { DEFAULT_AGENTS } from "@/domain/agent/colors";
import { reconcileLine, type LyricLine } from "@/domain/line/model";
import type { WordTiming } from "@/domain/word/timing";

interface FactoryLineOptions {
  id?: string;
  text?: string;
  agentId?: string;
  begin?: number;
  end?: number;
  words?: FactoryWordOptions[];
  backgroundText?: string;
  backgroundWords?: FactoryWordOptions[];
  backgroundTextSource?: "extraction" | "manual";
  groupId?: string;
  instanceIdx?: number;
}

interface FactoryWordOptions {
  text: string;
  begin: number;
  end: number;
  explicit?: true;
  syllableGroupId?: string;
}

interface FactoryGroupOptions {
  id?: string;
  label?: string;
  color?: string;
  templateVersion?: number;
}

let lineCounter = 0;
let groupCounter = 0;

function createWord(opts: FactoryWordOptions): WordTiming {
  return {
    text: opts.text,
    begin: opts.begin,
    end: opts.end,
    ...(opts.explicit ? { explicit: opts.explicit } : {}),
    ...(opts.syllableGroupId ? { syllableGroupId: opts.syllableGroupId } : {}),
  };
}

function createLine(opts: FactoryLineOptions = {}): LyricLine {
  const id = opts.id ?? `line-${++lineCounter}`;
  const text = opts.text ?? "Test lyric line";
  const agentId = opts.agentId ?? DEFAULT_AGENTS[0]?.id ?? "v1";
  return reconcileLine({
    id,
    text,
    agentId,
    ...(opts.begin !== undefined ? { begin: opts.begin } : {}),
    ...(opts.end !== undefined ? { end: opts.end } : {}),
    ...(opts.words ? { words: opts.words.map(createWord) } : {}),
    ...(opts.backgroundText ? { backgroundText: opts.backgroundText } : {}),
    ...(opts.backgroundWords ? { backgroundWords: opts.backgroundWords.map(createWord) } : {}),
    ...(opts.backgroundTextSource ? { backgroundTextSource: opts.backgroundTextSource } : {}),
    ...(opts.groupId ? { groupId: opts.groupId } : {}),
    ...(opts.instanceIdx !== undefined ? { instanceIdx: opts.instanceIdx } : {}),
  });
}

function createGroup(opts: FactoryGroupOptions = {}) {
  const id = opts.id ?? `group-${++groupCounter}`;
  return {
    id,
    label: opts.label ?? `Group ${groupCounter}`,
    color: opts.color ?? "#a3c9ff",
    templateVersion: opts.templateVersion ?? 0,
  };
}

export { createLine, createWord, createGroup };
