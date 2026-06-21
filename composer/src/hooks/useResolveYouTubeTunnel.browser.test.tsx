import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePersistence } from "@/hooks/usePersistence";
import { useResolveYouTubeTunnel } from "@/hooks/useResolveYouTubeTunnel";
import {
  __resetPersistenceSettledForTests,
  getPersistenceSettled,
  markPersistenceSettled,
} from "@/lib/persistence-settled";
import { useAudioStore } from "@/stores/audio";
import { useProjectStore } from "@/stores/project";
import { useSettingsStore } from "@/stores/settings";
import { seedProject } from "@/test/idb";
import { render } from "@/test/render";
import { DEFAULT_BRIDGE_URL } from "@/utils/composer-bridge-api";

// -- Test host ----------------------------------------------------------------

function HookHost() {
  useResolveYouTubeTunnel();
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

interface BridgeAudioResponse {
  buffer: ArrayBuffer;
  mimeType?: string;
  titlePercentEncoded?: string;
  artistPercentEncoded?: string;
  albumPercentEncoded?: string;
}

type ThumbBehavior =
  | { kind: "ok"; bytes: ArrayBuffer }
  | { kind: "404" }
  | { kind: "deferred"; promise: Promise<ArrayBuffer> };

interface FakeBridge {
  audio: Map<string, BridgeAudioResponse>;
  thumb: Map<string, ThumbBehavior>;
  audioCalls: string[];
  thumbCalls: string[];
}

let bridge: FakeBridge;

function asBytes(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer;
}

beforeEach(() => {
  bridge = {
    audio: new Map(),
    thumb: new Map(),
    audioCalls: [],
    thumbCalls: [],
  };

  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const signal = init?.signal;

    const healthMatch = url.match(/\/health$/);
    if (healthMatch) {
      return new Response(JSON.stringify({ bridge: "0.1.0", ytdlp: "2025.06.30", status: "ok" }), {
        headers: { "content-type": "application/json" },
      });
    }

    const audioMatch = url.match(/\/audio\/([A-Za-z0-9_-]+)$/);
    if (audioMatch) {
      const videoId = audioMatch[1];
      bridge.audioCalls.push(videoId);
      const entry = bridge.audio.get(videoId);
      if (!entry) return new Response(null, { status: 502 });
      const headers = new Headers();
      headers.set("content-type", entry.mimeType ?? "audio/opus");
      if (entry.titlePercentEncoded) headers.set("x-track-title", entry.titlePercentEncoded);
      if (entry.artistPercentEncoded) headers.set("x-track-artist", entry.artistPercentEncoded);
      if (entry.albumPercentEncoded) headers.set("x-track-album", entry.albumPercentEncoded);
      return new Response(entry.buffer, { headers });
    }

    const thumbMatch = url.match(/\/thumb\/([A-Za-z0-9_-]+)$/);
    if (thumbMatch) {
      const videoId = thumbMatch[1];
      bridge.thumbCalls.push(videoId);
      const entry = bridge.thumb.get(videoId);
      if (!entry || entry.kind === "404") return new Response(null, { status: 404 });
      if (entry.kind === "deferred") {
        return new Promise<Response>((resolve, reject) => {
          entry.promise.then(
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
      return new Response(entry.bytes, { headers: { "content-type": "image/png" } });
    }

    return new Response(null, { status: 404 });
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

beforeEach(() => {
  markPersistenceSettled();
});

// -- Helpers ------------------------------------------------------------------

function enableBridgeAndSelectVideo(videoId: string) {
  useSettingsStore.setState({
    experiments: { youtubeBridge: true },
    composerBridgeUrl: DEFAULT_BRIDGE_URL,
  });
  useAudioStore.getState().setYouTubeSource(videoId);
}

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}

// -- Bridge happy path --------------------------------------------------------

describe("useResolveYouTubeTunnel — bridge happy path", () => {
  it("writes the file from the bridge audio response into the audio store", async () => {
    bridge.audio.set("dQw4w9WgXcQ", {
      buffer: asBytes("opus-bytes"),
      mimeType: "audio/opus",
      titlePercentEncoded: encodeURIComponent("Never Gonna Give You Up"),
      artistPercentEncoded: encodeURIComponent("Rick Astley"),
      albumPercentEncoded: encodeURIComponent("Whenever You Need Somebody"),
    });

    enableBridgeAndSelectVideo("dQw4w9WgXcQ");
    await render(withQueryClient(<HookHost />));

    await waitFor(
      () =>
        useAudioStore.getState().source?.type === "youtube" &&
        (useAudioStore.getState().source as { file?: File }).file !== undefined,
    );
    const file = (useAudioStore.getState().source as { type: "youtube"; file: File }).file;
    expect(file.name).toBe("dQw4w9WgXcQ.opus");
    expect(file.type).toBe("audio/opus");
  });

  it("sets project metadata title/artist/album from the bridge response", async () => {
    bridge.audio.set("dQw4w9WgXcQ", {
      buffer: asBytes("opus"),
      mimeType: "audio/opus",
      titlePercentEncoded: encodeURIComponent("Never Gonna Give You Up"),
      artistPercentEncoded: encodeURIComponent("Rick Astley"),
      albumPercentEncoded: encodeURIComponent("Whenever You Need Somebody"),
    });

    enableBridgeAndSelectVideo("dQw4w9WgXcQ");
    await render(withQueryClient(<HookHost />));

    await waitFor(() => useProjectStore.getState().metadata.artist === "Rick Astley");
    const md = useProjectStore.getState().metadata;
    expect(md.title).toBe("Rick Astley - Never Gonna Give You Up");
    expect(md.artist).toBe("Rick Astley");
    expect(md.album).toBe("Whenever You Need Somebody");
  });

  it("decodes percent-encoded UTF-8 metadata headers (the fullwidth-comma regression)", async () => {
    bridge.audio.set("dQw4w9WgXcQ", {
      buffer: asBytes("opus"),
      mimeType: "audio/opus",
      artistPercentEncoded: encodeURIComponent("Tyler, The Creator"),
      // The user's original bug: 0xEF 0xBC 0x8C is fullwidth comma.
      titlePercentEncoded: "RUNNING%20OUT%20OF%20TIME",
    });
    enableBridgeAndSelectVideo("dQw4w9WgXcQ");
    await render(withQueryClient(<HookHost />));

    await waitFor(() => useProjectStore.getState().metadata.artist === "Tyler, The Creator");
    expect(useProjectStore.getState().metadata.title).toContain("RUNNING OUT OF TIME");
  });
});

// -- Fallback paths -----------------------------------------------------------

describe("useResolveYouTubeTunnel — title fallback", () => {
  it("falls back to videoId as the title when the bridge returns no metadata at all", async () => {
    bridge.audio.set("dQw4w9WgXcQ", { buffer: asBytes("opus"), mimeType: "audio/opus" });

    enableBridgeAndSelectVideo("dQw4w9WgXcQ");
    await render(withQueryClient(<HookHost />));

    await waitFor(() => useProjectStore.getState().metadata.title === "dQw4w9WgXcQ");
    expect(useProjectStore.getState().metadata.title).toBe("dQw4w9WgXcQ");
  });

  it("does not overwrite a user-set title that differs from the videoId", async () => {
    bridge.audio.set("dQw4w9WgXcQ", {
      buffer: asBytes("opus"),
      mimeType: "audio/opus",
      titlePercentEncoded: encodeURIComponent("Bridge Title"),
      artistPercentEncoded: encodeURIComponent("Bridge Artist"),
    });

    useProjectStore.getState().setMetadata({ title: "My Custom Title" });
    enableBridgeAndSelectVideo("dQw4w9WgXcQ");
    await render(withQueryClient(<HookHost />));

    // The hook still runs; wait for the audio download to complete.
    await waitFor(() => bridge.audioCalls.includes("dQw4w9WgXcQ"));
    // Give the data effect a tick to potentially run.
    await new Promise((r) => setTimeout(r, 50));
    expect(useProjectStore.getState().metadata.title).toBe("My Custom Title");
  });
});

// -- mimeType / file format ---------------------------------------------------

describe("useResolveYouTubeTunnel — file format", () => {
  it("labels the File with the actual bridge mime (regression for the .m4a-hardcode)", async () => {
    bridge.audio.set("dQw4w9WgXcQ", { buffer: asBytes("opus"), mimeType: "audio/opus" });
    enableBridgeAndSelectVideo("dQw4w9WgXcQ");
    await render(withQueryClient(<HookHost />));

    await waitFor(() => Boolean((useAudioStore.getState().source as { file?: File }).file));
    const file = (useAudioStore.getState().source as { file: File }).file;
    expect(file.name).toBe("dQw4w9WgXcQ.opus");
    expect(file.type).toBe("audio/opus");
  });

  it("uses .webm extension when the bridge falls back to a plain webm container", async () => {
    bridge.audio.set("dQw4w9WgXcQ", { buffer: asBytes("webm"), mimeType: "audio/webm" });
    enableBridgeAndSelectVideo("dQw4w9WgXcQ");
    await render(withQueryClient(<HookHost />));

    await waitFor(() => Boolean((useAudioStore.getState().source as { file?: File }).file));
    const file = (useAudioStore.getState().source as { file: File }).file;
    expect(file.name).toBe("dQw4w9WgXcQ.webm");
  });

  it("uses .m4a extension only when the bridge actually returns audio/mp4", async () => {
    bridge.audio.set("dQw4w9WgXcQ", { buffer: asBytes("m4a"), mimeType: "audio/mp4" });
    enableBridgeAndSelectVideo("dQw4w9WgXcQ");
    await render(withQueryClient(<HookHost />));

    await waitFor(() => Boolean((useAudioStore.getState().source as { file?: File }).file));
    const file = (useAudioStore.getState().source as { file: File }).file;
    expect(file.name).toBe("dQw4w9WgXcQ.m4a");
    expect(file.type).toBe("audio/mp4");
  });
});

// -- Reload race --------------------------------------------------------------

describe("useResolveYouTubeTunnel: reload race", () => {
  function RaceHost() {
    usePersistence();
    useResolveYouTubeTunnel();
    return null;
  }

  it("preserves the persisted title against the videoId fallback when the tunnel resolves before persistence", async () => {
    __resetPersistenceSettledForTests();

    await seedProject({
      version: 1,
      savedAt: Date.now(),
      metadata: { title: "Never Gonna Give You Up", artist: "Rick Astley", album: "", duration: 0 },
      lines: [],
      agents: [{ id: "v1", type: "person", name: "Lead" }],
      granularity: "word",
      audioSource: { kind: "youtube", videoId: "dQw4w9WgXcQ" },
    });

    bridge.audio.set("dQw4w9WgXcQ", { buffer: asBytes("opus-bytes") });
    enableBridgeAndSelectVideo("dQw4w9WgXcQ");

    const seenTitles: string[] = [useProjectStore.getState().metadata.title];
    const unsubscribe = useProjectStore.subscribe((state, prev) => {
      if (state.metadata.title !== prev.metadata.title) {
        seenTitles.push(state.metadata.title);
      }
    });

    try {
      await render(withQueryClient(<RaceHost />));

      await waitFor(() => bridge.audioCalls.includes("dQw4w9WgXcQ"));
      await getPersistenceSettled();
      await new Promise((r) => setTimeout(r, 50));

      expect(useProjectStore.getState().metadata.title).toBe("Never Gonna Give You Up");
      expect(useProjectStore.getState().metadata.artist).toBe("Rick Astley");
      expect(seenTitles).not.toContain("dQw4w9WgXcQ");
    } finally {
      unsubscribe();
    }
  });
});

// -- Thumbnail ownership ------------------------------------------------------

describe("useResolveYouTubeTunnel: thumbnail ownership", () => {
  it("does not fetch or write the thumbnail when bridge audio resolves (delegated to useBridgeThumb)", async () => {
    bridge.audio.set("dQw4w9WgXcQ", {
      buffer: asBytes("opus-bytes"),
      mimeType: "audio/opus",
    });
    bridge.thumb.set("dQw4w9WgXcQ", { kind: "ok", bytes: asBytes("thumb-bytes") });

    enableBridgeAndSelectVideo("dQw4w9WgXcQ");
    await render(withQueryClient(<HookHost />));

    await waitFor(() => bridge.audioCalls.includes("dQw4w9WgXcQ"));
    await new Promise((r) => setTimeout(r, 50));
    expect(bridge.thumbCalls).not.toContain("dQw4w9WgXcQ");
    expect(useProjectStore.getState().metadata.thumbnailDataUrl).toBeUndefined();
  });
});
