import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import type { LyricsSearchResult, ProviderName } from "@/domain/lyrics-search/result";
import { render } from "@/test/render";
import {
  registerProviderForTests,
  restoreProvidersForTests,
  snapshotProvidersForTests,
} from "@/utils/lyrics-search/registry";
import { LyricsSearchError, type LyricsSearchProvider, type LyricsSearchQuery } from "@/utils/lyrics-search/types";
import { SearchSection } from "@/views/lyrics-import-modal/search-section";

// -- Fixture provider plumbing ------------------------------------------------

interface PendingResolver {
  resolve: (value: LyricsSearchResult[]) => void;
  reject: (reason: unknown) => void;
  query: LyricsSearchQuery;
  signal: AbortSignal;
}

interface FixtureProvider extends LyricsSearchProvider {
  pending: PendingResolver[];
  unregister: () => void;
}

function makeFixtureProvider(name: ProviderName = "lrclib"): FixtureProvider {
  const pending: PendingResolver[] = [];
  const provider: LyricsSearchProvider = {
    name,
    sourceLabel: name === "lrclib" ? "LRCLib" : "Fixture",
    canSearch: () => true,
    search(query, signal) {
      return new Promise<LyricsSearchResult[]>((resolve, reject) => {
        const entry: PendingResolver = { resolve, reject, query, signal };
        pending.push(entry);
        signal.addEventListener("abort", () => {
          resolve([]);
        });
      });
    },
  };
  return { ...provider, pending, unregister: () => {} };
}

function buildResult(overrides: Partial<LyricsSearchResult> = {}): LyricsSearchResult {
  return {
    id: `r-${Math.random().toString(36).slice(2)}`,
    source: "lrclib",
    sourceLabel: "LRCLib",
    syncType: "line",
    track: "Bohemian Rhapsody",
    artist: "Queen",
    album: "A Night at the Opera",
    durationSec: 355,
    payload: { kind: "lrc", synced: "[00:00.00] hi", plain: null },
    ...overrides,
  };
}

let providerSnapshot: readonly LyricsSearchProvider[] = [];
let currentProvider: FixtureProvider | null = null;

beforeEach(() => {
  providerSnapshot = snapshotProvidersForTests();
  restoreProvidersForTests([]);
  currentProvider = makeFixtureProvider();
  registerProviderForTests(currentProvider);
});

afterEach(() => {
  for (const entry of currentProvider?.pending ?? []) entry.resolve([]);
  restoreProvidersForTests(providerSnapshot);
  currentProvider = null;
});

// -- Wrapper ------------------------------------------------------------------

function withQueryClient(children: React.ReactNode): React.ReactElement {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: Number.POSITIVE_INFINITY } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const noop = () => {};

// -- Initial render -----------------------------------------------------------

describe("SearchSection initial render", () => {
  it("renders the four labeled inputs and the Video ID input", async () => {
    const screen = await render(
      withQueryClient(
        <SearchSection initialPrefill={null} onSelect={noop} onSwitchToPaste={noop} onSwitchToUpload={noop} />,
      ),
    );
    await expect.element(screen.getByLabelText("Track")).toBeInTheDocument();
    await expect.element(screen.getByLabelText("Artist")).toBeInTheDocument();
    await expect.element(screen.getByLabelText("Album")).toBeInTheDocument();
    await expect.element(screen.getByLabelText("Duration")).toBeInTheDocument();
    await expect.element(screen.getByLabelText("Video ID")).toBeInTheDocument();
  });

  it("populates inputs from initial prefill", async () => {
    const screen = await render(
      withQueryClient(
        <SearchSection
          initialPrefill={{
            track: "Bohemian Rhapsody",
            artist: "Queen",
            album: "A Night at the Opera",
            durationSec: 355,
            videoId: "fJ9rUzIMcZQ",
            isrc: "GBUM71029604",
          }}
          onSelect={noop}
          onSwitchToPaste={noop}
          onSwitchToUpload={noop}
        />,
      ),
    );
    const track = screen.getByLabelText("Track").element() as HTMLInputElement;
    const artist = screen.getByLabelText("Artist").element() as HTMLInputElement;
    const album = screen.getByLabelText("Album").element() as HTMLInputElement;
    const duration = screen.getByLabelText("Duration").element() as HTMLInputElement;
    const videoId = screen.getByLabelText("Video ID").element() as HTMLInputElement;
    expect(track.value).toBe("Bohemian Rhapsody");
    expect(artist.value).toBe("Queen");
    expect(album.value).toBe("A Night at the Opera");
    expect(duration.value).toBe("5:55");
    expect(videoId.value).toBe("fJ9rUzIMcZQ");
  });

  it("renders the empty-state hint when no query has been typed", async () => {
    const screen = await render(
      withQueryClient(
        <SearchSection initialPrefill={null} onSelect={noop} onSwitchToPaste={noop} onSwitchToUpload={noop} />,
      ),
    );
    await expect.element(screen.getByText("Type a track or paste a video ID")).toBeInTheDocument();
  });
});

// -- Search lifecycle ---------------------------------------------------------

describe("SearchSection search lifecycle", () => {
  it("renders skeleton rows while the provider is pending", async () => {
    await render(
      withQueryClient(
        <SearchSection
          initialPrefill={{ track: "Bohemian" }}
          onSelect={noop}
          onSwitchToPaste={noop}
          onSwitchToUpload={noop}
        />,
      ),
    );
    await expect.poll(() => document.querySelectorAll('[data-testid="result-skeleton"]').length).toBeGreaterThan(0);
  });

  it("renders one ResultRow per provider result", async () => {
    const screen = await render(
      withQueryClient(
        <SearchSection
          initialPrefill={{ track: "Bohemian" }}
          onSelect={noop}
          onSwitchToPaste={noop}
          onSwitchToUpload={noop}
        />,
      ),
    );
    await expect.poll(() => currentProvider?.pending.length ?? 0).toBeGreaterThan(0);
    const entry = currentProvider!.pending[currentProvider!.pending.length - 1];
    entry.resolve([buildResult({ id: "r1", track: "Title 1" }), buildResult({ id: "r2", track: "Title 2" })]);
    await expect.element(screen.getByText("Title 1")).toBeInTheDocument();
    await expect.element(screen.getByText("Title 2")).toBeInTheDocument();
  });

  it("renders an inline error when the provider rejects", async () => {
    const screen = await render(
      withQueryClient(
        <SearchSection
          initialPrefill={{ track: "Bohemian" }}
          onSelect={noop}
          onSwitchToPaste={noop}
          onSwitchToUpload={noop}
        />,
      ),
    );
    await expect.poll(() => currentProvider?.pending.length ?? 0).toBeGreaterThan(0);
    const entry = currentProvider!.pending[currentProvider!.pending.length - 1];
    entry.reject(new LyricsSearchError("lrclib", "Provider blew up"));
    await expect.element(screen.getByText(/LRCLib/)).toBeInTheDocument();
    await expect.element(screen.getByText(/Provider blew up/)).toBeInTheDocument();
  });

  it("shows a no-matches state when the provider resolves empty for a typed query", async () => {
    const screen = await render(
      withQueryClient(
        <SearchSection
          initialPrefill={{ track: "xkcdnonexistent" }}
          onSelect={noop}
          onSwitchToPaste={noop}
          onSwitchToUpload={noop}
        />,
      ),
    );
    await expect.poll(() => currentProvider?.pending.length ?? 0).toBeGreaterThan(0);
    const entry = currentProvider!.pending[currentProvider!.pending.length - 1];
    entry.resolve([]);
    await expect.element(screen.getByText("No matches")).toBeInTheDocument();
    expect(screen.getByText("Type a track or paste a video ID").elements().length).toBe(0);
  });

  it("aborts the in-flight search when the track input is cleared", async () => {
    const screen = await render(
      withQueryClient(
        <SearchSection
          initialPrefill={{ track: "Bohemian" }}
          onSelect={noop}
          onSwitchToPaste={noop}
          onSwitchToUpload={noop}
        />,
      ),
    );
    await expect.poll(() => currentProvider?.pending.length ?? 0).toBeGreaterThan(0);
    const trackInput = screen.getByLabelText("Track").element() as HTMLInputElement;
    trackInput.focus();
    await userEvent.clear(trackInput);
    await expect.poll(() => screen.getByText("Type a track or paste a video ID").elements().length).toBeGreaterThan(0);
  });
});

// -- Keyboard navigation ------------------------------------------------------

describe("SearchSection keyboard navigation", () => {
  it("moves focus between rows on ArrowDown / ArrowUp and selects on Enter", async () => {
    const selected: LyricsSearchResult[] = [];
    const screen = await render(
      withQueryClient(
        <SearchSection
          initialPrefill={{ track: "Bohemian" }}
          onSelect={(r) => selected.push(r)}
          onSwitchToPaste={noop}
          onSwitchToUpload={noop}
        />,
      ),
    );
    await expect.poll(() => currentProvider?.pending.length ?? 0).toBeGreaterThan(0);
    const entry = currentProvider!.pending[currentProvider!.pending.length - 1];
    const r1 = buildResult({ id: "r1", track: "Track 1" });
    const r2 = buildResult({ id: "r2", track: "Track 2" });
    entry.resolve([r1, r2]);
    await expect.element(screen.getByText("Track 1")).toBeInTheDocument();
    const trackInput = screen.getByLabelText("Track").element() as HTMLInputElement;
    trackInput.focus();
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{Enter}");
    expect(selected.length).toBe(1);
    expect(selected[0].id).toBe("r2");
  });

  it("returns focus to the track input on Escape", async () => {
    const screen = await render(
      withQueryClient(
        <SearchSection
          initialPrefill={{ track: "Bohemian" }}
          onSelect={noop}
          onSwitchToPaste={noop}
          onSwitchToUpload={noop}
        />,
      ),
    );
    await expect.poll(() => currentProvider?.pending.length ?? 0).toBeGreaterThan(0);
    const entry = currentProvider!.pending[currentProvider!.pending.length - 1];
    entry.resolve([buildResult({ id: "r1", track: "Track 1" })]);
    await expect.element(screen.getByText("Track 1")).toBeInTheDocument();
    const trackInput = screen.getByLabelText("Track").element() as HTMLInputElement;
    trackInput.focus();
    await userEvent.keyboard("{ArrowDown}");
    await userEvent.keyboard("{Escape}");
    await expect.poll(() => document.activeElement).toBe(trackInput);
  });
});

// -- Footer affordances -------------------------------------------------------

describe("SearchSection footer", () => {
  it("calls onSwitchToPaste when the Paste button is clicked", async () => {
    let pasteCalls = 0;
    const screen = await render(
      withQueryClient(
        <SearchSection
          initialPrefill={null}
          onSelect={noop}
          onSwitchToPaste={() => pasteCalls++}
          onSwitchToUpload={noop}
        />,
      ),
    );
    await screen.getByRole("button", { name: /paste/i }).click();
    expect(pasteCalls).toBe(1);
  });

  it("calls onSwitchToUpload when the Upload button is clicked", async () => {
    let uploadCalls = 0;
    const screen = await render(
      withQueryClient(
        <SearchSection
          initialPrefill={null}
          onSelect={noop}
          onSwitchToPaste={noop}
          onSwitchToUpload={() => uploadCalls++}
        />,
      ),
    );
    await screen.getByRole("button", { name: /upload/i }).click();
    expect(uploadCalls).toBe(1);
  });
});

// -- Duration round-trip ------------------------------------------------------

describe("SearchSection duration handling", () => {
  it("accepts and displays the mm:ss form", async () => {
    const screen = await render(
      withQueryClient(
        <SearchSection initialPrefill={null} onSelect={noop} onSwitchToPaste={noop} onSwitchToUpload={noop} />,
      ),
    );
    const duration = screen.getByLabelText("Duration").element() as HTMLInputElement;
    duration.focus();
    await userEvent.type(duration, "5:55");
    duration.blur();
    expect(duration.value).toBe("5:55");
    const track = screen.getByLabelText("Track").element() as HTMLInputElement;
    track.focus();
    await userEvent.type(track, "Bohemian");
    await expect.poll(() => currentProvider?.pending.length ?? 0).toBeGreaterThan(0);
    const entry = currentProvider!.pending[currentProvider!.pending.length - 1];
    expect(entry.query.durationSec).toBe(355);
  });

  it("normalizes integer-seconds input to mm:ss on blur", async () => {
    const screen = await render(
      withQueryClient(
        <SearchSection initialPrefill={null} onSelect={noop} onSwitchToPaste={noop} onSwitchToUpload={noop} />,
      ),
    );
    const duration = screen.getByLabelText("Duration").element() as HTMLInputElement;
    duration.focus();
    await userEvent.type(duration, "225");
    duration.blur();
    await expect.poll(() => duration.value).toBe("3:45");
  });
});

// -- Edge cases ---------------------------------------------------------------

describe("SearchSection edge cases", () => {
  it("renders a very long track name without breaking layout", async () => {
    const longTrack = "A".repeat(300);
    const screen = await render(
      withQueryClient(
        <SearchSection
          initialPrefill={{ track: longTrack }}
          onSelect={noop}
          onSwitchToPaste={noop}
          onSwitchToUpload={noop}
        />,
      ),
    );
    const track = screen.getByLabelText("Track").element() as HTMLInputElement;
    expect(track.value).toBe(longTrack);
    expect(track.clientWidth).toBeGreaterThan(0);
  });

  it("Reset fields button is hidden when every input is empty", async () => {
    const screen = await render(
      withQueryClient(
        <SearchSection initialPrefill={null} onSelect={noop} onSwitchToPaste={noop} onSwitchToUpload={noop} />,
      ),
    );
    expect(screen.getByRole("button", { name: /Reset fields/i }).elements().length).toBe(0);
  });

  it("Reset fields button appears once any input is non-empty", async () => {
    const screen = await render(
      withQueryClient(
        <SearchSection
          initialPrefill={{ track: "Bohemian" }}
          onSelect={noop}
          onSwitchToPaste={noop}
          onSwitchToUpload={noop}
        />,
      ),
    );
    await expect.element(screen.getByRole("button", { name: /Reset fields/i })).toBeInTheDocument();
  });

  it("Reset fields clears every input and focuses the track input", async () => {
    const screen = await render(
      withQueryClient(
        <SearchSection
          initialPrefill={{
            track: "Bohemian Rhapsody",
            artist: "Queen",
            album: "A Night at the Opera",
            durationSec: 355,
            videoId: "fJ9rUzIMcZQ",
          }}
          onSelect={noop}
          onSwitchToPaste={noop}
          onSwitchToUpload={noop}
        />,
      ),
    );
    const track = screen.getByLabelText("Track").element() as HTMLInputElement;
    const artist = screen.getByLabelText("Artist").element() as HTMLInputElement;
    const album = screen.getByLabelText("Album").element() as HTMLInputElement;
    const duration = screen.getByLabelText("Duration").element() as HTMLInputElement;
    const videoId = screen.getByLabelText("Video ID").element() as HTMLInputElement;

    await screen.getByRole("button", { name: /Reset fields/i }).click();

    expect(track.value).toBe("");
    expect(artist.value).toBe("");
    expect(album.value).toBe("");
    expect(duration.value).toBe("");
    expect(videoId.value).toBe("");

    await expect.poll(() => document.activeElement).toBe(track);
    await expect.poll(() => screen.getByRole("button", { name: /Reset fields/i }).elements().length).toBe(0);
  });

  it("Reset fields also clears the persisted defaultPrefill so a reopen starts blank", async () => {
    const { useImportModalStore } = await import("@/stores/import-modal-store");
    useImportModalStore.getState().setDefaultPrefill({ track: "Persisted" });

    const screen = await render(
      withQueryClient(
        <SearchSection
          initialPrefill={{ track: "Persisted" }}
          onSelect={noop}
          onSwitchToPaste={noop}
          onSwitchToUpload={noop}
        />,
      ),
    );

    await screen.getByRole("button", { name: /Reset fields/i }).click();

    expect(useImportModalStore.getState().defaultPrefill).toBeNull();
  });

  it("declares a listbox role on the results container", async () => {
    const screen = await render(
      withQueryClient(
        <SearchSection
          initialPrefill={{ track: "Bohemian" }}
          onSelect={noop}
          onSwitchToPaste={noop}
          onSwitchToUpload={noop}
        />,
      ),
    );
    await expect.poll(() => currentProvider?.pending.length ?? 0).toBeGreaterThan(0);
    const entry = currentProvider!.pending[currentProvider!.pending.length - 1];
    entry.resolve([buildResult({ id: "r1", track: "Track 1" })]);
    await expect.element(screen.getByRole("listbox")).toBeInTheDocument();
  });
});
