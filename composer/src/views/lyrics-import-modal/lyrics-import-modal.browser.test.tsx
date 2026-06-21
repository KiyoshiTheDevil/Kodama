import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { userEvent } from "vitest/browser";
import type { LyricsSearchResult, ProviderName } from "@/domain/lyrics-search/result";
import { useAudioStore } from "@/stores/audio";
import { useImportModalStore } from "@/stores/import-modal-store";
import { useProjectStore } from "@/stores/project";
import { useSettingsStore } from "@/stores/settings";
import { render } from "@/test/render";
import {
  registerProviderForTests,
  restoreProvidersForTests,
  snapshotProvidersForTests,
} from "@/utils/lyrics-search/registry";
import type { LyricsSearchProvider } from "@/utils/lyrics-search/types";
import { ConfirmModalHost } from "@/ui/confirm-modal";
import { LyricsImportModalHost } from "@/views/lyrics-import-modal/lyrics-import-modal-host";

// -- Fixture provider plumbing ------------------------------------------------

interface FixtureProvider extends LyricsSearchProvider {
  pending: { resolve: (value: LyricsSearchResult[]) => void; reject: (reason: unknown) => void }[];
}

function makeFixtureProvider(name: ProviderName = "lrclib"): FixtureProvider {
  const pending: { resolve: (value: LyricsSearchResult[]) => void; reject: (reason: unknown) => void }[] = [];
  return {
    name,
    sourceLabel: "LRCLib",
    canSearch: () => true,
    search(_query, signal) {
      return new Promise<LyricsSearchResult[]>((resolve, reject) => {
        pending.push({ resolve, reject });
        signal.addEventListener("abort", () => resolve([]));
      });
    },
    pending,
  };
}

function buildSearchResult(overrides: Partial<LyricsSearchResult> = {}): LyricsSearchResult {
  return {
    id: "lrclib-42",
    source: "lrclib",
    sourceLabel: "LRCLib",
    syncType: "line",
    track: "Bohemian Rhapsody",
    artist: "Queen",
    album: "A Night at the Opera",
    durationSec: 355,
    payload: {
      kind: "lrc",
      synced: "[00:01.00]Is this the real life\n[00:03.00]Is this just fantasy",
      plain: null,
    },
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
  useSettingsStore.setState({ confirmReplaceLyrics: false, autoExtractBackgroundVocals: false });
});

afterEach(() => {
  for (const entry of currentProvider?.pending ?? []) entry.resolve([]);
  restoreProvidersForTests(providerSnapshot);
  currentProvider = null;
  useImportModalStore.getState().close();
});

// -- Wrapper ------------------------------------------------------------------

function withQueryClient(children: React.ReactNode): React.ReactElement {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: Number.POSITIVE_INFINITY } },
  });
  return (
    <QueryClientProvider client={client}>
      {children}
      <ConfirmModalHost />
    </QueryClientProvider>
  );
}

function openModal(args?: Parameters<ReturnType<typeof useImportModalStore.getState>["open"]>[0]) {
  useImportModalStore.getState().open(args);
}

// -- Tests --------------------------------------------------------------------

describe("LyricsImportModal renders only when store is open", () => {
  it("renders nothing when isOpen is false", async () => {
    await render(withQueryClient(<LyricsImportModalHost />));
    expect(document.querySelector("dialog")).toBeNull();
  });

  it("renders dialog when the store opens", async () => {
    await render(withQueryClient(<LyricsImportModalHost />));
    openModal();
    await expect.poll(() => document.querySelector("dialog")).not.toBeNull();
  });
});

describe("LyricsImportModal section selection", () => {
  it("defaults to the search section", async () => {
    const screen = await render(withQueryClient(<LyricsImportModalHost />));
    openModal();
    await expect.element(screen.getByLabelText("Track")).toBeInTheDocument();
  });

  it("starts on paste when initialSection is paste", async () => {
    const screen = await render(withQueryClient(<LyricsImportModalHost />));
    openModal({ section: "paste" });
    await expect.element(screen.getByLabelText("Lyrics text")).toBeInTheDocument();
  });

  it("starts on upload when initialSection is upload", async () => {
    const screen = await render(withQueryClient(<LyricsImportModalHost />));
    openModal({ section: "upload" });
    await expect.element(screen.getByText("Drop a lyrics file here")).toBeInTheDocument();
  });

  it("populates search inputs from prefill", async () => {
    const screen = await render(withQueryClient(<LyricsImportModalHost />));
    openModal({ prefill: { track: "Bohemian Rhapsody", artist: "Queen", durationSec: 355 } });
    await expect.element(screen.getByLabelText("Track")).toBeInTheDocument();
    const track = screen.getByLabelText("Track").element() as HTMLInputElement;
    const artist = screen.getByLabelText("Artist").element() as HTMLInputElement;
    await expect.poll(() => track.value).toBe("Bohemian Rhapsody");
    expect(artist.value).toBe("Queen");
  });
});

describe("LyricsImportModal section switching", () => {
  it("switches paste -> search via Back to search", async () => {
    const screen = await render(withQueryClient(<LyricsImportModalHost />));
    openModal({ section: "paste" });
    await expect.element(screen.getByLabelText("Lyrics text")).toBeInTheDocument();
    await screen.getByRole("button", { name: /Back to search/i }).click();
    await expect.element(screen.getByLabelText("Track")).toBeInTheDocument();
  });

  it("switches search -> paste via Paste lyrics instead", async () => {
    const screen = await render(withQueryClient(<LyricsImportModalHost />));
    openModal();
    await screen.getByRole("button", { name: /Paste lyrics instead/i }).click();
    await expect.element(screen.getByLabelText("Lyrics text")).toBeInTheDocument();
  });
});

async function waitForTextarea(): Promise<HTMLTextAreaElement> {
  await expect.poll(() => document.querySelector("textarea")).not.toBeNull();
  return document.querySelector("textarea") as HTMLTextAreaElement;
}

async function waitForDropzone(): Promise<HTMLElement> {
  await expect.poll(() => document.querySelector("[data-upload-dropzone]")).not.toBeNull();
  return document.querySelector("[data-upload-dropzone]") as HTMLElement;
}

describe("LyricsImportModal paste section commit", () => {
  it("commits paste text into the project store when Import is clicked", async () => {
    const screen = await render(withQueryClient(<LyricsImportModalHost />));
    openModal({ section: "paste" });
    const textarea = await waitForTextarea();
    textarea.focus();
    await userEvent.fill(textarea, "First lyric\nSecond lyric");
    await screen.getByRole("button", { name: /^Import$/ }).click();
    await expect.poll(() => useProjectStore.getState().lines.length).toBe(2);
    await expect.poll(() => useImportModalStore.getState().isOpen).toBe(false);
  });

  it("disables Import when paste is whitespace only", async () => {
    const screen = await render(withQueryClient(<LyricsImportModalHost />));
    openModal({ section: "paste" });
    const textarea = await waitForTextarea();
    textarea.focus();
    await userEvent.fill(textarea, "   \n  \n");
    const importBtn = screen.getByRole("button", { name: /^Import$/ });
    await expect.poll(() => (importBtn.element() as HTMLButtonElement).disabled).toBe(true);
  });

  it("clears paste text after commit (reopen shows empty textarea)", async () => {
    const screen = await render(withQueryClient(<LyricsImportModalHost />));
    openModal({ section: "paste" });
    const textarea = await waitForTextarea();
    textarea.focus();
    await userEvent.fill(textarea, "Some lyrics");
    await screen.getByRole("button", { name: /^Import$/ }).click();
    await expect.poll(() => useImportModalStore.getState().isOpen).toBe(false);

    openModal({ section: "paste" });
    const reopenedTextarea = await waitForTextarea();
    await expect.poll(() => reopenedTextarea.value).toBe("");
  });
});

describe("LyricsImportModal search section commit", () => {
  it("commits search result into the project store", async () => {
    const screen = await render(withQueryClient(<LyricsImportModalHost />));
    openModal({ prefill: { track: "Bohemian" } });
    await expect.poll(() => currentProvider?.pending.length ?? 0).toBeGreaterThan(0);
    const entry = currentProvider!.pending[currentProvider!.pending.length - 1];
    entry.resolve([buildSearchResult()]);
    await expect.element(screen.getByText("Bohemian Rhapsody")).toBeInTheDocument();
    await screen.getByRole("option").click();
    await expect.poll(() => useProjectStore.getState().lines.length).toBeGreaterThan(0);
    await expect.poll(() => useImportModalStore.getState().isOpen).toBe(false);
  });

  it("confirm-replace runs when project already has lines (cancel keeps existing)", async () => {
    useSettingsStore.setState({ confirmReplaceLyrics: true });
    useProjectStore.setState({
      lines: [{ id: "existing", text: "Old line", agentId: "v1" }],
    });
    const screen = await render(withQueryClient(<LyricsImportModalHost />));
    openModal({ prefill: { track: "Bohemian" } });
    await expect.poll(() => currentProvider?.pending.length ?? 0).toBeGreaterThan(0);
    const entry = currentProvider!.pending[currentProvider!.pending.length - 1];
    entry.resolve([buildSearchResult()]);
    await expect.element(screen.getByText("Bohemian Rhapsody")).toBeInTheDocument();
    await screen.getByRole("option").click();
    await expect.element(screen.getByText(/Replace existing lyrics/i)).toBeInTheDocument();
    await screen.getByRole("button", { name: /Cancel/i }).click();
    await expect.poll(() => useProjectStore.getState().lines.length).toBe(1);
    expect(useProjectStore.getState().lines[0].text).toBe("Old line");
  });
});

describe("LyricsImportModal upload section commit", () => {
  it("commits a dropped .lrc file into the project store", async () => {
    const screen = await render(withQueryClient(<LyricsImportModalHost />));
    openModal({ section: "upload" });
    const dropzone = await waitForDropzone();
    const file = new File(["[00:01.00]Hello\n[00:03.00]World"], "song.lrc", { type: "text/plain" });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    dropzone.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }));
    await expect.element(screen.getByText(/Ready to import/i)).toBeInTheDocument();
    await screen.getByRole("button", { name: /^Import$/ }).click();
    await expect.poll(() => useProjectStore.getState().lines.length).toBeGreaterThan(0);
    await expect.poll(() => useImportModalStore.getState().isOpen).toBe(false);
  });

  it("disables Import when no file is pending", async () => {
    const screen = await render(withQueryClient(<LyricsImportModalHost />));
    openModal({ section: "upload" });
    await waitForDropzone();
    const importBtn = screen.getByRole("button", { name: /^Import$/ });
    await expect.poll(() => (importBtn.element() as HTMLButtonElement).disabled).toBe(true);
  });

  it("clears pending file after commit (reopen shows none)", async () => {
    const screen = await render(withQueryClient(<LyricsImportModalHost />));
    openModal({ section: "upload" });
    const dropzone = await waitForDropzone();
    const file = new File(["[00:01.00]Hi"], "a.lrc", { type: "text/plain" });
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    dropzone.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }));
    await screen.getByRole("button", { name: /^Import$/ }).click();
    await expect.poll(() => useImportModalStore.getState().isOpen).toBe(false);

    openModal({ section: "upload" });
    await waitForDropzone();
    await expect.poll(() => document.body.textContent).not.toMatch(/Ready to import/i);
  });
});

describe("LyricsImportModal close behaviors", () => {
  it("closes when the Cancel button is clicked", async () => {
    const screen = await render(withQueryClient(<LyricsImportModalHost />));
    openModal();
    await screen.getByRole("button", { name: /Cancel/i }).click();
    await expect.poll(() => useImportModalStore.getState().isOpen).toBe(false);
  });

  it("closes when Escape is pressed", async () => {
    await render(withQueryClient(<LyricsImportModalHost />));
    openModal();
    await expect.poll(() => document.querySelector("dialog")).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await expect.poll(() => useImportModalStore.getState().isOpen).toBe(false);
  });

  it("re-opening defaults to search after a close", async () => {
    const screen = await render(withQueryClient(<LyricsImportModalHost />));
    openModal({ section: "paste" });
    await expect.element(screen.getByLabelText("Lyrics text")).toBeInTheDocument();
    useImportModalStore.getState().close();
    await expect.poll(() => useImportModalStore.getState().isOpen).toBe(false);
    openModal();
    await expect.element(screen.getByLabelText("Track")).toBeInTheDocument();
  });
});

describe("LyricsImportModal accessibility", () => {
  it("uses role='dialog' with the Import Lyrics title", async () => {
    const screen = await render(withQueryClient(<LyricsImportModalHost />));
    openModal();
    await expect.element(screen.getByText("Import Lyrics")).toBeInTheDocument();
    const dialog = document.querySelector("dialog");
    expect(dialog).not.toBeNull();
  });

  it("exposes Cancel and Import buttons by accessible name", async () => {
    const screen = await render(withQueryClient(<LyricsImportModalHost />));
    openModal({ section: "paste" });
    await expect.element(screen.getByRole("button", { name: /Cancel/i })).toBeInTheDocument();
    await expect.element(screen.getByRole("button", { name: /^Import$/ })).toBeInTheDocument();
  });
});

describe("LyricsImportModal settings integration", () => {
  it("distributes word timing across audio duration when paste text is unsynced", async () => {
    useAudioStore.setState({ duration: 60 });
    const screen = await render(withQueryClient(<LyricsImportModalHost />));
    openModal({ section: "paste" });
    const textarea = await waitForTextarea();
    textarea.focus();
    await userEvent.fill(textarea, "Hello world\nSecond line");
    await screen.getByRole("button", { name: /^Import$/ }).click();
    await expect.poll(() => useProjectStore.getState().lines.length).toBe(2);
    const lines = useProjectStore.getState().lines;
    expect(lines[0].words).toBeDefined();
    expect(lines[0].words?.length ?? 0).toBeGreaterThan(0);
  });

  it("extracts inline parenthetical background when the setting is on", async () => {
    useSettingsStore.setState({ autoExtractBackgroundVocals: true, mergeStandaloneBackgroundLines: false });
    const screen = await render(withQueryClient(<LyricsImportModalHost />));
    openModal({ section: "paste" });
    const textarea = await waitForTextarea();
    textarea.focus();
    await userEvent.fill(textarea, "Hello (world)");
    await screen.getByRole("button", { name: /^Import$/ }).click();
    await expect.poll(() => useProjectStore.getState().lines.length).toBe(1);
    const line = useProjectStore.getState().lines[0];
    expect(line.text).toBe("Hello");
    expect(line.backgroundText).toBe("world");
  });
});
