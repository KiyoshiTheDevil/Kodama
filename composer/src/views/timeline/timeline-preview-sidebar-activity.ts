interface TimingState {
  isActive: boolean;
  isComplete: boolean;
  progress: number;
}

function getTimingState(begin: number, end: number, currentTime: number): TimingState {
  if (begin === end) {
    if (currentTime >= begin) return { isActive: false, isComplete: true, progress: 1 };
    return { isActive: false, isComplete: false, progress: 0 };
  }
  if (currentTime < begin) return { isActive: false, isComplete: false, progress: 0 };
  if (currentTime >= end) return { isActive: false, isComplete: true, progress: 1 };
  return { isActive: true, isComplete: false, progress: (currentTime - begin) / (end - begin) };
}

export { getTimingState };
