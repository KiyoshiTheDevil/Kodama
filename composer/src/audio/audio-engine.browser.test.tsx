import { AudioEngine } from "@/audio/audio-engine";
import { scrubPreview } from "@/audio/scrub-preview";
import { scrubStemRouter } from "@/audio/scrub-stem-router";
import { useAudioStore } from "@/stores/audio";
import { useProjectStore } from "@/stores/project";
import { useSeparationStore } from "@/stores/separation";
import { createAudioFile, createMp3File } from "@/test/audio-fixtures";
import { allowConsole } from "@/test/console-guard";
import { render } from "@/test/render";
import { afterEach, describe, expect, it } from "vitest";

function waitFor(predicate: () => boolean, timeout = 1000): Promise<void> {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (predicate()) return resolve();
      if (Date.now() - start > timeout) return reject(new Error("waitFor timeout"));
      requestAnimationFrame(tick);
    };
    tick();
  });
}

describe("AudioEngine", () => {
  afterEach(() => {
    scrubStemRouter.clearCache();
  });

  it("registers an <audio> element on the store when a file source is set", async () => {
    await render(<AudioEngine />);
    expect(useAudioStore.getState().audioElement).toBeNull();
    useAudioStore.setState({ source: { type: "file", file: createAudioFile() } });
    await waitFor(() => useAudioStore.getState().audioElement !== null);
    expect(useAudioStore.getState().audioElement).toBeInstanceOf(HTMLAudioElement);
  });

  it("clears audioElement when the source becomes null", async () => {
    await render(<AudioEngine />);
    useAudioStore.setState({ source: { type: "file", file: createAudioFile() } });
    await waitFor(() => useAudioStore.getState().audioElement !== null);
    useAudioStore.setState({ source: null });
    await waitFor(() => useAudioStore.getState().audioElement === null);
    expect(useAudioStore.getState().audioElement).toBeNull();
  });

  it("propagates playbackRate, volume, and mute changes to the audio element", async () => {
    await render(<AudioEngine />);
    useAudioStore.setState({ source: { type: "file", file: createAudioFile() } });
    await waitFor(() => useAudioStore.getState().audioElement !== null);
    const audio = useAudioStore.getState().audioElement as HTMLAudioElement;

    useAudioStore.setState({ playbackRate: 1.5 });
    await waitFor(() => audio.playbackRate === 1.5);
    expect(audio.playbackRate).toBe(1.5);

    useAudioStore.setState({ volume: 0.25 });
    await waitFor(() => audio.volume === 0.25);
    expect(audio.volume).toBe(0.25);

    useAudioStore.setState({ isMuted: true });
    await waitFor(() => audio.muted === true);
    expect(audio.muted).toBe(true);
  });

  it("decodes an mp3 source and feeds the element a wav blob", async () => {
    await render(<AudioEngine />);
    useAudioStore.setState({ source: { type: "file", file: createMp3File() } });
    await waitFor(() => useAudioStore.getState().audioElement !== null, 5000);
    const audio = useAudioStore.getState().audioElement as HTMLAudioElement;
    const bytes = await (await fetch(audio.src)).arrayBuffer();
    const tag = String.fromCharCode(...new Uint8Array(bytes, 0, 4));
    expect(tag).toBe("RIFF");
  });

  it("falls back to the original file when mp3 decode fails", async () => {
    allowConsole(/audio decode failed/);
    allowConsole(/scrub-preview decode failed/);
    allowConsole(/Audio error/);
    await render(<AudioEngine />);
    const garbage = new File([new Uint8Array([1, 2, 3, 4, 5])], "broken.mp3", { type: "audio/mpeg" });
    useAudioStore.setState({ source: { type: "file", file: garbage } });
    await waitFor(() => useAudioStore.getState().audioElement !== null, 5000);
    expect(useAudioStore.getState().audioElement).toBeInstanceOf(HTMLAudioElement);
  });

  it("serves a non-mp3 source as-is without re-encoding", async () => {
    await render(<AudioEngine />);
    const wav = createAudioFile();
    useAudioStore.setState({ source: { type: "file", file: wav } });
    await waitFor(() => useAudioStore.getState().audioElement !== null);
    const audio = useAudioStore.getState().audioElement as HTMLAudioElement;
    const served = await (await fetch(audio.src)).arrayBuffer();
    expect(served.byteLength).toBe(wav.size);
  });

  it("produces a seekable element for an mp3 source", async () => {
    await render(<AudioEngine />);
    useAudioStore.setState({ source: { type: "file", file: createMp3File() } });
    await waitFor(() => useAudioStore.getState().audioElement !== null, 5000);
    const audio = useAudioStore.getState().audioElement as HTMLAudioElement;
    await waitFor(() => audio.readyState >= 1 && audio.duration > 0.1, 5000);
    const target = audio.duration / 2;
    audio.currentTime = target;
    await waitFor(() => Math.abs(audio.currentTime - target) < 0.05, 2000);
    expect(audio.currentTime).toBeCloseTo(target, 1);
  });

  it("removes the audio element from the DOM when the source is cleared", async () => {
    await render(<AudioEngine />);
    useAudioStore.setState({ source: { type: "file", file: createMp3File() } });
    await waitFor(() => useAudioStore.getState().audioElement !== null, 5000);
    useAudioStore.setState({ source: null });
    await waitFor(() => useAudioStore.getState().audioElement === null);
    expect(document.querySelectorAll("#composer-audio").length).toBe(0);
  });

  it("ends with a single element matching the final source after rapid source changes", async () => {
    await render(<AudioEngine />);
    useAudioStore.setState({ source: { type: "file", file: createMp3File() } });
    await new Promise((resolve) => setTimeout(resolve, 0));
    const wav = createAudioFile();
    useAudioStore.setState({ source: { type: "file", file: wav } });
    await waitFor(() => useAudioStore.getState().audioElement !== null, 5000);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const elements = document.querySelectorAll("#composer-audio");
    expect(elements.length).toBe(1);
    const audio = useAudioStore.getState().audioElement as HTMLAudioElement;
    expect(elements[0]).toBe(audio);
    const served = await (await fetch(audio.src)).arrayBuffer();
    expect(served.byteLength).toBe(wav.size);
  });

  it("preserves playbackRate when switching separated audio tracks", async () => {
    await render(<AudioEngine />);
    useAudioStore.setState({
      source: { type: "file", file: createAudioFile() },
      playbackRate: 1.5,
      volume: 0.4,
      isMuted: true,
    });
    await waitFor(() => useAudioStore.getState().audioElement !== null);
    const audio = useAudioStore.getState().audioElement as HTMLAudioElement;
    await waitFor(() => audio.playbackRate === 1.5);

    audio.playbackRate = 1;
    audio.volume = 1;
    audio.muted = false;
    const vocalsUrl = URL.createObjectURL(createAudioFile("vocals.wav"));

    try {
      useSeparationStore.setState({
        currentStem: "vocals",
        availableStems: ["original", "vocals"],
        stemUrls: { vocals: vocalsUrl },
      });

      await waitFor(() => audio.src === vocalsUrl);
      expect(audio.playbackRate).toBe(1.5);
      expect(audio.volume).toBe(0.4);
      expect(audio.muted).toBe(true);
    } finally {
      URL.revokeObjectURL(vocalsUrl);
    }
  });

  it("switches to the instrumental separated track", async () => {
    await render(<AudioEngine />);
    useAudioStore.setState({ source: { type: "file", file: createAudioFile() } });
    await waitFor(() => useAudioStore.getState().audioElement !== null);
    const audio = useAudioStore.getState().audioElement as HTMLAudioElement;
    const instrumentalUrl = URL.createObjectURL(createAudioFile("instrumental.wav"));

    try {
      useSeparationStore.setState({
        currentStem: "instrumental",
        availableStems: ["original", "vocals", "instrumental"],
        stemUrls: { instrumental: instrumentalUrl },
      });

      await waitFor(() => audio.src === instrumentalUrl);
      expect(audio.src).toBe(instrumentalUrl);
    } finally {
      URL.revokeObjectURL(instrumentalUrl);
    }
  });

  it("applies a preselected instrumental track after the audio element is created", async () => {
    const instrumentalUrl = URL.createObjectURL(createAudioFile("instrumental.wav"));

    try {
      useSeparationStore.setState({
        currentStem: "instrumental",
        availableStems: ["original", "vocals", "instrumental"],
        stemUrls: { instrumental: instrumentalUrl },
      });
      await render(<AudioEngine />);
      useAudioStore.setState({ source: { type: "file", file: createAudioFile() } });

      await waitFor(() => useAudioStore.getState().audioElement?.src === instrumentalUrl);
      expect(useAudioStore.getState().audioElement?.src).toBe(instrumentalUrl);
    } finally {
      URL.revokeObjectURL(instrumentalUrl);
    }
  });

  it("switches from a separated track back to the original source", async () => {
    await render(<AudioEngine />);
    useAudioStore.setState({ source: { type: "file", file: createAudioFile() } });
    await waitFor(() => useAudioStore.getState().audioElement !== null);
    const audio = useAudioStore.getState().audioElement as HTMLAudioElement;
    const originalUrl = audio.src;
    const vocalsUrl = URL.createObjectURL(createAudioFile("vocals.wav"));

    try {
      useSeparationStore.setState({
        currentStem: "vocals",
        availableStems: ["original", "vocals"],
        stemUrls: { vocals: vocalsUrl },
      });
      await waitFor(() => audio.src === vocalsUrl);

      useSeparationStore.setState({ currentStem: "original" });
      await waitFor(() => audio.src === originalUrl);
      expect(audio.src).toBe(originalUrl);
    } finally {
      URL.revokeObjectURL(vocalsUrl);
    }
  });

  it("routes the scrub-preview through the currently-selected stem", async () => {
    await render(<AudioEngine />);
    useAudioStore.setState({ source: { type: "file", file: createAudioFile() } });
    await waitFor(() => useAudioStore.getState().audioElement !== null);

    await waitFor(() => scrubStemRouter.getActiveStem() === "original", 5000);

    const vocalsUrl = URL.createObjectURL(createAudioFile("vocals.wav"));
    try {
      useSeparationStore.setState({
        currentStem: "vocals",
        availableStems: ["original", "vocals"],
        stemUrls: { vocals: vocalsUrl },
      });
      await waitFor(() => scrubStemRouter.getActiveStem() === "vocals", 5000);
      scrubPreview.play(0.05, 1);
      expect(scrubPreview.getActiveSnippet()?.time).toBe(0);

      useSeparationStore.setState({ currentStem: "original" });
      await waitFor(() => scrubStemRouter.getActiveStem() === "original", 5000);
    } finally {
      URL.revokeObjectURL(vocalsUrl);
    }
  });

  it("clears the scrub router cache when the source becomes null", async () => {
    await render(<AudioEngine />);
    useAudioStore.setState({ source: { type: "file", file: createAudioFile() } });
    await waitFor(() => useAudioStore.getState().audioElement !== null);
    await waitFor(() => scrubStemRouter.getActiveStem() === "original", 5000);

    useAudioStore.setState({ source: null });
    await waitFor(() => useAudioStore.getState().audioElement === null);
    expect(scrubStemRouter.getActiveStem()).toBeNull();
  });

  it("sets primingStripped to true after the audio element is registered for a wav source", async () => {
    await render(<AudioEngine />);
    expect(useProjectStore.getState().primingStripped).toBe(false);
    useAudioStore.setState({ source: { type: "file", file: createAudioFile() } });
    await waitFor(() => useAudioStore.getState().audioElement !== null);
    await waitFor(() => useProjectStore.getState().primingStripped === true);
    expect(useProjectStore.getState().primingStripped).toBe(true);
  });

  it("sets primingStripped to true after the audio element is registered for an mp3 source", async () => {
    await render(<AudioEngine />);
    useAudioStore.setState({ source: { type: "file", file: createMp3File() } });
    await waitFor(() => useAudioStore.getState().audioElement !== null, 5000);
    await waitFor(() => useProjectStore.getState().primingStripped === true, 5000);
    expect(useProjectStore.getState().primingStripped).toBe(true);
  });

  it("regression: preserves primingStripped when mp3 decode fails so the migrated flag survives", async () => {
    allowConsole(/audio decode failed/);
    allowConsole(/scrub-preview decode failed/);
    allowConsole(/Audio error/);
    await render(<AudioEngine />);
    useProjectStore.setState({ primingStripped: true });
    const garbage = new File([new Uint8Array([1, 2, 3, 4, 5])], "broken.mp3", { type: "audio/mpeg" });
    useAudioStore.setState({ source: { type: "file", file: garbage } });
    await waitFor(() => useAudioStore.getState().audioElement !== null, 5000);
    expect(useProjectStore.getState().primingStripped).toBe(true);
  });
});
