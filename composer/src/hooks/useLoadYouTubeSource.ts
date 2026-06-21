import { useCallback } from "react";
import { useAudioStore } from "@/stores/audio";
import { useProjectStore } from "@/stores/project";

// -- Hook ---------------------------------------------------------------------

function useLoadYouTubeSource(): (videoId: string) => Promise<void> {
  return useCallback((videoId: string) => {
    const audio = useAudioStore.getState();
    const prevVideoId = audio.source?.type === "youtube" ? audio.source.videoId : null;
    audio.setYouTubeSource(videoId);

    const project = useProjectStore.getState();
    if (!project.metadata.title || prevVideoId !== videoId) {
      project.setMetadata({ title: videoId });
    }

    return waitForYouTubeLoad(videoId);
  }, []);
}

function waitForYouTubeLoad(videoId: string): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const unsubscribe = useAudioStore.subscribe((state) => {
      if (matchesLoaded(state.source, videoId)) {
        unsubscribe();
        resolve();
        return;
      }
      if (state.youtubeLoadError) {
        unsubscribe();
        reject(new Error(state.youtubeLoadError));
        return;
      }
      if (!matchesPending(state.source, videoId)) {
        unsubscribe();
        reject(new Error("youtube_load_superseded"));
      }
    });
  });
}

function matchesLoaded(source: ReturnType<typeof useAudioStore.getState>["source"], videoId: string): boolean {
  return source?.type === "youtube" && source.videoId === videoId && source.file != null;
}

function matchesPending(source: ReturnType<typeof useAudioStore.getState>["source"], videoId: string): boolean {
  return source?.type === "youtube" && source.videoId === videoId;
}

// -- Exports ------------------------------------------------------------------

export { useLoadYouTubeSource };
