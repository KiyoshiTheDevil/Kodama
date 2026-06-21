import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LyricsSearchError } from "@/utils/lyrics-search/types";
import { lrclibProvider } from "@/utils/lyrics-search/providers/lrclib";

// -- Network gating -----------------------------------------------------------

const SKIP_NETWORK = process.env.SKIP_NETWORK_TESTS === "1";
const ONLINE_PROBE_URL = "https://lrclib.net/api/search?track_name=test";
const ONLINE_PROBE_TIMEOUT_MS = 5000;
const NETWORK_TEST_TIMEOUT_MS = 30000;

let isOnline = true;

async function probeOnline(): Promise<boolean> {
  if (SKIP_NETWORK) return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ONLINE_PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(ONLINE_PROBE_URL, { signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

const describeOnline = SKIP_NETWORK ? describe.skip : describe;

// -- Tests --------------------------------------------------------------------

describeOnline("lrclibProvider", () => {
  beforeAll(async () => {
    isOnline = await probeOnline();
    if (!isOnline) {
      console.warn("[lrclib.test] LRCLib unreachable: tests will be skipped at runtime.");
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
    it("identifies as lrclib with the LRCLib source label", () => {
      expect(lrclibProvider.name).toBe("lrclib");
      expect(lrclibProvider.sourceLabel).toBe("LRCLib");
    });
  });

  // -- canSearch -------------------------------------------------------------

  describe("canSearch", () => {
    it("returns false when track is undefined", () => {
      expect(lrclibProvider.canSearch({})).toBe(false);
    });

    it("returns false when track is an empty string", () => {
      expect(lrclibProvider.canSearch({ track: "" })).toBe(false);
    });

    it("returns false when track is whitespace only", () => {
      expect(lrclibProvider.canSearch({ track: "   \t  " })).toBe(false);
    });

    it("returns true for any non-empty track", () => {
      expect(lrclibProvider.canSearch({ track: "Bohemian Rhapsody" })).toBe(true);
    });

    it("returns true when only track is supplied (artist/album/duration optional)", () => {
      expect(lrclibProvider.canSearch({ track: "Imagine" })).toBe(true);
    });
  });

  // -- search: happy path ----------------------------------------------------

  describe("search happy paths", () => {
    it(
      "returns at least one LRCLib result for a popular track + artist",
      async () => {
        if (skipIfOffline()) return;
        const controller = new AbortController();
        const results = await lrclibProvider.search({ track: "Bohemian Rhapsody", artist: "Queen" }, controller.signal);
        expect(results.length).toBeGreaterThan(0);
        const first = results[0];
        expect(first.source).toBe("lrclib");
        expect(first.sourceLabel).toBe("LRCLib");
        expect(first.syncType).not.toBe("unsynced");
        expect(first.track.toLowerCase()).toContain("bohemian");
        expect(first.payload.kind).toBe("lrc");
      },
      NETWORK_TEST_TIMEOUT_MS,
    );

    it(
      "places the /api/get exact match first when all four fields are present",
      async () => {
        if (skipIfOffline()) return;
        const controller = new AbortController();
        const results = await lrclibProvider.search(
          {
            track: "Bohemian Rhapsody",
            artist: "Queen",
            album: "A Night at the Opera",
            durationSec: 355,
          },
          controller.signal,
        );
        expect(results.length).toBeGreaterThan(0);
        const first = results[0];
        expect(first.source).toBe("lrclib");
        expect(first.track.toLowerCase()).toContain("bohemian");
        expect(first.artist.toLowerCase()).toContain("queen");
      },
      NETWORK_TEST_TIMEOUT_MS,
    );

    it(
      "returns a stable LRCLib id prefix of 'lrclib-' on every result",
      async () => {
        if (skipIfOffline()) return;
        const controller = new AbortController();
        const results = await lrclibProvider.search({ track: "Bohemian Rhapsody", artist: "Queen" }, controller.signal);
        for (const result of results) {
          expect(result.id.startsWith("lrclib-")).toBe(true);
        }
      },
      NETWORK_TEST_TIMEOUT_MS,
    );

    it(
      "rounds duration to an integer (LRCLib returns floats)",
      async () => {
        if (skipIfOffline()) return;
        const controller = new AbortController();
        const results = await lrclibProvider.search({ track: "Bohemian Rhapsody", artist: "Queen" }, controller.signal);
        for (const result of results) {
          expect(Number.isInteger(result.durationSec)).toBe(true);
        }
      },
      NETWORK_TEST_TIMEOUT_MS,
    );
  });

  // -- search: dedupe between /get and /search -------------------------------

  describe("dedupe between /api/get and /api/search", () => {
    it(
      "returns each LRCLib id at most once when /get + /search overlap",
      async () => {
        if (skipIfOffline()) return;
        const controller = new AbortController();
        const results = await lrclibProvider.search(
          {
            track: "Bohemian Rhapsody",
            artist: "Queen",
            album: "A Night at the Opera",
            durationSec: 355,
          },
          controller.signal,
        );
        const ids = results.map((r) => r.id);
        const uniqueIds = new Set(ids);
        expect(ids.length).toBe(uniqueIds.size);
      },
      NETWORK_TEST_TIMEOUT_MS,
    );
  });

  // -- search: empty result --------------------------------------------------

  describe("empty / no-result handling", () => {
    it(
      "returns an empty array for nonsense queries",
      async () => {
        if (skipIfOffline()) return;
        const controller = new AbortController();
        const results = await lrclibProvider.search(
          { track: "asdkfjhasdkjfhasdkfjh", artist: "qwertyuiopzxcvbn" },
          controller.signal,
        );
        expect(results).toEqual([]);
      },
      NETWORK_TEST_TIMEOUT_MS,
    );

    it(
      "does not throw on 404 from /api/get when no exact match exists",
      async () => {
        if (skipIfOffline()) return;
        const controller = new AbortController();
        const results = await lrclibProvider.search(
          {
            track: "asdkfjhasdkjfhasdkfjh",
            artist: "qwertyuiopzxcvbn",
            album: "nonexistent-album-xyz",
            durationSec: 100,
          },
          controller.signal,
        );
        expect(Array.isArray(results)).toBe(true);
      },
      NETWORK_TEST_TIMEOUT_MS,
    );
  });

  // -- search: plain-only sync-type ------------------------------------------

  describe("plain-only LRC sync-type mapping", () => {
    it(
      "maps results without syncedLyrics to syncType 'unsynced'",
      async () => {
        if (skipIfOffline()) return;
        const controller = new AbortController();
        const results = await lrclibProvider.search(
          {
            track: "Bohemian Rhapsody",
            artist: "Queen",
            album: "Bohemian Rhapsody (The Original Soundtrack)",
          },
          controller.signal,
        );
        for (const result of results) {
          const payload = result.payload;
          if (payload.kind !== "lrc") continue;
          if (payload.synced === null && payload.plain !== null) {
            expect(result.syncType).toBe("unsynced");
          }
        }
      },
      NETWORK_TEST_TIMEOUT_MS,
    );
  });

  // -- search: abort handling ------------------------------------------------

  describe("abort handling", () => {
    it("resolves to [] when called with a pre-aborted signal", async () => {
      const controller = new AbortController();
      controller.abort();
      const results = await lrclibProvider.search({ track: "Bohemian Rhapsody", artist: "Queen" }, controller.signal);
      expect(results).toEqual([]);
    });

    it(
      "resolves to [] when the signal aborts mid-fetch",
      async () => {
        if (skipIfOffline()) return;
        const controller = new AbortController();
        const pending = lrclibProvider.search({ track: "Bohemian Rhapsody", artist: "Queen" }, controller.signal);
        controller.abort();
        const results = await pending;
        expect(results).toEqual([]);
      },
      NETWORK_TEST_TIMEOUT_MS,
    );
  });

  // -- search: track-only query ----------------------------------------------

  describe("track-only query", () => {
    it(
      "still returns results when only track is supplied",
      async () => {
        if (skipIfOffline()) return;
        const controller = new AbortController();
        const results = await lrclibProvider.search({ track: "Bohemian Rhapsody" }, controller.signal);
        expect(results.length).toBeGreaterThan(0);
      },
      NETWORK_TEST_TIMEOUT_MS,
    );
  });

  // -- search: ISRC ignored gracefully ---------------------------------------

  describe("ISRC handling", () => {
    it(
      "accepts an isrc on the query but silently ignores it",
      async () => {
        if (skipIfOffline()) return;
        const controller = new AbortController();
        const results = await lrclibProvider.search(
          {
            track: "Bohemian Rhapsody",
            artist: "Queen",
            isrc: "GBUM71029604",
          },
          controller.signal,
        );
        expect(results.length).toBeGreaterThan(0);
        expect(results[0].source).toBe("lrclib");
      },
      NETWORK_TEST_TIMEOUT_MS,
    );
  });

  // -- LyricsSearchError export contract -------------------------------------

  describe("LyricsSearchError contract", () => {
    it("constructs a LyricsSearchError with provider 'lrclib'", () => {
      const error = new LyricsSearchError("lrclib", "boom");
      expect(error.provider).toBe("lrclib");
      expect(error.message).toBe("boom");
      expect(error.name).toBe("LyricsSearchError");
    });
  });
});
