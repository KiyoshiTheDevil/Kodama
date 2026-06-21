import { createWordTimingOps } from "@/utils/timing/word-timing-ops";

const { nudgeBegin, setBegin, nudgeEnd, setEnd } = createWordTimingOps({
  getWords: (line) => line.words,
  updateKey: "words",
});

export { nudgeBegin as nudgeWordBegin, setBegin as setWordBegin, nudgeEnd as nudgeWordEnd, setEnd as setWordEnd };
