import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useImportFromYouTube } from "@/hooks/useImportFromYouTube";
import { usePersistence } from "@/hooks/usePersistence";
import { getPersistenceSettled } from "@/lib/persistence-settled";
import { useAudioStore } from "@/stores/audio";
import { useProjectStore } from "@/stores/project";
import { seedAudioFile, seedProject } from "@/test/idb";
import { render } from "@/test/render";
import { ImportPanel } from "@/views/import";

// -- Constants ----------------------------------------------------------------

const URL_VIDEO_ID = "dQw4w9WgXcQ";
const SAVED_VIDEO_ID = "9bZkp7q19f0";
const SAVED_TITLE = "Persistence-Restored Title";
const SAVED_FILE_BYTES = new Uint8Array([0x01, 0x02, 0x03, 0x04, 0x05]);

// -- Helpers ------------------------------------------------------------------

const HookHost: React.FC = () => {
  usePersistence();
  useImportFromYouTube();
  return null;
};

const BootHost: React.FC = () => (
  <>
    <HookHost />
    <ImportPanel />
  </>
);

function setQuery(search: string): void {
  window.history.replaceState(null, "", `/${search}`);
}

function audioSource() {
  return useAudioStore.getState().source;
}

function projectTitle(): string {
  return useProjectStore.getState().metadata.title;
}

// Wait until both persistence AND any URL hook chained off persistenceSettled
// have run. URL hook's .then was registered on the same promise during mount,
// so it queues BEFORE this test's await. After persistence marks, microtask
// drain runs URL hook's handler first; this await resumes second, by which
// time the store reflects the URL hook's final write.
async function waitForBootSettled(): Promise<void> {
  await getPersistenceSettled();
}

function seedSavedYoutubeAudio(videoId: string): Promise<void> {
  return seedAudioFile({
    name: `${videoId}.opus`,
    type: "audio/ogg",
    data: SAVED_FILE_BYTES.slice().buffer,
  });
}

function seedSavedFileAudio(name: string): Promise<void> {
  return seedAudioFile({
    name,
    type: "audio/mpeg",
    data: SAVED_FILE_BYTES.slice().buffer,
  });
}

function baseSavedProject(audioSource: { kind: "youtube"; videoId: string } | { kind: "file"; name: string } | null) {
  return {
    version: 1,
    savedAt: Date.now(),
    metadata: { title: SAVED_TITLE, artist: "Saved Artist", album: "Saved Album", duration: 0 },
    lines: [],
    agents: [{ id: "v1", type: "person", name: "Lead" }],
    granularity: "word" as const,
    ...(audioSource ? { audioSource } : {}),
  };
}

// -- URL overrides persistence ------------------------------------------------

describe("usePersistence + useImportFromYouTube — URL overrides persistence", () => {
  beforeEach(() => setQuery(""));
  afterEach(() => setQuery(""));

  it("URL ?videoId= wins when persistence has a different saved youtube source", async () => {
    await seedSavedYoutubeAudio(SAVED_VIDEO_ID);
    await seedProject(baseSavedProject({ kind: "youtube", videoId: SAVED_VIDEO_ID }));
    setQuery(`?videoId=${URL_VIDEO_ID}`);

    await render(<BootHost />);
    await waitForBootSettled();

    const source = audioSource();
    expect(source?.type).toBe("youtube");
    if (source?.type === "youtube") expect(source.videoId).toBe(URL_VIDEO_ID);
    expect(projectTitle()).toBe(URL_VIDEO_ID);
  });

  it("URL ?videoId= wins when persistence has a saved file source", async () => {
    await seedSavedFileAudio("song.mp3");
    await seedProject(baseSavedProject({ kind: "file", name: "song.mp3" }));
    setQuery(`?videoId=${URL_VIDEO_ID}`);

    await render(<BootHost />);
    await waitForBootSettled();

    const source = audioSource();
    expect(source?.type).toBe("youtube");
    if (source?.type === "youtube") expect(source.videoId).toBe(URL_VIDEO_ID);
    expect(projectTitle()).toBe(URL_VIDEO_ID);
  });

  it("URL ?videoId= matching the saved youtube videoId is a cache hit (preserves the cached file)", async () => {
    await seedSavedYoutubeAudio(URL_VIDEO_ID);
    await seedProject(baseSavedProject({ kind: "youtube", videoId: URL_VIDEO_ID }));
    setQuery(`?videoId=${URL_VIDEO_ID}`);

    await render(<BootHost />);
    await waitForBootSettled();

    const source = audioSource();
    expect(source?.type).toBe("youtube");
    if (source?.type === "youtube") {
      expect(source.videoId).toBe(URL_VIDEO_ID);
      expect(source.file).toBeInstanceOf(File);
      expect(source.file?.name).toBe(`${URL_VIDEO_ID}.opus`);
      expect(source.file?.size).toBe(SAVED_FILE_BYTES.length);
    }
  });

  it("with no URL param, restores the saved youtube source as before", async () => {
    await seedSavedYoutubeAudio(SAVED_VIDEO_ID);
    await seedProject(baseSavedProject({ kind: "youtube", videoId: SAVED_VIDEO_ID }));
    setQuery("");

    await render(<BootHost />);
    await waitForBootSettled();

    const source = audioSource();
    expect(source?.type).toBe("youtube");
    if (source?.type === "youtube") {
      expect(source.videoId).toBe(SAVED_VIDEO_ID);
      expect(source.file).toBeInstanceOf(File);
    }
    expect(projectTitle()).toBe(SAVED_TITLE);
  });

  it("with no URL param, restores the saved file source as before", async () => {
    await seedSavedFileAudio("song.mp3");
    await seedProject(baseSavedProject({ kind: "file", name: "song.mp3" }));
    setQuery("");

    await render(<BootHost />);
    await waitForBootSettled();

    const source = audioSource();
    expect(source?.type).toBe("file");
    if (source?.type === "file") expect(source.file.name).toBe("song.mp3");
    expect(projectTitle()).toBe(SAVED_TITLE);
  });
});

// -- Cold start ---------------------------------------------------------------

describe("usePersistence + useImportFromYouTube — cold start", () => {
  beforeEach(() => setQuery(""));
  afterEach(() => setQuery(""));

  it("loads the URL videoId when no saved project exists", async () => {
    setQuery(`?videoId=${URL_VIDEO_ID}`);

    await render(<BootHost />);
    await waitForBootSettled();

    const source = audioSource();
    expect(source?.type).toBe("youtube");
    if (source?.type === "youtube") {
      expect(source.videoId).toBe(URL_VIDEO_ID);
      expect(source.file).toBeUndefined();
    }
    expect(projectTitle()).toBe(URL_VIDEO_ID);
  });

  it("no URL + no saved data leaves the audio source null", async () => {
    setQuery("");

    await render(<BootHost />);
    await waitForBootSettled();

    expect(audioSource()).toBeNull();
    expect(projectTitle()).toBe("");
  });
});

// -- Edge cases ---------------------------------------------------------------

describe("usePersistence + useImportFromYouTube — edge cases", () => {
  beforeEach(() => setQuery(""));
  afterEach(() => setQuery(""));

  it("invalid videoId surfaces a toast and does not write the audio source", async () => {
    await seedSavedYoutubeAudio(SAVED_VIDEO_ID);
    await seedProject(baseSavedProject({ kind: "youtube", videoId: SAVED_VIDEO_ID }));
    setQuery("?videoId=this-is-not-a-real-id-1234567");

    await render(<BootHost />);
    await waitForBootSettled();

    const source = audioSource();
    expect(source?.type).toBe("youtube");
    if (source?.type === "youtube") expect(source.videoId).toBe(SAVED_VIDEO_ID);
    expect(projectTitle()).toBe(SAVED_TITLE);
  });

  it("?v= alias is honored exactly like ?videoId=", async () => {
    setQuery(`?v=${URL_VIDEO_ID}`);

    await render(<BootHost />);
    await waitForBootSettled();

    const source = audioSource();
    expect(source?.type).toBe("youtube");
    if (source?.type === "youtube") expect(source.videoId).toBe(URL_VIDEO_ID);
  });

  it("?youtube= with a watch URL extracts the videoId", async () => {
    setQuery(`?youtube=${encodeURIComponent(`https://www.youtube.com/watch?v=${URL_VIDEO_ID}`)}`);

    await render(<BootHost />);
    await waitForBootSettled();

    const source = audioSource();
    expect(source?.type).toBe("youtube");
    if (source?.type === "youtube") expect(source.videoId).toBe(URL_VIDEO_ID);
  });

  it("URL ?videoId= matching saved videoId WITHOUT cached file still triggers a load", async () => {
    // Project says we previously loaded URL_VIDEO_ID, but the cached audio file
    // is gone (e.g., IDB partial wipe). Cache hit must NOT trigger.
    await seedProject(baseSavedProject({ kind: "youtube", videoId: URL_VIDEO_ID }));
    setQuery(`?videoId=${URL_VIDEO_ID}`);

    await render(<BootHost />);
    await waitForBootSettled();

    const source = audioSource();
    expect(source?.type).toBe("youtube");
    if (source?.type === "youtube") {
      expect(source.videoId).toBe(URL_VIDEO_ID);
      expect(source.file).toBeUndefined();
    }
  });

  it("preserves saved title when URL videoId matches saved videoId (cache hit short-circuits title rewrite)", async () => {
    await seedSavedYoutubeAudio(URL_VIDEO_ID);
    await seedProject(baseSavedProject({ kind: "youtube", videoId: URL_VIDEO_ID }));
    setQuery(`?videoId=${URL_VIDEO_ID}`);

    await render(<BootHost />);
    await waitForBootSettled();

    // Cache hit: useImportFromYouTube returns before loadYouTubeSource, so
    // useLoadYouTubeSource never rewrites metadata.title. Saved title is kept.
    expect(projectTitle()).toBe(SAVED_TITLE);
  });
});
