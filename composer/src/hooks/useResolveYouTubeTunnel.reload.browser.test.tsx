import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useBridgeThumb } from "@/hooks/useBridgeThumb";
import { usePersistence } from "@/hooks/usePersistence";
import { useResolveYouTubeTunnel } from "@/hooks/useResolveYouTubeTunnel";
import { __resetPersistenceSettledForTests, getPersistenceSettled } from "@/lib/persistence-settled";
import { useProjectStore } from "@/stores/project";
import { useSettingsStore } from "@/stores/settings";
import { seedAudioFile, seedProject } from "@/test/idb";
import { render } from "@/test/render";
import { DEFAULT_BRIDGE_URL } from "@/utils/composer-bridge-api";

// -- Constants ----------------------------------------------------------------

const SAVED_FILE_BYTES = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]);
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// -- Fake bridge --------------------------------------------------------------

interface BridgeAudioResponse {
  buffer: ArrayBuffer;
  mimeType?: string;
  titlePercentEncoded?: string;
  artistPercentEncoded?: string;
  albumPercentEncoded?: string;
}

interface FakeBridge {
  audio: Map<string, BridgeAudioResponse>;
  thumb: Map<string, ArrayBuffer>;
  audioCalls: string[];
  thumbCalls: string[];
}

let bridge: FakeBridge;

function asBytes(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer;
}

// -- Test host ----------------------------------------------------------------

function withQueryClient(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: Number.POSITIVE_INFINITY },
    },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function ReloadHost() {
  usePersistence();
  useResolveYouTubeTunnel();
  useBridgeThumb();
  return null;
}

// -- Helpers ------------------------------------------------------------------

async function waitFor(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error(`waitFor timed out after ${timeoutMs}ms`);
}

// -- Setup --------------------------------------------------------------------

beforeEach(() => {
  bridge = {
    audio: new Map(),
    thumb: new Map(),
    audioCalls: [],
    thumbCalls: [],
  };

  vi.stubGlobal("fetch", async (input: RequestInfo | URL, _init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;

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
      const bytes = bridge.thumb.get(videoId);
      if (!bytes) return new Response(null, { status: 404 });
      return new Response(bytes, { headers: { "content-type": "image/png" } });
    }

    return new Response(null, { status: 404 });
  });

  useSettingsStore.setState({
    experiments: { youtubeBridge: true },
    composerBridgeUrl: DEFAULT_BRIDGE_URL,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// -- Reload survival ----------------------------------------------------------

describe("post-reload survival", () => {
  it("keeps the persisted title, artist, album, and thumbnail after the tunnel + thumb queries resolve", async () => {
    __resetPersistenceSettledForTests();

    await seedAudioFile({
      name: "dQw4w9WgXcQ.opus",
      type: "audio/ogg",
      data: SAVED_FILE_BYTES.slice().buffer,
    });
    await seedProject({
      version: 1,
      savedAt: Date.now(),
      metadata: {
        title: "Never Gonna Give You Up",
        artist: "Rick Astley",
        album: "Whenever You Need Somebody",
        duration: 213,
      },
      lines: [],
      agents: [{ id: "v1", type: "person", name: "Lead" }],
      granularity: "word",
      audioSource: { kind: "youtube", videoId: "dQw4w9WgXcQ" },
    });

    bridge.audio.set("dQw4w9WgXcQ", {
      buffer: asBytes("opus"),
      mimeType: "audio/opus",
      titlePercentEncoded: encodeURIComponent("Never Gonna Give You Up"),
      artistPercentEncoded: encodeURIComponent("Rick Astley"),
      albumPercentEncoded: encodeURIComponent("Whenever You Need Somebody"),
    });
    bridge.thumb.set("dQw4w9WgXcQ", PNG_BYTES.slice().buffer);

    await render(withQueryClient(<ReloadHost />));

    await getPersistenceSettled();

    await waitFor(() => useProjectStore.getState().metadata.thumbnailForVideoId === "dQw4w9WgXcQ");

    const md = useProjectStore.getState().metadata;
    expect(md.title).toBe("Never Gonna Give You Up");
    expect(md.artist).toBe("Rick Astley");
    expect(md.album).toBe("Whenever You Need Somebody");
    expect(md.thumbnailDataUrl).toMatch(/^data:image\/png/);
    expect(md.thumbnailForVideoId).toBe("dQw4w9WgXcQ");
  });

  it("does not regress the title to the videoId when the bridge returns no metadata", async () => {
    __resetPersistenceSettledForTests();

    await seedProject({
      version: 1,
      savedAt: Date.now(),
      metadata: { title: "User Edited Title", artist: "", album: "", duration: 0 },
      lines: [],
      agents: [{ id: "v1", type: "person", name: "Lead" }],
      granularity: "word",
      audioSource: { kind: "youtube", videoId: "noMeta1234" },
    });

    bridge.audio.set("noMeta1234", { buffer: asBytes("opus"), mimeType: "audio/opus" });

    const seenTitles: string[] = [useProjectStore.getState().metadata.title];
    const unsubscribe = useProjectStore.subscribe((state, prev) => {
      if (state.metadata.title !== prev.metadata.title) {
        seenTitles.push(state.metadata.title);
      }
    });

    try {
      await render(withQueryClient(<ReloadHost />));
      await waitFor(() => bridge.audioCalls.includes("noMeta1234"));
      await getPersistenceSettled();
      await new Promise((r) => setTimeout(r, 50));

      expect(useProjectStore.getState().metadata.title).toBe("User Edited Title");
      expect(seenTitles).not.toContain("noMeta1234");
    } finally {
      unsubscribe();
    }
  });
});
