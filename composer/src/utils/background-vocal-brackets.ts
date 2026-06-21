import type { WordTiming } from "@/domain/word/timing";

// -- Trailing space accessors -------------------------------------------------

function stripTrailingSpace(s: string): string {
  return s.replace(/ +$/, "");
}

function trailingSpaceOf(s: string): string {
  const m = s.match(/ +$/);
  return m ? m[0] : "";
}

// -- Word-list bracket wrapping -----------------------------------------------

function bracketWordList(words: WordTiming[]): WordTiming[] {
  if (words.length === 0) return words;
  if (words.length === 1) {
    const only = words[0];
    const core = stripTrailingSpace(only.text);
    const trail = trailingSpaceOf(only.text);
    return [{ ...only, text: `(${core})${trail}` }];
  }
  const first = words[0];
  const last = words[words.length - 1];
  const lastCore = stripTrailingSpace(last.text);
  const lastTrail = trailingSpaceOf(last.text);
  const out = [...words];
  out[0] = { ...first, text: `(${first.text}` };
  out[out.length - 1] = { ...last, text: `${lastCore})${lastTrail}` };
  return out;
}

// -- Seam-aware concatenation -------------------------------------------------

function joinBracketedCarriedWords(
  baseWords: WordTiming[],
  carried: WordTiming[],
  canSeamStrip: boolean,
): WordTiming[] {
  if (!canSeamStrip) return [...baseWords, ...carried];
  if (baseWords.length === 0) return carried;
  if (carried.length === 0) return baseWords;
  const lastBase = baseWords[baseWords.length - 1];
  const firstCarry = carried[0];
  const lastBaseStripped = stripTrailingSpace(lastBase.text);
  const lastBaseTrail = trailingSpaceOf(lastBase.text);
  const lastEndsBracket = lastBaseStripped.endsWith(")");
  const firstStartsBracket = firstCarry.text.startsWith("(");
  if (!lastEndsBracket || !firstStartsBracket) return [...baseWords, ...carried];
  const lastBaseText = `${lastBaseStripped.slice(0, -1)}${lastBaseTrail.length > 0 ? lastBaseTrail : " "}`;
  const firstCarryText = firstCarry.text.slice(1);
  return [
    ...baseWords.slice(0, -1),
    { ...lastBase, text: lastBaseText },
    { ...firstCarry, text: firstCarryText },
    ...carried.slice(1),
  ];
}

// -- Exports ------------------------------------------------------------------

export { bracketWordList, joinBracketedCarriedWords };
