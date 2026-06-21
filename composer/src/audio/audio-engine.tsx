import { decodeAudioToWav, needsWavConversion } from "@/audio/audio-decode";
import { bindAudioStateEvents } from "@/audio/audio-state-events";
import { scrubPreview } from "@/audio/scrub-preview";
import { scrubStemRouter } from "@/audio/scrub-stem-router";
import { useAudioStore } from "@/stores/audio";
import { useProjectStore } from "@/stores/project";
import { useSeparationStore } from "@/stores/separation";
import { useEffect, useRef } from "react";

// -- Constants -----------------------------------------------------------------

const LOG_PREFIX = "[AudioEngine]";
const SLOW_DECODE_MS = 800;

// -- Component -----------------------------------------------------------------

const AudioEngine: React.FC = () => {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const originalUrlRef = useRef<string | null>(null);

  const source = useAudioStore((s) => s.source);
  const isPlaying = useAudioStore((s) => s.isPlaying);
  const playbackRate = useAudioStore((s) => s.playbackRate);
  const volume = useAudioStore((s) => s.volume);
  const isMuted = useAudioStore((s) => s.isMuted);
  const audioElement = useAudioStore((s) => s.audioElement);
  const setCurrentTime = useAudioStore((s) => s.setCurrentTime);
  const setDuration = useAudioStore((s) => s.setDuration);
  const setIsPlaying = useAudioStore((s) => s.setIsPlaying);
  const setIsLoading = useAudioStore((s) => s.setIsLoading);
  const registerAudioElement = useAudioStore((s) => s.registerAudioElement);

  const currentStem = useSeparationStore((s) => s.currentStem);
  const stemUrls = useSeparationStore((s) => s.stemUrls);

  useEffect(() => {
    if (!source) {
      registerAudioElement(null);
      scrubStemRouter.clearCache();
      return;
    }

    const playableFile = source.type === "file" ? source.file : source.type === "youtube" ? source.file : null;
    if (!playableFile) {
      registerAudioElement(null);
      scrubStemRouter.clearCache();
      return;
    }

    let aborted = false;
    let teardown: (() => void) | null = null;
    let slowTimer: number | null = null;
    let didSetLoading = false;

    const clearSlowLoading = () => {
      if (slowTimer !== null) {
        window.clearTimeout(slowTimer);
        slowTimer = null;
      }
      if (didSetLoading) {
        didSetLoading = false;
        setIsLoading(false);
      }
    };

    // mp3 and raw aac seek slowly because the streaming decoder has no
    // reliable frame index. Decoding to uncompressed WAV up front gives the
    // <audio> element an O(1)-seekable source. Other inputs (opus, webm,
    // m4a-with-mp4-container, ogg) already seek fine.
    const resolvePlaybackUrl = async (): Promise<{ url: string; stripped: boolean | null }> => {
      if (!needsWavConversion(playableFile)) {
        return { url: URL.createObjectURL(playableFile), stripped: true };
      }
      slowTimer = window.setTimeout(() => {
        slowTimer = null;
        didSetLoading = true;
        setIsLoading(true);
      }, SLOW_DECODE_MS);
      try {
        const wavBlob = await decodeAudioToWav(playableFile);
        return { url: URL.createObjectURL(wavBlob), stripped: true };
      } catch (err) {
        console.warn(LOG_PREFIX, "audio decode failed, using original file", err);
        return { url: URL.createObjectURL(playableFile), stripped: null };
      }
    };

    const loadScrubBuffer = async () => {
      try {
        const bytes = await playableFile.arrayBuffer();
        if (aborted) return;
        const audioBuffer = await scrubPreview.decode(bytes);
        if (aborted) return;
        scrubStemRouter.setOriginalBuffer(audioBuffer);
      } catch (err) {
        if (aborted) return;
        console.warn(LOG_PREFIX, "scrub-preview decode failed", err);
        scrubStemRouter.setOriginalBuffer(null);
      }
    };
    void loadScrubBuffer();

    const setup = async () => {
      let objectUrl: string;
      let stripped: boolean | null;
      try {
        ({ url: objectUrl, stripped } = await resolvePlaybackUrl());
      } finally {
        clearSlowLoading();
      }
      if (aborted) {
        URL.revokeObjectURL(objectUrl);
        return;
      }

      const audio = new Audio();
      audio.id = "composer-audio";
      audio.src = objectUrl;
      const {
        playbackRate: initialPlaybackRate,
        volume: initialVolume,
        isMuted: initialIsMuted,
        isPlaying: initialIsPlaying,
      } = useAudioStore.getState();
      audio.playbackRate = initialPlaybackRate;
      audio.volume = initialVolume;
      audio.muted = initialIsMuted;
      audio.style.display = "none";
      document.body.appendChild(audio);
      audioRef.current = audio;
      originalUrlRef.current = objectUrl;
      registerAudioElement(audio);
      if (stripped !== null) useProjectStore.getState().setPrimingStripped(stripped);
      if (initialIsPlaying) audio.play().catch(() => undefined);

      const handleLoadedMetadata = () => setDuration(audio.duration);
      const handleTimeUpdate = () => setCurrentTime(audio.currentTime);
      const handleEnded = () => setIsPlaying(false);
      const handleError = (e: Event) => {
        console.error(LOG_PREFIX, "Audio error:", e);
      };

      audio.addEventListener("loadedmetadata", handleLoadedMetadata);
      audio.addEventListener("timeupdate", handleTimeUpdate);
      audio.addEventListener("ended", handleEnded);
      audio.addEventListener("error", handleError);
      const unbindStateEvents = bindAudioStateEvents(audio, () => useAudioStore.getState().isPlaying, setIsPlaying);

      teardown = () => {
        audio.removeEventListener("loadedmetadata", handleLoadedMetadata);
        audio.removeEventListener("timeupdate", handleTimeUpdate);
        audio.removeEventListener("ended", handleEnded);
        audio.removeEventListener("error", handleError);
        unbindStateEvents();
        audio.pause();
        audio.src = "";
        audio.remove();
        if (audioRef.current === audio) audioRef.current = null;
        if (originalUrlRef.current === objectUrl) originalUrlRef.current = null;
        URL.revokeObjectURL(objectUrl);
      };
    };

    void setup();

    return () => {
      aborted = true;
      clearSlowLoading();
      if (teardown) teardown();
      registerAudioElement(null);
      scrubStemRouter.clearCache();
    };
  }, [source, setDuration, setCurrentTime, setIsPlaying, setIsLoading, registerAudioElement]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.play().catch(() => undefined);
    } else {
      audio.pause();
    }
  }, [isPlaying]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.playbackRate = playbackRate;
    audio.volume = volume;
    audio.muted = isMuted;
  }, [playbackRate, volume, isMuted]);

  useEffect(() => {
    const audio = audioElement;
    if (!audio) return;
    const stemUrl = currentStem !== "original" ? stemUrls[currentStem] : null;
    const targetUrl = stemUrl ?? originalUrlRef.current;
    if (!targetUrl || audio.src === targetUrl) return;
    const wasPlaying = !audio.paused;
    const time = audio.currentTime;
    const {
      playbackRate: currentPlaybackRate,
      volume: currentVolume,
      isMuted: currentIsMuted,
    } = useAudioStore.getState();
    audio.src = targetUrl;
    audio.currentTime = time;
    audio.playbackRate = currentPlaybackRate;
    audio.volume = currentVolume;
    audio.muted = currentIsMuted;
    if (wasPlaying) audio.play().catch(() => {});
  }, [currentStem, stemUrls, audioElement]);

  useEffect(() => {
    scrubStemRouter.selectStem(currentStem, () => stemUrls[currentStem]);
  }, [currentStem, stemUrls]);

  return null;
};

// -- Exports -------------------------------------------------------------------

export { AudioEngine };
