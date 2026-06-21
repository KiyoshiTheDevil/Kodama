import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useLoadYouTubeSource } from "@/hooks/useLoadYouTubeSource";
import { getPersistenceSettled } from "@/lib/persistence-settled";
import { useAudioStore } from "@/stores/audio";
import { stripQueryParams } from "@/utils/url-params";
import { extractVideoId } from "@/utils/youtube-url";

// -- Constants ----------------------------------------------------------------

const YOUTUBE_PARAM_NAMES = ["youtube", "videoId", "v"] as const;
const LOG_PREFIX = "[Boot]";

// -- Functions ----------------------------------------------------------------

function readYouTubeParam(params: URLSearchParams): string | null {
  for (const name of YOUTUBE_PARAM_NAMES) {
    const value = params.get(name);
    if (value) return value;
  }
  return null;
}

function cleanYouTubeParamsFromUrl(): void {
  stripQueryParams(YOUTUBE_PARAM_NAMES);
}

function useImportFromYouTube(): void {
  const loadYouTubeSource = useLoadYouTubeSource();
  const loadRef = useRef(loadYouTubeSource);
  loadRef.current = loadYouTubeSource;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const raw = readYouTubeParam(params);
    if (!raw) return;

    const videoId = extractVideoId(raw);
    cleanYouTubeParamsFromUrl();

    if (!videoId) {
      toast.error("That URL doesn't look like a valid YouTube video");
      return;
    }

    let cancelled = false;
    if (import.meta.env.DEV) console.log(`${LOG_PREFIX} useImportFromYouTube awaiting settled`, { videoId });
    getPersistenceSettled().then(() => {
      if (cancelled) return;
      const current = useAudioStore.getState().source;
      if (current?.type === "youtube" && current.videoId === videoId && current.file) {
        if (import.meta.env.DEV) console.log(`${LOG_PREFIX} useImportFromYouTube cache hit`, { videoId });
        return;
      }
      if (import.meta.env.DEV) console.log(`${LOG_PREFIX} useImportFromYouTube loading`, { videoId, current });
      loadRef.current(videoId).catch(() => {
        // Error is surfaced via useAudioStore.youtubeLoadError and the tunnel toast.
      });
    });

    return () => {
      cancelled = true;
    };
  }, []);
}

// -- Exports ------------------------------------------------------------------

export { useImportFromYouTube };
