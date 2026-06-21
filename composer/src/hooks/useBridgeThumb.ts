import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { getPersistenceSettled } from "@/lib/persistence-settled";
import { useAudioStore } from "@/stores/audio";
import { useProjectStore } from "@/stores/project";
import { useSettingsStore } from "@/stores/settings";
import { getThumbFromBridge } from "@/utils/composer-bridge-api";

// -- Constants ----------------------------------------------------------------

const QUERY_KEY = "composer-bridge-thumb";

// -- Hook ---------------------------------------------------------------------

function useBridgeThumb(): UseQueryResult<string | null, Error> {
  const source = useAudioStore((s) => s.source);
  const bridgeEnabled = useSettingsStore((s) => s.experiments.youtubeBridge);
  const bridgeUrl = useSettingsStore((s) => s.composerBridgeUrl);
  const persistedThumb = useProjectStore((s) => s.metadata.thumbnailDataUrl);
  const persistedFor = useProjectStore((s) => s.metadata.thumbnailForVideoId);
  const videoId = source?.type === "youtube" ? source.videoId : null;
  // Refetch once the audio file lands: the bridge extracts the thumb at the
  // tail end of the yt-dlp run, so an early fetch (kicked off when the source
  // is first set) often races with the extraction and 404s. Flipping the
  // queryKey when the file is ready forces a second attempt that finds the
  // thumb in place.
  const audioReady = source?.type === "youtube" && source.file !== undefined;
  const hasMatchingPersistedThumb = Boolean(persistedThumb && videoId && persistedFor === videoId);

  const query = useQuery<string | null>({
    queryKey: [QUERY_KEY, videoId, bridgeUrl, audioReady],
    enabled: bridgeEnabled && videoId !== null && !hasMatchingPersistedThumb,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    retry: false,
    queryFn: async ({ signal }) => {
      const thumb = await getThumbFromBridge(bridgeUrl, videoId as string, signal);
      return thumb ?? null;
    },
  });

  useEffect(() => {
    const thumb = query.data;
    if (!thumb || !videoId) return;
    let cancelled = false;
    void getPersistenceSettled().then(() => {
      if (cancelled) return;
      const current = useAudioStore.getState().source;
      if (current?.type !== "youtube" || current.videoId !== videoId) return;
      useProjectStore.getState().setMetadata({
        thumbnailDataUrl: thumb,
        thumbnailForVideoId: videoId,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [query.data, videoId]);

  return query;
}

// -- Exports ------------------------------------------------------------------

export { useBridgeThumb };
