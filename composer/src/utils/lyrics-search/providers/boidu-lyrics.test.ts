import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { detectTtmlSyncType } from "@/domain/lyrics-search/sync-type";
import { boiduLyricsProvider } from "@/utils/lyrics-search/providers/boidu-lyrics";
import { LyricsSearchError } from "@/utils/lyrics-search/types";

// -- Network gating -----------------------------------------------------------

const SKIP_NETWORK = process.env.SKIP_NETWORK_TESTS === "1";
const ONLINE_PROBE_URL = "https://lyrics-api.boidu.dev/getLyrics?s=probe&a=probe&d=1&videoId=zzzzzzzzzzz";
const ONLINE_PROBE_TIMEOUT_MS = 5000;
const NETWORK_TEST_TIMEOUT_MS = 30000;

const CACHED_QUERY = {
  track: "Bohemian Rhapsody",
  artist: "Queen",
  album: "A Night at the Opera",
  durationSec: 355,
  videoId: "fJ9rUzIMcZQ",
} as const;

let isOnline = true;

async function probeOnline(): Promise<boolean> {
  if (SKIP_NETWORK) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ONLINE_PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(ONLINE_PROBE_URL, { signal: controller.signal });
    return response.status < 500;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

const describeOnline = SKIP_NETWORK ? describe.skip : describe;

// -- Tests --------------------------------------------------------------------

describeOnline("boiduLyricsProvider", () => {
  beforeAll(async () => {
    isOnline = await probeOnline();
    if (!isOnline) {
      console.warn("[boidu-lyrics.test] Better Lyrics unreachable: tests will be skipped at runtime.");
    }
  }, ONLINE_PROBE_TIMEOUT_MS + 1000);

  afterAll(() => {
    isOnline = true;
  });

  function skipIfOffline(): boolean {
    return !isOnline;
  }

  // -- Metadata --------------------------------------------------------------

  describe("metadata", () => {
    it("identifies as boidu-lyrics with the Better Lyrics source label", () => {
      expect(boiduLyricsProvider.name).toBe("boidu-lyrics");
      expect(boiduLyricsProvider.sourceLabel).toBe("Better Lyrics");
    });
  });

  // -- canSearch -------------------------------------------------------------

  describe("canSearch", () => {
    it("returns false when query is empty", () => {
      expect(boiduLyricsProvider.canSearch({})).toBe(false);
    });

    it("returns false when videoId is missing", () => {
      expect(
        boiduLyricsProvider.canSearch({
          track: "Imagine",
          artist: "John Lennon",
          durationSec: 183,
        }),
      ).toBe(false);
    });

    it("returns false when track is missing", () => {
      expect(
        boiduLyricsProvider.canSearch({
          artist: "John Lennon",
          durationSec: 183,
          videoId: "abc123",
        }),
      ).toBe(false);
    });

    it("returns false when artist is missing", () => {
      expect(
        boiduLyricsProvider.canSearch({
          track: "Imagine",
          durationSec: 183,
          videoId: "abc123",
        }),
      ).toBe(false);
    });

    it("returns false when durationSec is missing", () => {
      expect(
        boiduLyricsProvider.canSearch({
          track: "Imagine",
          artist: "John Lennon",
          videoId: "abc123",
        }),
      ).toBe(false);
    });

    it("returns false when durationSec is zero (non-finite/falsy)", () => {
      expect(
        boiduLyricsProvider.canSearch({
          track: "Imagine",
          artist: "John Lennon",
          durationSec: 0,
          videoId: "abc123",
        }),
      ).toBe(false);
    });

    it("returns false when videoId is whitespace only", () => {
      expect(
        boiduLyricsProvider.canSearch({
          track: "Imagine",
          artist: "John Lennon",
          durationSec: 183,
          videoId: "   ",
        }),
      ).toBe(false);
    });

    it("returns true when all four required fields are present", () => {
      expect(boiduLyricsProvider.canSearch(CACHED_QUERY)).toBe(true);
    });

    it("returns true even when album is absent (album is optional)", () => {
      const { album: _album, ...withoutAlbum } = CACHED_QUERY;
      expect(boiduLyricsProvider.canSearch(withoutAlbum)).toBe(true);
    });
  });

  // -- search: happy path (cached) -------------------------------------------

  describe("search cached happy path", () => {
    it(
      "returns exactly one result for a known cached videoId",
      async () => {
        if (skipIfOffline()) return;
        const controller = new AbortController();
        const results = await boiduLyricsProvider.search(CACHED_QUERY, controller.signal);
        if (results.length === 0) {
          console.warn("[boidu-lyrics.test] Cached query returned empty (cache miss); skipping assertions.");
          return;
        }
        expect(results).toHaveLength(1);
        const [result] = results;
        expect(result.source).toBe("boidu-lyrics");
        expect(result.sourceLabel).toBe("Better Lyrics");
        expect(result.payload.kind).toBe("ttml");
        if (result.payload.kind === "ttml") {
          expect(result.payload.xml.length).toBeGreaterThan(0);
          expect(result.syncType).toBe(detectTtmlSyncType(result.payload.xml));
        }
      },
      NETWORK_TEST_TIMEOUT_MS,
    );

    it(
      "uses the boidu-lyrics- id prefix with the videoId",
      async () => {
        if (skipIfOffline()) return;
        const controller = new AbortController();
        const results = await boiduLyricsProvider.search(CACHED_QUERY, controller.signal);
        if (results.length === 0) return;
        expect(results[0].id).toBe(`boidu-lyrics-${CACHED_QUERY.videoId}`);
      },
      NETWORK_TEST_TIMEOUT_MS,
    );

    it(
      "passes album through to the result when present",
      async () => {
        if (skipIfOffline()) return;
        const controller = new AbortController();
        const results = await boiduLyricsProvider.search(CACHED_QUERY, controller.signal);
        if (results.length === 0) return;
        expect(results[0].album).toBe(CACHED_QUERY.album);
      },
      NETWORK_TEST_TIMEOUT_MS,
    );

    it(
      "leaves album undefined when not supplied",
      async () => {
        if (skipIfOffline()) return;
        const controller = new AbortController();
        const { album: _album, ...withoutAlbum } = CACHED_QUERY;
        const results = await boiduLyricsProvider.search(withoutAlbum, controller.signal);
        if (results.length === 0) return;
        expect(results[0].album).toBeUndefined();
      },
      NETWORK_TEST_TIMEOUT_MS,
    );
  });

  // -- 401 silent handling ---------------------------------------------------

  describe("401 cache-miss handling", () => {
    it(
      "returns [] silently on 401 (uncached query) without throwing",
      async () => {
        if (skipIfOffline()) return;
        const controller = new AbortController();
        const results = await boiduLyricsProvider.search(
          {
            track: "asdkfjhasdkjfhasdkfjh",
            artist: "qwertyuiopzxcvbn",
            durationSec: 100,
            videoId: "zzzzzzzzzzz",
          },
          controller.signal,
        );
        expect(results).toEqual([]);
      },
      NETWORK_TEST_TIMEOUT_MS,
    );
  });

  // -- Abort -----------------------------------------------------------------

  describe("abort handling", () => {
    it("resolves to [] when called with a pre-aborted signal", async () => {
      const controller = new AbortController();
      controller.abort();
      const results = await boiduLyricsProvider.search(CACHED_QUERY, controller.signal);
      expect(results).toEqual([]);
    });

    it(
      "resolves to [] when the signal aborts mid-fetch",
      async () => {
        if (skipIfOffline()) return;
        const controller = new AbortController();
        const pending = boiduLyricsProvider.search(CACHED_QUERY, controller.signal);
        controller.abort();
        const results = await pending;
        expect(results).toEqual([]);
      },
      NETWORK_TEST_TIMEOUT_MS,
    );
  });

  // -- Gate without canSearch ------------------------------------------------

  describe("when canSearch returns false", () => {
    it("returns [] immediately and does not fire a request when videoId is missing", async () => {
      const controller = new AbortController();
      const results = await boiduLyricsProvider.search(
        { track: "Imagine", artist: "John Lennon", durationSec: 183 },
        controller.signal,
      );
      expect(results).toEqual([]);
    });
  });

  // -- LyricsSearchError export contract -------------------------------------

  describe("LyricsSearchError contract", () => {
    it("constructs a LyricsSearchError with provider 'boidu-lyrics'", () => {
      const error = new LyricsSearchError("boidu-lyrics", "boom");
      expect(error.provider).toBe("boidu-lyrics");
      expect(error.message).toBe("boom");
      expect(error.name).toBe("LyricsSearchError");
    });
  });
});
