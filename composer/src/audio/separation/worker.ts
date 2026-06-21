/// <reference lib="webworker" />
// biome-ignore organizeImports: the webworker triple-slash reference must stay before imports.
import { type Chunk, SEGMENT_SAMPLES, chunkCount, iterateChunks, stitchChunks } from "@/audio/separation/chunker";
import { MAGSPEC_DIMS, computeMagspec } from "@/audio/separation/demucs-spec";
import { denormalizeDemucsOutput, extractVocalsStem, normalizeForDemucs } from "@/audio/separation/demucs-postprocess";
import { fetchAndCacheModel, hasCachedModel, readCachedModel } from "@/audio/separation/model-cache";
import { getModelDescriptor } from "@/audio/separation/model-registry";
import type { VocalModelVariant } from "@/stores/settings";

// HTDemucs ONNX I/O contract (matches sevagh/demucs.onnx export):
//   inputs:
//     "input": [1, 2, 343980]      stereo waveform @ 44.1 kHz, 7.8 s
//     "x":     [1, 4, 2048, 336]   pre-computed magspec (L_re, L_im, R_re, R_im)
//   outputs:
//     "output": [1, 4, 4, 2048, 336]  separated spectrogram branch
//     "add_67": [1, 4, 2, 343980]     separated time branch
//                                     stem order: drums, bass, other, vocals
const FREQ_OUTPUT_NAME = "output";
const TIME_OUTPUT_NAME = "add_67";
const WAVEFORM_INPUT_NAME = "input";
const MAGSPEC_INPUT_NAME = "x";

declare const self: DedicatedWorkerGlobalScope;

type InboundMessage =
  | { type: "init"; variant: VocalModelVariant; forceWasm?: boolean }
  | { type: "process"; channels: Float32Array[]; totalFrames: number }
  | { type: "cancel" };

type OutboundMessage =
  | { type: "init-progress"; loaded: number; total: number }
  | { type: "init-done" }
  | { type: "process-progress"; processed: number; total: number }
  | { type: "process-done"; vocals: Float32Array[]; numChannels: number; totalFrames: number }
  | { type: "cancelled" }
  | { type: "error"; code: string; message: string };

interface Ort {
  InferenceSession: {
    create(
      bytes: ArrayBuffer | Uint8Array,
      opts: { executionProviders: string[]; graphOptimizationLevel?: string },
    ): Promise<OrtSession>;
  };
  Tensor: new (dtype: "float32", data: Float32Array, dims: number[]) => OrtTensor;
  env: { wasm: { wasmPaths?: string; numThreads?: number } };
}

interface OrtTensor {
  data: Float32Array;
  dims: number[];
}

interface OrtSession {
  inputNames: string[];
  outputNames: string[];
  run(feeds: Record<string, OrtTensor>): Promise<Record<string, OrtTensor>>;
  release?(): Promise<void>;
}

let ort: Ort | null = null;
let session: OrtSession | null = null;
let cancelled = false;

function post(message: OutboundMessage, transfer?: Transferable[]) {
  self.postMessage(message, transfer ?? []);
}

async function loadOrt(forceWasm: boolean | undefined): Promise<Ort> {
  if (ort) return ort;
  const mod = forceWasm
    ? await import("onnxruntime-web")
    : await import("onnxruntime-web/webgpu").catch(() => import("onnxruntime-web"));
  const candidate = (mod as unknown as { default?: Ort }).default ?? (mod as unknown as Ort);
  candidate.env.wasm.numThreads = 1;
  candidate.env.wasm.wasmPaths = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${getOrtVersion()}/dist/`;
  ort = candidate;
  return candidate;
}

function getOrtVersion(): string {
  return "1.26.0";
}

async function handleInit(variant: VocalModelVariant, forceWasm?: boolean) {
  cancelled = false;
  const descriptor = getModelDescriptor(variant);
  if (!descriptor) {
    post({ type: "error", code: "no-base-url", message: "VITE_VOCAL_MODEL_BASE_URL is not configured." });
    return;
  }

  let modelBytes: ArrayBuffer;
  if (await hasCachedModel(descriptor)) {
    const cached = await readCachedModel(descriptor);
    if (!cached) {
      post({ type: "error", code: "fetch-failed", message: "Model cache hit but read failed." });
      return;
    }
    modelBytes = cached;
    post({ type: "init-progress", loaded: cached.byteLength, total: cached.byteLength });
  } else {
    const ac = new AbortController();
    const onCancel = () => ac.abort();
    cancelHandlers.add(onCancel);
    try {
      modelBytes = await fetchAndCacheModel(descriptor, ac.signal, (loaded, total) => {
        post({ type: "init-progress", loaded, total });
      });
    } catch (err) {
      if (cancelled || (err as Error)?.name === "AbortError") {
        post({ type: "cancelled" });
        return;
      }
      post({ type: "error", code: "fetch-failed", message: (err as Error).message });
      return;
    } finally {
      cancelHandlers.delete(onCancel);
    }
  }

  try {
    const runtime = await loadOrt(forceWasm);
    const providers = forceWasm ? ["wasm"] : ["webgpu", "wasm"];
    session = await runtime.InferenceSession.create(modelBytes, {
      executionProviders: providers,
      graphOptimizationLevel: "all",
    });
    post({ type: "init-done" });
  } catch (err) {
    post({ type: "error", code: "ort-failed", message: (err as Error).message });
  }
}

const cancelHandlers = new Set<() => void>();

async function handleProcess(channels: Float32Array[], totalFrames: number) {
  if (!session || !ort) {
    post({ type: "error", code: "ort-failed", message: "Session not initialized." });
    return;
  }
  if (channels.length !== 2) {
    post({
      type: "error",
      code: "ort-failed",
      message: `HTDemucs requires stereo input (got ${channels.length} channels).`,
    });
    return;
  }
  cancelled = false;
  const totalChunks = chunkCount(totalFrames);
  const vocalChunks: Chunk[] = [];
  const normalized = normalizeForDemucs(channels, totalFrames);

  let chunkIndex = 0;
  for (const chunk of iterateChunks(normalized.channels)) {
    if (cancelled) {
      post({ type: "cancelled" });
      return;
    }

    // Build "input" waveform tensor: [1, 2, 343980], laid out [L..., R...].
    const waveformFlat = new Float32Array(2 * SEGMENT_SAMPLES);
    waveformFlat.set(chunk.data[0], 0);
    waveformFlat.set(chunk.data[1], SEGMENT_SAMPLES);
    const waveformTensor = new ort.Tensor("float32", waveformFlat, [1, 2, SEGMENT_SAMPLES]);

    // Build "x" magspec tensor: [1, 4, 2048, 336].
    let magspecFlat: Float32Array;
    try {
      magspecFlat = computeMagspec(chunk.data);
    } catch (err) {
      post({ type: "error", code: "ort-failed", message: (err as Error).message });
      return;
    }
    const magspecTensor = new ort.Tensor("float32", magspecFlat, [...MAGSPEC_DIMS]);

    let result: Record<string, OrtTensor>;
    try {
      result = await session.run({
        [WAVEFORM_INPUT_NAME]: waveformTensor,
        [MAGSPEC_INPUT_NAME]: magspecTensor,
      });
    } catch (err) {
      post({ type: "error", code: "ort-failed", message: (err as Error).message });
      return;
    }

    const timeTensor = result[TIME_OUTPUT_NAME];
    const freqTensor = result[FREQ_OUTPUT_NAME];
    if (!timeTensor || !freqTensor) {
      post({
        type: "error",
        code: "ort-failed",
        message: `Missing output tensor ${!timeTensor ? TIME_OUTPUT_NAME : FREQ_OUTPUT_NAME}. Available: ${Object.keys(result).join(", ")}`,
      });
      return;
    }
    const vocalsChannels = extractVocalsStem(timeTensor, freqTensor);
    vocalChunks.push({ start: chunk.start, end: chunk.end, data: vocalsChannels });

    chunkIndex++;
    post({ type: "process-progress", processed: chunkIndex, total: totalChunks });
  }

  const stitched = denormalizeDemucsOutput(stitchChunks(vocalChunks, totalFrames, channels.length), normalized);

  // Drop GPU/CPU resources tied to the model session before we hand the result
  // back. The host terminates the worker immediately after process-done, but
  // releasing the session explicitly also covers the keep-worker-alive case
  // and helps WebGPU EP flush its buffer pool.
  try {
    await session.release?.();
  } catch {}
  session = null;

  const transfers: Transferable[] = stitched.map((c) => c.buffer);
  post(
    {
      type: "process-done",
      vocals: stitched,
      numChannels: channels.length,
      totalFrames,
    },
    transfers,
  );
}

self.addEventListener("message", (ev: MessageEvent<InboundMessage>) => {
  const msg = ev.data;
  if (msg.type === "init") {
    handleInit(msg.variant, msg.forceWasm);
  } else if (msg.type === "process") {
    handleProcess(msg.channels, msg.totalFrames);
  } else if (msg.type === "cancel") {
    cancelled = true;
    for (const h of cancelHandlers) h();
  }
});

export type { InboundMessage, OutboundMessage };
