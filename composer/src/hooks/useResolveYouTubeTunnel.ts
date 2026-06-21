import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { flushPendingSave } from "@/lib/persistence-debounce";
import { getPersistenceSettled } from "@/lib/persistence-settled";
import { useEnsureAuth } from "@/hooks/useEnsureAuth";
import { type AudioSource, useAudioStore } from "@/stores/audio";
import { useProjectStore } from "@/stores/project";
import {
  DEFAULT_COBALT_INSTANCE_ID,
  getActiveCobaltInstance,
  isUsingDefaultCobaltInstance,
  useSettingsStore,
} from "@/stores/settings";
import { useUIStore } from "@/stores/ui";
import { shouldShowBridgeCta } from "@/utils/bridge-cta";
import { CobaltApiError, formatCobaltErrorForToast, getAudio, getAudioFromStandardCobalt } from "@/utils/cobalt-api";
import {
  BridgeError,
  buildBridgeAudioFile,
  formatBridgeErrorForToast,
  getAudioFromBridge,
} from "@/utils/composer-bridge-api";

// -- Constants ----------------------------------------------------------------

const LOG_PREFIX = "[YouTubeTunnel]";
const AUDIO_MIME = "audio/ogg";
const BRIDGE_INSTANCE_ID = "__composer_bridge__";
const BRIDGE_INSTANCE_LABEL = "Composer Bridge";

interface TunnelResult {
  file: File;
  filename: string | undefined;
  title?: string;
  artist?: string;
  album?: string;
  instanceLabel: string;
  instanceId: string;
  wasDefault: boolean;
}

class TunnelError extends Error {
  readonly cause: unknown;
  readonly instanceId: string;
  readonly instanceLabel: string;
  readonly wasDefault: boolean;

  constructor(cause: unknown, instanceId: string, instanceLabel: string, wasDefault: boolean) {
    super("tunnel_failed");
    this.name = "TunnelError";
    this.cause = cause;
    this.instanceId = instanceId;
    this.instanceLabel = instanceLabel;
    this.wasDefault = wasDefault;
  }
}

// -- Helpers ------------------------------------------------------------------

function buildAudioFile(buffer: ArrayBuffer, filename: string | undefined, videoId: string): File {
  const safeName = (filename ?? videoId).replace(/[\\/:*?"<>|]/g, "").trim() || videoId;
  return new File([buffer], `${safeName}.opus`, { type: AUDIO_MIME });
}

async function fetchViaBridge(videoId: string, signal: AbortSignal): Promise<TunnelResult> {
  const baseUrl = useSettingsStore.getState().composerBridgeUrl;
  try {
    const { buffer, mimeType, title, artist, album } = await getAudioFromBridge(baseUrl, videoId, signal);
    if (signal.aborted) throw new DOMException("aborted", "AbortError");
    const filename = [artist, title].filter(Boolean).join(" - ") || title;
    return {
      file: buildBridgeAudioFile(buffer, mimeType, videoId),
      filename: filename || undefined,
      title,
      artist,
      album,
      instanceLabel: BRIDGE_INSTANCE_LABEL,
      instanceId: BRIDGE_INSTANCE_ID,
      wasDefault: false,
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new TunnelError(err, BRIDGE_INSTANCE_ID, BRIDGE_INSTANCE_LABEL, false);
  }
}

async function fetchViaCobalt(
  videoId: string,
  signal: AbortSignal,
  ensureAuth: () => Promise<string>,
): Promise<TunnelResult> {
  const instanceAtStart = getActiveCobaltInstance();
  const wasDefault = isUsingDefaultCobaltInstance();

  try {
    let tunnelUrl: string;
    let filename: string | undefined;
    if (wasDefault) {
      const jwt = await ensureAuth();
      if (signal.aborted) throw new DOMException("aborted", "AbortError");
      ({ tunnelUrl, filename } = await getAudio(videoId, jwt));
    } else {
      ({ tunnelUrl, filename } = await getAudioFromStandardCobalt(videoId));
    }
    if (signal.aborted) throw new DOMException("aborted", "AbortError");

    const res = await fetch(tunnelUrl, { signal });
    if (!res.ok) throw new CobaltApiError("cobalt_failed", res.status);
    const buffer = await res.arrayBuffer();
    if (signal.aborted) throw new DOMException("aborted", "AbortError");
    if (buffer.byteLength === 0) throw new CobaltApiError("empty_audio", res.status);

    return {
      file: buildAudioFile(buffer, filename, videoId),
      filename,
      instanceLabel: instanceAtStart.label,
      instanceId: instanceAtStart.id,
      wasDefault,
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new TunnelError(err, instanceAtStart.id, instanceAtStart.label, wasDefault);
  }
}

function fetchTunnel(videoId: string, signal: AbortSignal, ensureAuth: () => Promise<string>): Promise<TunnelResult> {
  if (useSettingsStore.getState().experiments.youtubeBridge) {
    return fetchViaBridge(videoId, signal);
  }
  return fetchViaCobalt(videoId, signal, ensureAuth);
}

// -- Hook ---------------------------------------------------------------------

function useResolveYouTubeTunnel(): void {
  const ensureAuth = useEnsureAuth();
  const ensureRef = useRef(ensureAuth);
  ensureRef.current = ensureAuth;

  const source = useAudioStore((s) => s.source);
  const previousSourceRef = useRef<AudioSource>(null);
  useEffect(() => {
    return () => {
      previousSourceRef.current = source;
    };
  }, [source]);

  const bridgeEnabled = useSettingsStore((s) => s.experiments.youtubeBridge);
  const bridgeUrl = useSettingsStore((s) => s.composerBridgeUrl);
  const videoId = source?.type === "youtube" && !source.file ? source.videoId : null;

  const query = useQuery<TunnelResult>({
    queryKey: ["youtube-tunnel", videoId, bridgeEnabled, bridgeUrl],
    enabled: videoId !== null,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
    queryFn: ({ signal }) => fetchTunnel(videoId as string, signal, () => ensureRef.current()),
  });

  useEffect(() => {
    if (!videoId) {
      useAudioStore.getState().setIsLoading(false);
      return;
    }
    useAudioStore.getState().setIsLoading(query.isFetching);
  }, [videoId, query.isFetching]);

  useEffect(() => {
    const data = query.data;
    if (!data || !videoId) return;
    let cancelled = false;
    void getPersistenceSettled().then(() => {
      if (cancelled) return;
      const current = useAudioStore.getState().source;
      if (current?.type !== "youtube" || current.videoId !== videoId) return;
      useAudioStore.getState().setYouTubeFile(data.file);
      useAudioStore.getState().setYouTubeLoadError(null);

      const project = useProjectStore.getState();
      const currentTitle = project.metadata.title;
      if (!currentTitle || currentTitle === videoId) {
        const metadataPatch: Partial<typeof project.metadata> = {
          title: data.title || data.filename || videoId,
        };
        if (data.artist) metadataPatch.artist = data.artist;
        if (data.album) metadataPatch.album = data.album;
        project.setMetadata(metadataPatch);
        flushPendingSave();
      }
      if (
        data.instanceId !== BRIDGE_INSTANCE_ID &&
        !data.wasDefault &&
        data.instanceId !== DEFAULT_COBALT_INSTANCE_ID
      ) {
        useSettingsStore.getState().recordCobaltInstanceResult(data.instanceId, "success");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [query.data, videoId]);

  useEffect(() => {
    const err = query.error;
    if (!err || !videoId) return;
    if (err instanceof DOMException && err.name === "AbortError") return;
    console.error(LOG_PREFIX, "tunnel fetch failed", err);
    const tunnelErr = err instanceof TunnelError ? err : null;
    const cause = tunnelErr?.cause ?? err;
    const instanceId = tunnelErr?.instanceId ?? getActiveCobaltInstance().id;
    const instanceLabel = tunnelErr?.instanceLabel ?? getActiveCobaltInstance().label;
    const wasDefault = tunnelErr?.wasDefault ?? isUsingDefaultCobaltInstance();
    const message =
      cause instanceof BridgeError
        ? formatBridgeErrorForToast(cause)
        : formatCobaltErrorForToast(cause, { isDefault: wasDefault, instanceLabel });
    if (shouldShowBridgeCta(cause)) {
      toast.error(message, {
        action: {
          label: "Try Bridge",
          onClick: () => useUIStore.getState().openSettings("bridge-section"),
        },
      });
    } else {
      toast.error(message);
    }
    if (instanceId !== BRIDGE_INSTANCE_ID && !wasDefault && instanceId !== DEFAULT_COBALT_INSTANCE_ID) {
      useSettingsStore.getState().recordCobaltInstanceResult(instanceId, "error", message);
    }
    const current = useAudioStore.getState().source;
    if (current?.type === "youtube" && current.videoId === videoId) {
      useAudioStore.getState().setSource(previousSourceRef.current);
    }
    useAudioStore.getState().setYouTubeLoadError(message);
  }, [query.error, videoId]);
}

// -- Exports ------------------------------------------------------------------

export { useResolveYouTubeTunnel };
