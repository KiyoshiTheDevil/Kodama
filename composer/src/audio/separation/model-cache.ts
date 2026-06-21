import type { ModelDescriptor } from "@/audio/separation/model-registry";

const CACHE_NAME = "composer-vocal-model-v1";

type DownloadProgress = (loaded: number, total: number) => void;

async function hasCachedModel(model: ModelDescriptor): Promise<boolean> {
  if (typeof caches === "undefined") return false;
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(model.url);
  return hit !== undefined;
}

async function readCachedModel(model: ModelDescriptor): Promise<ArrayBuffer | null> {
  if (typeof caches === "undefined") return null;
  const cache = await caches.open(CACHE_NAME);
  const hit = await cache.match(model.url);
  if (!hit) return null;
  return hit.arrayBuffer();
}

async function fetchAndCacheModel(
  model: ModelDescriptor,
  signal: AbortSignal,
  onProgress: DownloadProgress,
): Promise<ArrayBuffer> {
  const response = await fetch(model.url, { signal });
  if (!response.ok) {
    throw new Error(`Model fetch failed (${response.status} ${response.statusText})`);
  }

  const contentLengthHeader = response.headers.get("content-length");
  const total = contentLengthHeader ? Number(contentLengthHeader) : model.approxBytes;

  const reader = response.body?.getReader();
  if (!reader) {
    const buf = await response.arrayBuffer();
    onProgress(buf.byteLength, buf.byteLength);
    if (typeof caches !== "undefined") {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(model.url, new Response(buf, { headers: { "content-type": "application/octet-stream" } }));
    }
    return buf;
  }

  const chunks: Uint8Array[] = [];
  let loaded = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (signal.aborted) {
      reader.cancel().catch(() => {});
      throw new DOMException("Aborted", "AbortError");
    }
    if (done) break;
    if (value) {
      chunks.push(value);
      loaded += value.byteLength;
      onProgress(loaded, total);
    }
  }

  const merged = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  if (typeof caches !== "undefined") {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(model.url, new Response(merged, { headers: { "content-type": "application/octet-stream" } }));
  }

  return merged.buffer;
}

export { hasCachedModel, readCachedModel, fetchAndCacheModel };
export type { DownloadProgress };
