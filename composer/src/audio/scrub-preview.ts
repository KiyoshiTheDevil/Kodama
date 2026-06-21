import { cropAudioBufferHead, parseLamePriming } from "@/audio/lame-priming";
import { useAudioStore } from "@/stores/audio";
import { useSettingsStore } from "@/stores/settings";

const SNIPPET_S = 0.12;
const CROSSFADE_S = 0.008;
const MIN_AUDIBLE_RATE = 0.1;
const MAX_BUFFER_DURATION_S = 60 * 60;
const LOG_PREFIX = "[ScrubPreview]";

type ActiveSnippet = { time: number; rate: number };

let context: AudioContext | null = null;
let buffer: AudioBuffer | null = null;
let currentSource: AudioBufferSourceNode | null = null;
let currentGain: GainNode | null = null;
let activeSnippet: ActiveSnippet | null = null;

function getContext(): AudioContext {
  if (!context) context = new AudioContext();
  if (context.state === "suspended") void context.resume();
  return context;
}

async function decode(bytes: ArrayBuffer): Promise<AudioBuffer> {
  const ctx = getContext();
  const priming = parseLamePriming(bytes);
  // decodeAudioData detaches its input ArrayBuffer in some browsers; copy first
  const decoded = await ctx.decodeAudioData(bytes.slice(0));
  const startSample =
    priming.samples > 0 && priming.sampleRate > 0
      ? Math.round((priming.samples * decoded.sampleRate) / priming.sampleRate)
      : 0;
  return cropAudioBufferHead(decoded, startSample, ctx);
}

function useBuffer(next: AudioBuffer | null): void {
  stop();
  if (next && next.duration > MAX_BUFFER_DURATION_S) {
    console.warn(LOG_PREFIX, `buffer exceeds ${MAX_BUFFER_DURATION_S}s cap; scrub preview disabled for this source`);
    buffer = null;
    return;
  }
  buffer = next;
}

function fadeOutAndStop(source: AudioBufferSourceNode, gain: GainNode): void {
  const ctx = getContext();
  const now = ctx.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(gain.gain.value, now);
  gain.gain.linearRampToValueAtTime(0, now + CROSSFADE_S);
  try {
    source.stop(now + CROSSFADE_S + 0.002);
  } catch {
    /* source already ended; safe to ignore */
  }
}

function isEnabled(): boolean {
  return useSettingsStore.getState().audioScrubPreview;
}

function play(time: number, velocity: number): void {
  if (!isEnabled()) return;
  if (!buffer) return;
  if (velocity < MIN_AUDIBLE_RATE) return;

  const ctx = getContext();
  const maxStartTime = Math.max(0, buffer.duration - SNIPPET_S);
  const clampedTime = Math.max(0, Math.min(time, maxStartTime));

  if (currentSource && currentGain) {
    fadeOutAndStop(currentSource, currentGain);
  }

  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const gain = ctx.createGain();
  const now = ctx.currentTime;
  const audioState = useAudioStore.getState();
  const targetVolume = audioState.isMuted ? 0 : audioState.volume;
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(targetVolume, now + CROSSFADE_S);

  source.connect(gain);
  gain.connect(ctx.destination);

  source.start(now, clampedTime, SNIPPET_S);

  currentSource = source;
  currentGain = gain;
  activeSnippet = { time: clampedTime, rate: velocity };

  source.onended = () => {
    if (currentSource === source) {
      currentSource = null;
      currentGain = null;
      activeSnippet = null;
    }
  };
}

function stop(): void {
  if (currentSource && currentGain) {
    fadeOutAndStop(currentSource, currentGain);
  }
  currentSource = null;
  currentGain = null;
  activeSnippet = null;
}

function getActiveSnippet(): ActiveSnippet | null {
  return activeSnippet;
}

const scrubPreview = { decode, useBuffer, play, stop, getActiveSnippet };

export { scrubPreview };
export type { ActiveSnippet };
