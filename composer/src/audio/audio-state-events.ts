function bindAudioStateEvents(
  audio: HTMLAudioElement,
  getIsPlaying: () => boolean,
  setIsPlaying: (isPlaying: boolean) => void,
): () => void {
  const handlePlay = () => {
    if (getIsPlaying()) return;
    setIsPlaying(true);
  };
  const handlePause = () => {
    if (!getIsPlaying()) return;
    setIsPlaying(false);
  };
  audio.addEventListener("play", handlePlay);
  audio.addEventListener("pause", handlePause);
  return () => {
    audio.removeEventListener("play", handlePlay);
    audio.removeEventListener("pause", handlePause);
  };
}

export { bindAudioStateEvents };
