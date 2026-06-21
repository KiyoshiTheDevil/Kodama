import { useSettingsStore } from "@/stores/settings";
import { create } from "zustand";

// -- Types --------------------------------------------------------------------

type AudioSource = { type: "file"; file: File } | { type: "youtube"; videoId: string; file?: File } | null;

interface AudioState {
  source: AudioSource;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  volume: number;
  isMuted: boolean;
  isLoading: boolean;
  audioElement: HTMLAudioElement | null;
  youtubeLoadError: string | null;
}

interface AudioActions {
  setSource: (source: AudioSource) => void;
  setYouTubeSource: (videoId: string, file?: File) => void;
  setYouTubeFile: (file: File) => void;
  setIsPlaying: (isPlaying: boolean) => void;
  setCurrentTime: (time: number) => void;
  setDuration: (duration: number) => void;
  setPlaybackRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  setIsLoading: (isLoading: boolean) => void;
  setYouTubeLoadError: (error: string | null) => void;
  registerAudioElement: (element: HTMLAudioElement | null) => void;
  seekTo: (time: number) => void;
  reset: () => void;
}

// -- Constants ----------------------------------------------------------------

function createInitialState(): AudioState {
  const settings = useSettingsStore.getState();
  return {
    source: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    playbackRate: settings.defaultPlaybackRate,
    volume: settings.rememberVolume ? settings.lastVolume : 1,
    isMuted: false,
    isLoading: false,
    audioElement: null,
    youtubeLoadError: null,
  };
}

const INITIAL_STATE: AudioState = createInitialState();

// -- Store --------------------------------------------------------------------

const useAudioStore = create<AudioState & AudioActions>((set, get) => ({
  ...INITIAL_STATE,

  setSource: (source) =>
    set({
      source,
      currentTime: 0,
      duration: 0,
      isPlaying: false,
      youtubeLoadError: null,
    }),
  setYouTubeSource: (videoId, file) =>
    set({
      source: { type: "youtube", videoId, file },
      currentTime: 0,
      duration: 0,
      isPlaying: false,
      youtubeLoadError: null,
    }),
  setYouTubeFile: (file) =>
    set((s) => {
      if (!s.source || s.source.type !== "youtube") return {};
      return {
        source: { ...s.source, file },
      };
    }),
  setIsPlaying: (isPlaying) => set({ isPlaying }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),
  setPlaybackRate: (playbackRate) => {
    if (!Number.isFinite(playbackRate) || playbackRate <= 0) return;
    useSettingsStore.getState().set("defaultPlaybackRate", playbackRate);
    set({ playbackRate });
  },
  setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),
  toggleMute: () => set((s) => ({ isMuted: !s.isMuted })),
  setIsLoading: (isLoading) => set({ isLoading }),
  setYouTubeLoadError: (youtubeLoadError) => set({ youtubeLoadError }),
  registerAudioElement: (audioElement) => set({ audioElement }),
  seekTo: (time: number) => {
    if (!Number.isFinite(time) || time < 0) return;
    const audio = get().audioElement;
    if (audio) {
      audio.currentTime = time;
    }
    set({ currentTime: time });
  },
  reset: () => set(createInitialState()),
}));

export { useAudioStore };
export type { AudioSource };
