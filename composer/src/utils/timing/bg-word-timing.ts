import { createWordTimingOps } from "@/utils/timing/word-timing-ops";

const { nudgeBegin, setBegin, nudgeEnd, setEnd } = createWordTimingOps({
  getWords: (line) => line.backgroundWords,
  updateKey: "backgroundWords",
});

export {
  nudgeBegin as nudgeBgWordBegin,
  setBegin as setBgWordBegin,
  nudgeEnd as nudgeBgWordEnd,
  setEnd as setBgWordEnd,
};
