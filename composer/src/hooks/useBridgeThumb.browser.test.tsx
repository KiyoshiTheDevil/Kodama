import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBridgeThumb } from "@/hooks/useBridgeThumb";
import { __resetPersistenceSettledForTests, markPersistenceSettled } from "@/lib/persistence-settled";
import { useAudioStore } from "@/stores/audio";
import { useProjectStore } from "@/stores/project";
import { useSettingsStore } from "@/stores/settings";
import { render } from "@/test/render";

// -- Test host ----------------------------------------------------------------

function HookHost() {
  useBridgeThumb();
  return null;
}

function withQueryClient(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: Number.POSITIVE_INFINITY },
    },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

// -- Fake bridge --------------------------------------------------------------

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

interface ThumbConfig {
  kind: "ok" | "404" | "deferred";
  bytes?: Uint8Array;
  promise?: Promise<Uint8Array>;
}

const thumbResponses = new Map<string, ThumbConfig>();
let thumbCalls: string[] = [];

beforeEach(() => {
  thumbResponses.clear();
  thumbCalls = [];

  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const thumbMatch = url.match(/\/thumb\/([A-Za-z0-9_-]+)$/);
    if (!thumbMatch) return new Response(null, { status: 404 });
    const videoId = thumbMatch[1];
    thumbCalls.push(videoId);
    const cfg = thumbResponses.get(videoId);
    if (!cfg || cfg.kind === "404") return new Response(null, { status: 404 });
    if (cfg.kind === "deferred") {
      const signal = init?.signal;
      return new Promise<Response>((resolve, reject) => {
        cfg.promise!.then(
          (bytes) => resolve(new Response(bytes, { headers: { "content-type": "image/png" } })),
          (err) => reject(err),
        );
        if (signal) {
          const onAbort = () => reject(new DOMException("aborted", "AbortError"));
          if (signal.aborted) onAbort();
          else signal.addEventListener("abort", onAbort, { once: true });
        }
      });
    }
    return new Response(cfg.bytes!, { headers: { "content-type": "image/png" } });
  });

  markPersistenceSettled();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// -- Helpers ------------------------------------------------------------------

function enableBridge() {
  useSettingsStore.setState({
    experiments: { youtubeBridge: true },
    composerBridgeUrl: "http://localhost:7777",
  });
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}

// -- Happy path ---------------------------------------------------------------

describe("useBridgeThumb: happy path", () => {
  it("fetches the thumb for the active videoId and writes it to the store tagged with that videoId", async () => {
    enableBridge();
    thumbResponses.set("abc123", { kind: "ok", bytes: PNG_BYTES });
    useAudioStore.getState().setYouTubeSource("abc123");

    await render(withQueryClient(<HookHost />));

    await waitFor(() => Boolean(useProjectStore.getState().metadata.thumbnailDataUrl));
    const m = useProjectStore.getState().metadata;
    expect(m.thumbnailDataUrl).toMatch(/^data:image\/png/);
    expect(m.thumbnailForVideoId).toBe("abc123");
  });

  it("refetches once the audio file lands so a stale 404 during yt-dlp extraction does not stick", async () => {
    enableBridge();
    // First attempt: bridge has not extracted the thumb yet, returns 404.
    thumbResponses.set("late-id", { kind: "404" });
    useAudioStore.getState().setYouTubeSource("late-id");

    await render(withQueryClient(<HookHost />));
    await waitFor(() => thumbCalls.filter((id) => id === "late-id").length === 1);

    // Store is untouched: no thumb to write.
    await new Promise((r) => setTimeout(r, 30));
    expect(useProjectStore.getState().metadata.thumbnailDataUrl).toBeUndefined();

    // Bridge finishes extracting the thumb; audio file lands in the store.
    thumbResponses.set("late-id", { kind: "ok", bytes: PNG_BYTES });
    const file = new File([new Uint8Array(8)], "late-id.opus", { type: "audio/opus" });
    useAudioStore.setState({ source: { type: "youtube", videoId: "late-id", file } });

    await waitFor(() => Boolean(useProjectStore.getState().metadata.thumbnailDataUrl));
    const m = useProjectStore.getState().metadata;
    expect(m.thumbnailDataUrl).toMatch(/^data:image\/png/);
    expect(m.thumbnailForVideoId).toBe("late-id");
    expect(thumbCalls.filter((id) => id === "late-id").length).toBe(2);
  });
});

// -- Persistence gate ---------------------------------------------------------

describe("useBridgeThumb: persistence gate", () => {
  it("does not write the thumb until persistence has settled", async () => {
    __resetPersistenceSettledForTests();
    enableBridge();
    thumbResponses.set("abc123", { kind: "ok", bytes: PNG_BYTES });
    useProjectStore.getState().setMetadata({
      thumbnailDataUrl: "data:image/png;base64,OLD",
      thumbnailForVideoId: "old-id",
    });
    useAudioStore.getState().setYouTubeSource("abc123");

    await render(withQueryClient(<HookHost />));

    await waitFor(() => thumbCalls.includes("abc123"));
    await new Promise((r) => setTimeout(r, 50));
    expect(useProjectStore.getState().metadata.thumbnailDataUrl).toBe("data:image/png;base64,OLD");
    expect(useProjectStore.getState().metadata.thumbnailForVideoId).toBe("old-id");

    markPersistenceSettled();
    await waitFor(() => useProjectStore.getState().metadata.thumbnailForVideoId === "abc123");
    expect(useProjectStore.getState().metadata.thumbnailDataUrl).toMatch(/^data:image\/png/);
  });
});

// -- Disabled states ----------------------------------------------------------

describe("useBridgeThumb: disabled states", () => {
  it("does not fetch when the bridge experiment is disabled", async () => {
    useSettingsStore.setState({
      experiments: { youtubeBridge: false },
      composerBridgeUrl: "http://localhost:7777",
    });
    useAudioStore.getState().setYouTubeSource("abc123");
    await render(withQueryClient(<HookHost />));
    await new Promise((r) => setTimeout(r, 30));
    expect(thumbCalls).not.toContain("abc123");
  });

  it("does not fetch when the source is not a youtube source", async () => {
    enableBridge();
    useAudioStore.getState().setSource(null);
    await render(withQueryClient(<HookHost />));
    await new Promise((r) => setTimeout(r, 30));
    expect(thumbCalls.length).toBe(0);
  });
});

// -- VideoId churn ------------------------------------------------------------

describe("useBridgeThumb: videoId churn", () => {
  it("overwrites the persisted thumb when the videoId changes and a new thumb resolves", async () => {
    enableBridge();
    thumbResponses.set("first-id", { kind: "ok", bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xaa]) });
    thumbResponses.set("second-id", { kind: "ok", bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0xbb]) });
    useAudioStore.getState().setYouTubeSource("first-id");

    await render(withQueryClient(<HookHost />));
    await waitFor(() => useProjectStore.getState().metadata.thumbnailForVideoId === "first-id");
    const firstThumb = useProjectStore.getState().metadata.thumbnailDataUrl;

    useAudioStore.getState().setYouTubeSource("second-id");
    await waitFor(() => useProjectStore.getState().metadata.thumbnailForVideoId === "second-id");
    expect(useProjectStore.getState().metadata.thumbnailDataUrl).not.toBe(firstThumb);
  });

  it("discards a late-arriving thumb that resolves after the user switched videoId", async () => {
    enableBridge();
    let resolveSlow!: (b: Uint8Array) => void;
    const slow = new Promise<Uint8Array>((r) => {
      resolveSlow = r;
    });
    thumbResponses.set("slow-id", { kind: "deferred", promise: slow });
    thumbResponses.set("fast-id", { kind: "ok", bytes: PNG_BYTES });

    useAudioStore.getState().setYouTubeSource("slow-id");
    await render(withQueryClient(<HookHost />));
    await waitFor(() => thumbCalls.includes("slow-id"));

    useAudioStore.getState().setYouTubeSource("fast-id");
    await waitFor(() => useProjectStore.getState().metadata.thumbnailForVideoId === "fast-id");
    const fastThumb = useProjectStore.getState().metadata.thumbnailDataUrl;

    resolveSlow(new Uint8Array([0xff, 0xff, 0xff, 0xff]));
    await new Promise((r) => setTimeout(r, 50));
    expect(useProjectStore.getState().metadata.thumbnailForVideoId).toBe("fast-id");
    expect(useProjectStore.getState().metadata.thumbnailDataUrl).toBe(fastThumb);
  });
});

// -- Error states -------------------------------------------------------------

describe("useBridgeThumb: error states", () => {
  it("silently no-ops on a 404 thumb and does not clobber persisted state", async () => {
    enableBridge();
    thumbResponses.set("no-thumb", { kind: "404" });
    useProjectStore.getState().setMetadata({
      thumbnailDataUrl: "data:image/png;base64,OLD",
      thumbnailForVideoId: "old-id",
    });
    useAudioStore.getState().setYouTubeSource("no-thumb");

    await render(withQueryClient(<HookHost />));
    await waitFor(() => thumbCalls.includes("no-thumb"));
    await new Promise((r) => setTimeout(r, 50));

    expect(useProjectStore.getState().metadata.thumbnailDataUrl).toBe("data:image/png;base64,OLD");
    expect(useProjectStore.getState().metadata.thumbnailForVideoId).toBe("old-id");
  });
});
