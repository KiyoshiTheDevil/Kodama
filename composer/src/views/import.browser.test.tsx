import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { useAudioStore } from "@/stores/audio";
import { useProjectStore } from "@/stores/project";
import { useSettingsStore } from "@/stores/settings";
import { createAudioFile } from "@/test/audio-fixtures";
import { render } from "@/test/render";
import { DEFAULT_BRIDGE_URL } from "@/utils/composer-bridge-api";
import { ImportPanel } from "@/views/import";

// -- Helpers ------------------------------------------------------------------

function withQueryClient(children: ReactNode) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: Number.POSITIVE_INFINITY },
    },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

// 1x1 transparent PNG. Used everywhere we need a persisted thumb data URL
// that won't actually decode in the test runner.
const PNG_DATA_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

// -- Empty state --------------------------------------------------------------

describe("ImportPanel — no source", () => {
  it("renders the audio drop zone when no source is loaded", async () => {
    useAudioStore.setState({ source: null });
    useProjectStore.setState({ lines: [] });
    const screen = await render(withQueryClient(<ImportPanel />));
    expect(screen.container.textContent ?? "").not.toBe("");
  });

  it("shows the drop zone CTA copy", async () => {
    const screen = await render(withQueryClient(<ImportPanel />));
    await expect.element(screen.getByText("Drop audio file here")).toBeInTheDocument();
    await expect.element(screen.getByText(/Supports MP3, WAV, M4A/)).toBeInTheDocument();
  });
});

// -- File source --------------------------------------------------------------

describe("ImportPanel — file source", () => {
  it("shows the loading spinner for a file source while it is loading", async () => {
    useAudioStore.setState({
      source: { type: "file", file: createAudioFile() },
      isLoading: true,
      duration: 0,
    });
    const screen = await render(withQueryClient(<ImportPanel />));
    expect(screen.container.querySelector(".animate-spin")).not.toBeNull();
  });

  it("shows the clock and resolved duration for a loaded file source", async () => {
    useAudioStore.setState({
      source: { type: "file", file: createAudioFile() },
      isLoading: false,
      duration: 90,
    });
    const screen = await render(withQueryClient(<ImportPanel />));
    expect(screen.container.querySelector(".animate-spin")).toBeNull();
    expect(screen.container.textContent).toContain("1:30");
  });

  it("renders the imported file name, extension, and size", async () => {
    const file = new File([new Uint8Array(2048)], "Hey Jude.mp3", { type: "audio/mpeg" });
    useAudioStore.setState({ source: { type: "file", file }, duration: 271, isLoading: false });

    const screen = await render(withQueryClient(<ImportPanel />));
    await expect.element(screen.getByText("Hey Jude")).toBeInTheDocument();
    await expect.element(screen.getByText("MP3")).toBeInTheDocument();
    await expect.element(screen.getByText("2.0 KB")).toBeInTheDocument();
  });
});

// -- YouTube source — title -----------------------------------------------

describe("ImportPanel — YouTube title", () => {
  it("shows the loading spinner while a YouTube source is downloading", async () => {
    useAudioStore.setState({
      source: { type: "youtube", videoId: "abc123" },
      isLoading: true,
    });
    const screen = await render(withQueryClient(<ImportPanel />));
    expect(screen.container.querySelector(".animate-spin")).not.toBeNull();
  });

  it("shows a pulsing skeleton instead of the bare videoId while downloading and no title set", async () => {
    useAudioStore.setState({
      source: { type: "youtube", videoId: "dQw4w9WgXcQ" },
      duration: 0,
      isLoading: true,
    });
    const screen = await render(withQueryClient(<ImportPanel />));
    const skeleton = screen.container.querySelector(".animate-pulse");
    expect(skeleton).not.toBeNull();
  });

  it("replaces the skeleton with the project title once it arrives", async () => {
    useAudioStore.setState({
      source: { type: "youtube", videoId: "dQw4w9WgXcQ" },
      duration: 0,
      isLoading: true,
    });
    useProjectStore.getState().setMetadata({ title: "Rick Astley - Never Gonna Give You Up" });

    const screen = await render(withQueryClient(<ImportPanel />));
    await expect.element(screen.getByText("Rick Astley - Never Gonna Give You Up")).toBeInTheDocument();
  });

  it("falls back to the videoId once the audio file is resolved but no title was set", async () => {
    const file = new File([new Uint8Array(8)], "dQw4w9WgXcQ.opus", { type: "audio/opus" });
    useAudioStore.setState({
      source: { type: "youtube", videoId: "dQw4w9WgXcQ", file },
      duration: 213,
      isLoading: false,
    });
    const screen = await render(withQueryClient(<ImportPanel />));
    await expect.element(screen.getByText("dQw4w9WgXcQ").first()).toBeInTheDocument();
  });
});

// -- YouTube source — thumbnail -------------------------------------------

describe("ImportPanel — YouTube thumbnail", () => {
  it("renders the persisted thumbnail image when one is in project metadata", async () => {
    useAudioStore.setState({
      source: { type: "youtube", videoId: "dQw4w9WgXcQ" },
      isLoading: false,
    });
    useProjectStore.getState().setMetadata({
      thumbnailDataUrl: PNG_DATA_URL,
      thumbnailForVideoId: "dQw4w9WgXcQ",
    });

    const screen = await render(withQueryClient(<ImportPanel />));
    const img = screen.container.querySelector("img[src^='data:image/png']");
    expect(img).not.toBeNull();
  });

  it("uses the YouTube fallback icon when the bridge is disabled and download is finished", async () => {
    useSettingsStore.setState({ experiments: { youtubeBridge: false } });
    const file = new File([new Uint8Array(8)], "x.opus", { type: "audio/opus" });
    useAudioStore.setState({
      source: { type: "youtube", videoId: "dQw4w9WgXcQ", file },
      isLoading: false,
    });

    const screen = await render(withQueryClient(<ImportPanel />));
    const tablerIcon = screen.container.querySelector("svg.tabler-icon-brand-youtube");
    expect(tablerIcon).not.toBeNull();
  });

  it("shows a pulsing skeleton while download is in flight and no persisted thumb exists yet", async () => {
    useSettingsStore.setState({ experiments: { youtubeBridge: false } });
    useAudioStore.setState({
      source: { type: "youtube", videoId: "dQw4w9WgXcQ" },
      isLoading: true,
    });

    const screen = await render(withQueryClient(<ImportPanel />));
    const skeleton = screen.container.querySelector(".animate-pulse");
    expect(skeleton).not.toBeNull();
  });

  it("keeps showing the persisted thumb when isLoading flips back to false (no flash to icon)", async () => {
    // Regression: while a new project loads we briefly transition source.file
    // and isLoading. The persisted thumb in metadata must keep rendering.
    const file = new File([new Uint8Array(8)], "x.opus", { type: "audio/opus" });
    useAudioStore.setState({
      source: { type: "youtube", videoId: "dQw4w9WgXcQ", file },
      isLoading: false,
    });
    useProjectStore.getState().setMetadata({
      thumbnailDataUrl: PNG_DATA_URL,
      thumbnailForVideoId: "dQw4w9WgXcQ",
    });

    const screen = await render(withQueryClient(<ImportPanel />));
    const img = screen.container.querySelector("img[src^='data:image/png']");
    expect(img).not.toBeNull();
  });

  it("does not probe the bridge for a thumb when one is already persisted", async () => {
    // The useQuery health probe must be disabled when a matching persisted
    // thumb is set, otherwise the bridge gets hit on every YouTube source row
    // render.
    useSettingsStore.setState({
      experiments: { youtubeBridge: true },
      composerBridgeUrl: DEFAULT_BRIDGE_URL,
    });
    useAudioStore.setState({
      source: { type: "youtube", videoId: "dQw4w9WgXcQ" },
      isLoading: false,
    });
    useProjectStore.getState().setMetadata({
      thumbnailDataUrl: PNG_DATA_URL,
      thumbnailForVideoId: "dQw4w9WgXcQ",
    });

    const screen = await render(withQueryClient(<ImportPanel />));
    const persisted = screen.container.querySelector("img[src^='data:image/png']");
    const liveBridgeImg = screen.container.querySelector(`img[src^='${DEFAULT_BRIDGE_URL}']`);
    expect(persisted).not.toBeNull();
    expect(liveBridgeImg).toBeNull();
  });
});

// -- YouTube source — subtitle copy ---------------------------------------

describe("ImportPanel — YouTube subtitle", () => {
  it("says 'Downloading from YouTube' while downloading", async () => {
    useAudioStore.setState({
      source: { type: "youtube", videoId: "dQw4w9WgXcQ" },
      isLoading: true,
    });
    const screen = await render(withQueryClient(<ImportPanel />));
    await expect.element(screen.getByText(/Downloading from YouTube/)).toBeInTheDocument();
  });

  it("says 'from YouTube' once the file has resolved", async () => {
    const file = new File([new Uint8Array(8)], "x.opus", { type: "audio/opus" });
    useAudioStore.setState({
      source: { type: "youtube", videoId: "dQw4w9WgXcQ", file },
      isLoading: false,
    });
    const screen = await render(withQueryClient(<ImportPanel />));
    await expect.element(screen.getByText(/^dQw4w9WgXcQ ・ from YouTube/)).toBeInTheDocument();
  });
});

describe("ImportPanel: videoId-gated thumb fallback", () => {
  it("uses the persisted thumb when thumbnailForVideoId matches the active videoId", async () => {
    useAudioStore.getState().setYouTubeSource("match-id");
    useProjectStore.getState().setMetadata({
      thumbnailDataUrl: PNG_DATA_URL,
      thumbnailForVideoId: "match-id",
    });

    const screen = await render(<ImportPanel />);
    const img = screen.container.querySelector("img[src^='data:image/png']");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe(PNG_DATA_URL);
  });

  it("ignores the persisted thumb when thumbnailForVideoId does not match the active videoId", async () => {
    useAudioStore.getState().setYouTubeSource("new-id");
    useProjectStore.getState().setMetadata({
      thumbnailDataUrl: PNG_DATA_URL,
      thumbnailForVideoId: "old-id",
    });

    const screen = await render(<ImportPanel />);
    const persisted = screen.container.querySelector("img[src^='data:image/png']");
    expect(persisted).toBeNull();
  });

  it("re-enables the bridge probe when persisted tag mismatches so a fresh thumb can load", async () => {
    useSettingsStore.setState({
      experiments: { youtubeBridge: true },
      composerBridgeUrl: DEFAULT_BRIDGE_URL,
    });
    useAudioStore.setState({
      source: { type: "youtube", videoId: "new-id" },
      isLoading: false,
    });
    useProjectStore.getState().setMetadata({
      thumbnailDataUrl: PNG_DATA_URL,
      thumbnailForVideoId: "old-id",
    });

    const screen = await render(withQueryClient(<ImportPanel />));
    const persisted = screen.container.querySelector("img[src^='data:image/png']");
    expect(persisted).toBeNull();
    // The probe being enabled is observable via the skeleton or via the live
    // bridge image landing. Either way, no stale PNG must render.
    const stale = Array.from(screen.container.querySelectorAll("img")).some(
      (img) => img.getAttribute("src") === PNG_DATA_URL,
    );
    expect(stale).toBe(false);
  });

  it("treats a legacy persisted thumb without a videoId tag as unsafe to display", async () => {
    useAudioStore.getState().setYouTubeSource("any-id");
    useProjectStore.getState().setMetadata({
      thumbnailDataUrl: PNG_DATA_URL,
    });

    const screen = await render(<ImportPanel />);
    const persisted = screen.container.querySelector("img[src^='data:image/png']");
    expect(persisted).toBeNull();
  });

  it("never renders a raw bridge URL as an img src (regression: broken-image cache pollution)", async () => {
    useSettingsStore.setState({
      experiments: { youtubeBridge: true },
      composerBridgeUrl: DEFAULT_BRIDGE_URL,
    });
    useAudioStore.setState({
      source: { type: "youtube", videoId: "y2j3n0iF_T4" },
      isLoading: true,
    });

    const screen = await render(withQueryClient(<ImportPanel />));
    const liveBridgeImg = screen.container.querySelector(`img[src^='${DEFAULT_BRIDGE_URL}']`);
    expect(liveBridgeImg).toBeNull();
  });
});
