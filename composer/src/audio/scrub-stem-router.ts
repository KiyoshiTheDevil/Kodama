import { scrubPreview } from "@/audio/scrub-preview";
import type { Stem } from "@/audio/separation/types";

// -- Constants -----------------------------------------------------------------
const LOG_PREFIX = "[ScrubStemRouter]";

// -- State ---------------------------------------------------------------------
const cache: Map<Stem, AudioBuffer> = new Map();
let activeStem: Stem | null = null;
let selectionToken = 0;

// -- Helpers -------------------------------------------------------------------
function activate(stem: Stem, buf: AudioBuffer): void {
  scrubPreview.useBuffer(buf);
  activeStem = stem;
}

function deactivate(): void {
  scrubPreview.useBuffer(null);
  activeStem = null;
}

async function fetchAndDecode(url: string): Promise<AudioBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`fetch failed: ${response.status} ${response.statusText}`);
  }
  const bytes = await response.arrayBuffer();
  return scrubPreview.decode(bytes);
}

// -- Public API ----------------------------------------------------------------
function setOriginalBuffer(buffer: AudioBuffer | null): void {
  if (buffer) {
    cache.set("original", buffer);
    if (activeStem === "original" || activeStem === null) {
      activate("original", buffer);
    }
    return;
  }
  cache.delete("original");
  if (activeStem === "original") {
    deactivate();
  }
}

function selectStem(stem: Stem, getUrl: () => string | undefined): void {
  selectionToken += 1;
  const myToken = selectionToken;

  if (stem === activeStem) {
    const alreadyRouted = cache.get(stem);
    if (alreadyRouted) return;
  }
  const cached = cache.get(stem);
  if (cached) {
    activate(stem, cached);
    return;
  }
  if (stem === "original") {
    if (activeStem !== null) deactivate();
    return;
  }

  const url = getUrl();
  if (!url) {
    console.warn(LOG_PREFIX, `no URL provided for stem "${stem}"; staying on previous stem`);
    return;
  }

  void fetchAndDecode(url)
    .then((buf) => {
      if (myToken !== selectionToken) return;
      cache.set(stem, buf);
      activate(stem, buf);
    })
    .catch((err) => {
      if (myToken !== selectionToken) return;
      console.warn(LOG_PREFIX, `failed to load stem "${stem}":`, err);
    });
}

function clearCache(): void {
  cache.clear();
  activeStem = null;
  selectionToken += 1;
  scrubPreview.useBuffer(null);
}

function getActiveStem(): Stem | null {
  return activeStem;
}

const scrubStemRouter = { setOriginalBuffer, selectStem, clearCache, getActiveStem };

export { scrubStemRouter };
