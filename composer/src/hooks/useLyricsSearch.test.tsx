import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, act, createElement, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { LyricsSearchResult, ProviderName } from "@/domain/lyrics-search/result";
import { useLyricsSearch, type UseLyricsSearchOptions, type UseLyricsSearchResult } from "@/hooks/useLyricsSearch";
import {
  registerProviderForTests,
  restoreProvidersForTests,
  snapshotProvidersForTests,
} from "@/utils/lyrics-search/registry";
import { LyricsSearchError, type LyricsSearchProvider, type LyricsSearchQuery } from "@/utils/lyrics-search/types";

// -- IS_REACT_ACT_ENVIRONMENT -----------------------------------------------

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// -- Fixture provider ---------------------------------------------------------

interface FakeProviderOptions {
  name: ProviderName;
  results?: LyricsSearchResult[];
  delayMs?: number;
  throwError?: LyricsSearchError;
  canSearch?: (query: LyricsSearchQuery) => boolean;
}

interface FakeProviderHandle {
  provider: LyricsSearchProvider;
  unregister: () => void;
  calls: Array<{ query: LyricsSearchQuery; signal: AbortSignal }>;
  signalAtSettle: AbortSignal[];
}

function fakeProviderFactory(options: FakeProviderOptions): FakeProviderHandle {
  const calls: Array<{ query: LyricsSearchQuery; signal: AbortSignal }> = [];
  const signalAtSettle: AbortSignal[] = [];
  const provider: LyricsSearchProvider = {
    name: options.name,
    sourceLabel: `Label-${options.name}`,
    canSearch: options.canSearch ?? (() => true),
    search: (query, signal) => {
      calls.push({ query, signal });
      const work = new Promise<LyricsSearchResult[]>((resolve, reject) => {
        const settle = () => {
          signalAtSettle.push(signal);
          if (options.throwError) {
            reject(options.throwError);
          } else {
            resolve(options.results ?? []);
          }
        };
        if (options.delayMs && options.delayMs > 0) {
          setTimeout(settle, options.delayMs);
        } else {
          queueMicrotask(settle);
        }
      });
      return work;
    },
  };
  const unregister = registerProviderForTests(provider);
  return { provider, unregister, calls, signalAtSettle };
}

function makeResult(id: string, source: ProviderName, track = "Track"): LyricsSearchResult {
  return {
    id,
    source,
    sourceLabel: `Label-${source}`,
    syncType: "line",
    track,
    artist: "Artist",
    durationSec: 180,
    payload: { kind: "lrc", synced: "[00:01.00]hi", plain: null },
  };
}

// -- Hook harness -------------------------------------------------------------

interface HookHarness<T> {
  result: { current: T | null };
  rerender: (props: HookProps) => Promise<void>;
  unmount: () => Promise<void>;
}

interface HookProps {
  query: LyricsSearchQuery;
  options?: UseLyricsSearchOptions;
}

function createHarness(initial: HookProps): HookHarness<UseLyricsSearchResult> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: Number.POSITIVE_INFINITY },
    },
  });
  let root!: Root;
  const result: { current: UseLyricsSearchResult | null } = { current: null };

  function HookHost({ query, options }: HookProps): ReactNode {
    const value = useLyricsSearch(query, options);
    useEffect(() => {
      result.current = value;
    });
    result.current = value;
    return null;
  }

  function tree(props: HookProps): ReactNode {
    return createElement(QueryClientProvider, { client }, createElement(HookHost, props));
  }

  act(() => {
    root = createRoot(container);
    root.render(tree(initial));
  });

  return {
    result,
    rerender: async (props) => {
      await act(async () => {
        root.render(tree(props));
      });
    },
    unmount: async () => {
      await act(async () => {
        root.unmount();
      });
      client.clear();
      if (container.parentNode) container.parentNode.removeChild(container);
    },
  };
}

async function advanceMicrotasks(rounds = 4): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

async function waitUntil(predicate: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeoutMs) throw new Error("waitUntil: timeout");
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
  }
}

// -- Lifecycle ----------------------------------------------------------------

const cleanups: Array<() => void> = [];
let originalSnapshot: readonly LyricsSearchProvider[] = [];

beforeEach(() => {
  cleanups.length = 0;
  originalSnapshot = snapshotProvidersForTests();
  restoreProvidersForTests([]);
});

afterEach(() => {
  for (const fn of cleanups) {
    try {
      fn();
    } catch (err) {
      console.warn("[Composer] cleanup error", err);
    }
  }
  restoreProvidersForTests(originalSnapshot);
});

function track(handle: FakeProviderHandle): FakeProviderHandle {
  cleanups.push(handle.unregister);
  return handle;
}

// -- Tests --------------------------------------------------------------------

describe("useLyricsSearch", () => {
  it("returns empty results and does not call any provider when the query is empty", async () => {
    const fake = track(fakeProviderFactory({ name: "lrclib", results: [makeResult("lrclib-1", "lrclib")] }));
    const h = createHarness({ query: {} });
    await advanceMicrotasks();

    expect(h.result.current?.results).toEqual([]);
    expect(h.result.current?.isFetching).toBe(false);
    expect(h.result.current?.errors.size).toBe(0);
    expect(fake.calls.length).toBe(0);

    await h.unmount();
  });

  it("returns results from a single provider on a non-empty query", async () => {
    const fake = track(
      fakeProviderFactory({
        name: "lrclib",
        results: [makeResult("lrclib-1", "lrclib", "A"), makeResult("lrclib-2", "lrclib", "B")],
      }),
    );
    const h = createHarness({ query: { track: "hi" }, options: { debounceMs: 0 } });
    await waitUntil(() => (h.result.current?.results.length ?? 0) === 2);

    expect(h.result.current?.results.map((r) => r.id)).toEqual(["lrclib-1", "lrclib-2"]);
    expect(h.result.current?.isFetching).toBe(false);
    expect(h.result.current?.errors.size).toBe(0);
    expect(fake.calls.length).toBe(1);

    await h.unmount();
  });

  it("merges results from multiple providers in registry order and runs them in parallel", async () => {
    const a = track(
      fakeProviderFactory({
        name: "lrclib",
        results: [makeResult("lrclib-1", "lrclib"), makeResult("lrclib-2", "lrclib")],
        delayMs: 30,
      }),
    );
    const b = track(
      fakeProviderFactory({
        name: "binimum",
        results: [makeResult("binimum-1", "binimum"), makeResult("binimum-2", "binimum")],
        delayMs: 30,
      }),
    );
    const start = Date.now();
    const h = createHarness({ query: { track: "hi" }, options: { debounceMs: 0 } });
    await waitUntil(() => (h.result.current?.results.length ?? 0) === 4);
    const elapsed = Date.now() - start;

    expect(h.result.current?.results.map((r) => r.id)).toEqual(["lrclib-1", "lrclib-2", "binimum-1", "binimum-2"]);
    expect(elapsed).toBeLessThan(120);
    expect(a.calls.length).toBe(1);
    expect(b.calls.length).toBe(1);

    await h.unmount();
  });

  it("dedupes across providers by id, keeping the first occurrence", async () => {
    track(
      fakeProviderFactory({
        name: "lrclib",
        results: [makeResult("lrclib-1", "lrclib", "First"), makeResult("lrclib-2", "lrclib", "B")],
      }),
    );
    track(
      fakeProviderFactory({
        name: "binimum",
        results: [makeResult("lrclib-1", "binimum", "Duplicate"), makeResult("binimum-3", "binimum")],
      }),
    );
    const h = createHarness({ query: { track: "hi" }, options: { debounceMs: 0 } });
    await waitUntil(() => (h.result.current?.results.length ?? 0) === 3);

    const results = h.result.current?.results ?? [];
    expect(results.map((r) => r.id)).toEqual(["lrclib-1", "lrclib-2", "binimum-3"]);
    const first = results.find((r) => r.id === "lrclib-1");
    expect(first?.track).toBe("First");
    expect(first?.source).toBe("lrclib");

    await h.unmount();
  });

  it("surfaces a per-provider error in the errors map and still returns other providers' results", async () => {
    track(fakeProviderFactory({ name: "lrclib", results: [makeResult("lrclib-1", "lrclib")] }));
    const errorInstance = new LyricsSearchError("binimum", "boom");
    track(fakeProviderFactory({ name: "binimum", throwError: errorInstance }));

    const h = createHarness({ query: { track: "hi" }, options: { debounceMs: 0 } });
    await waitUntil(() => (h.result.current?.errors.size ?? 0) > 0);

    expect(h.result.current?.results.map((r) => r.id)).toEqual(["lrclib-1"]);
    const err = h.result.current?.errors.get("binimum");
    expect(err).toBeInstanceOf(LyricsSearchError);
    expect(err?.provider).toBe("binimum");
    expect(err?.message).toBe("boom");

    await h.unmount();
  });

  it("does not fire any queries when options.enabled is false", async () => {
    const fake = track(fakeProviderFactory({ name: "lrclib", results: [makeResult("lrclib-1", "lrclib")] }));
    const h = createHarness({ query: { track: "hi" }, options: { enabled: false, debounceMs: 0 } });
    await advanceMicrotasks();

    expect(fake.calls.length).toBe(0);
    expect(h.result.current?.results).toEqual([]);
    expect(h.result.current?.isFetching).toBe(false);

    await h.unmount();
  });

  it("does not call search on a provider whose canSearch returns false for the current query", async () => {
    const skipping = track(
      fakeProviderFactory({
        name: "binimum",
        canSearch: () => false,
        results: [makeResult("binimum-1", "binimum")],
      }),
    );
    const accepting = track(
      fakeProviderFactory({
        name: "lrclib",
        canSearch: () => true,
        results: [makeResult("lrclib-1", "lrclib")],
      }),
    );
    const h = createHarness({ query: { track: "hi" }, options: { debounceMs: 0 } });
    await waitUntil(() => (h.result.current?.results.length ?? 0) === 1);

    expect(skipping.calls.length).toBe(0);
    expect(accepting.calls.length).toBe(1);
    expect(h.result.current?.results.map((r) => r.id)).toEqual(["lrclib-1"]);

    await h.unmount();
  });

  it("debounces rapid query changes so only the final query fires", async () => {
    const fake = track(fakeProviderFactory({ name: "lrclib", results: [makeResult("lrclib-final", "lrclib")] }));

    const h = createHarness({ query: {}, options: { debounceMs: 50 } });
    await advanceMicrotasks();
    expect(fake.calls.length).toBe(0);

    await h.rerender({ query: { track: "a" }, options: { debounceMs: 50 } });
    await h.rerender({ query: { track: "ab" }, options: { debounceMs: 50 } });
    await h.rerender({ query: { track: "abc" }, options: { debounceMs: 50 } });
    await h.rerender({ query: { track: "abcd" }, options: { debounceMs: 50 } });

    await advanceMicrotasks();
    expect(fake.calls.length).toBe(0);

    await waitUntil(() => fake.calls.length >= 1, 1000);
    expect(fake.calls.length).toBe(1);
    expect(fake.calls[0]?.query.track).toBe("abcd");

    await h.unmount();
  });

  it("aborts the in-flight request when the query changes mid-fetch", async () => {
    const fake = track(
      fakeProviderFactory({ name: "lrclib", results: [makeResult("lrclib-x", "lrclib")], delayMs: 100 }),
    );
    const h = createHarness({ query: { track: "first" }, options: { debounceMs: 0 } });
    await waitUntil(() => fake.calls.length >= 1, 1000);
    const firstSignal = fake.calls[0]?.signal;
    expect(firstSignal?.aborted).toBe(false);

    await h.rerender({ query: { track: "second" }, options: { debounceMs: 0 } });
    await waitUntil(() => firstSignal?.aborted === true, 1000);
    expect(firstSignal?.aborted).toBe(true);

    await waitUntil(() => fake.calls.length >= 2, 2000);
    expect(fake.calls[1]?.query.track).toBe("second");

    await h.unmount();
  });

  it("aborts pending requests on unmount and does not log errors", async () => {
    const fake = track(
      fakeProviderFactory({ name: "lrclib", results: [makeResult("lrclib-1", "lrclib")], delayMs: 200 }),
    );
    const errors: unknown[] = [];
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      errors.push(args);
    };

    const h = createHarness({ query: { track: "hi" }, options: { debounceMs: 0 } });
    await waitUntil(() => fake.calls.length >= 1, 1000);
    const inflightSignal = fake.calls[0]?.signal;
    expect(inflightSignal?.aborted).toBe(false);

    await h.unmount();
    await waitUntil(() => inflightSignal?.aborted === true, 1000);
    expect(inflightSignal?.aborted).toBe(true);

    console.error = originalError;
    expect(errors).toEqual([]);
  });

  it("reports isFetching true while at least one provider's query is in-flight", async () => {
    track(fakeProviderFactory({ name: "lrclib", results: [makeResult("lrclib-1", "lrclib")], delayMs: 80 }));
    const h = createHarness({ query: { track: "hi" }, options: { debounceMs: 0 } });
    await waitUntil(() => h.result.current?.isFetching === true, 1000);

    expect(h.result.current?.isFetching).toBe(true);
    expect(h.result.current?.results).toEqual([]);

    await waitUntil(() => h.result.current?.isFetching === false, 2000);
    expect(h.result.current?.results.length).toBe(1);

    await h.unmount();
  });

  it("treats videoId-only queries as non-empty (does not gate on track)", async () => {
    const fake = track(fakeProviderFactory({ name: "binimum", results: [makeResult("binimum-1", "binimum")] }));
    const h = createHarness({ query: { videoId: "fJ9rUzIMcZQ" }, options: { debounceMs: 0 } });
    await waitUntil(() => fake.calls.length >= 1, 1000);

    expect(fake.calls[0]?.query.videoId).toBe("fJ9rUzIMcZQ");
    await waitUntil(() => (h.result.current?.results.length ?? 0) === 1);

    await h.unmount();
  });

  it("treats isrc-only queries as non-empty", async () => {
    const fake = track(fakeProviderFactory({ name: "lrclib", results: [makeResult("lrclib-1", "lrclib")] }));
    const h = createHarness({ query: { isrc: "USQX91200002" }, options: { debounceMs: 0 } });
    await waitUntil(() => fake.calls.length >= 1, 1000);

    expect(fake.calls[0]?.query.isrc).toBe("USQX91200002");

    await h.unmount();
  });

  it("treats an artist-only or duration-only query as empty (still requires track/videoId/isrc)", async () => {
    const fake = track(fakeProviderFactory({ name: "lrclib", results: [makeResult("lrclib-1", "lrclib")] }));
    const h = createHarness({ query: { artist: "Queen", durationSec: 355 }, options: { debounceMs: 0 } });
    await advanceMicrotasks();

    expect(fake.calls.length).toBe(0);
    expect(h.result.current?.results).toEqual([]);
    expect(h.result.current?.isFetching).toBe(false);

    await h.unmount();
  });
});

// -- Sort order ---------------------------------------------------------------

function makeResultFull(
  id: string,
  source: ProviderName,
  syncType: LyricsSearchResult["syncType"],
  durationSec: number,
): LyricsSearchResult {
  return {
    id,
    source,
    sourceLabel: `Label-${source}`,
    syncType,
    track: id,
    artist: "Artist",
    durationSec,
    payload: { kind: "lrc", synced: "[00:01.00]hi", plain: null },
  };
}

describe("useLyricsSearch sort order", () => {
  it("sorts by sync precision first (syllable < word < line < unsynced)", async () => {
    track(
      fakeProviderFactory({
        name: "lrclib",
        results: [
          makeResultFull("unsynced", "lrclib", "unsynced", 200),
          makeResultFull("line", "lrclib", "line", 200),
          makeResultFull("syllable", "lrclib", "syllable", 200),
          makeResultFull("word", "lrclib", "word", 200),
        ],
      }),
    );
    const h = createHarness({ query: { track: "hi" }, options: { debounceMs: 0 } });
    await waitUntil(() => (h.result.current?.results.length ?? 0) === 4);

    expect(h.result.current?.results.map((r) => r.id)).toEqual(["syllable", "word", "line", "unsynced"]);

    await h.unmount();
  });

  it("within the same sync-type bucket, sorts by |durationSec - expectedDurationSec|", async () => {
    track(
      fakeProviderFactory({
        name: "lrclib",
        results: [
          makeResultFull("far", "lrclib", "line", 400),
          makeResultFull("five-above", "lrclib", "line", 360),
          makeResultFull("exact", "lrclib", "line", 355),
          makeResultFull("two-below", "lrclib", "line", 353),
        ],
      }),
    );
    const h = createHarness({
      query: { track: "hi" },
      options: { debounceMs: 0, expectedDurationSec: 355 },
    });
    await waitUntil(() => (h.result.current?.results.length ?? 0) === 4);

    expect(h.result.current?.results.map((r) => r.id)).toEqual(["exact", "two-below", "five-above", "far"]);

    await h.unmount();
  });

  it("falls back to natural order within a bucket when expectedDurationSec is undefined", async () => {
    track(
      fakeProviderFactory({
        name: "lrclib",
        results: [
          makeResultFull("a", "lrclib", "line", 400),
          makeResultFull("b", "lrclib", "line", 200),
          makeResultFull("c", "lrclib", "line", 100),
        ],
      }),
    );
    const h = createHarness({ query: { track: "hi" }, options: { debounceMs: 0 } });
    await waitUntil(() => (h.result.current?.results.length ?? 0) === 3);

    expect(h.result.current?.results.map((r) => r.id)).toEqual(["a", "b", "c"]);

    await h.unmount();
  });

  it("falls back to natural order when expectedDurationSec is not finite", async () => {
    track(
      fakeProviderFactory({
        name: "lrclib",
        results: [makeResultFull("a", "lrclib", "line", 400), makeResultFull("b", "lrclib", "line", 200)],
      }),
    );
    const h = createHarness({
      query: { track: "hi" },
      options: { debounceMs: 0, expectedDurationSec: Number.NaN },
    });
    await waitUntil(() => (h.result.current?.results.length ?? 0) === 2);

    expect(h.result.current?.results.map((r) => r.id)).toEqual(["a", "b"]);

    await h.unmount();
  });

  it("orders across buckets by precision even when a worse-precision result has a closer duration", async () => {
    track(
      fakeProviderFactory({
        name: "lrclib",
        results: [
          makeResultFull("line-exact", "lrclib", "line", 355),
          makeResultFull("syllable-far", "lrclib", "syllable", 200),
        ],
      }),
    );
    const h = createHarness({
      query: { track: "hi" },
      options: { debounceMs: 0, expectedDurationSec: 355 },
    });
    await waitUntil(() => (h.result.current?.results.length ?? 0) === 2);

    expect(h.result.current?.results.map((r) => r.id)).toEqual(["syllable-far", "line-exact"]);

    await h.unmount();
  });
});

// -- Cache lifetime -----------------------------------------------------------

interface SharedClientHarness<T> extends HookHarness<T> {
  mount: (props: HookProps) => Promise<void>;
}

function createSharedClientHarness(): SharedClientHarness<UseLyricsSearchResult> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Number.POSITIVE_INFINITY },
    },
  });
  let root: Root | null = null;
  const result: { current: UseLyricsSearchResult | null } = { current: null };

  function HookHost({ query, options }: HookProps): ReactNode {
    const value = useLyricsSearch(query, options);
    useEffect(() => {
      result.current = value;
    });
    result.current = value;
    return null;
  }

  function tree(props: HookProps): ReactNode {
    return createElement(QueryClientProvider, { client }, createElement(HookHost, props));
  }

  return {
    result,
    mount: async (props) => {
      await act(async () => {
        root = createRoot(container);
        root.render(tree(props));
      });
    },
    rerender: async (props) => {
      if (!root) throw new Error("not mounted");
      await act(async () => {
        root!.render(tree(props));
      });
    },
    unmount: async () => {
      if (!root) return;
      await act(async () => {
        root!.unmount();
      });
      root = null;
    },
  };
}

describe("useLyricsSearch cache lifetime", () => {
  it("reuses cached results across unmount/remount within the gcTime window (no second provider call)", async () => {
    const fake = track(
      fakeProviderFactory({
        name: "lrclib",
        results: [makeResult("lrclib-cache-1", "lrclib")],
      }),
    );
    const h = createSharedClientHarness();
    await h.mount({ query: { track: "Bohemian" }, options: { debounceMs: 0 } });
    await waitUntil(() => (h.result.current?.results.length ?? 0) === 1);
    expect(fake.calls.length).toBe(1);

    await h.unmount();
    await advanceMicrotasks();

    await h.mount({ query: { track: "Bohemian" }, options: { debounceMs: 0 } });
    await advanceMicrotasks();
    expect(h.result.current?.results.map((r) => r.id)).toEqual(["lrclib-cache-1"]);
    expect(fake.calls.length).toBe(1);

    await h.unmount();
  });

  it("does not reuse a cached entry for a different query (cache key includes the query)", async () => {
    const fake = track(
      fakeProviderFactory({
        name: "lrclib",
        results: [makeResult("lrclib-cache-2", "lrclib")],
      }),
    );
    const h = createSharedClientHarness();
    await h.mount({ query: { track: "Bohemian" }, options: { debounceMs: 0 } });
    await waitUntil(() => fake.calls.length === 1);

    await h.rerender({ query: { track: "Stairway" }, options: { debounceMs: 0 } });
    await waitUntil(() => fake.calls.length === 2);
    expect(fake.calls[0]?.query.track).toBe("Bohemian");
    expect(fake.calls[1]?.query.track).toBe("Stairway");

    await h.unmount();
  });
});
