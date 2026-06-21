import { binimumProvider } from "@/utils/lyrics-search/providers/binimum";
import { boiduLyricsProvider } from "@/utils/lyrics-search/providers/boidu-lyrics";
import { lrclibProvider } from "@/utils/lyrics-search/providers/lrclib";
import type { LyricsSearchProvider } from "@/utils/lyrics-search/types";

// -- Providers ---------------------------------------------------------------

const PROVIDERS: LyricsSearchProvider[] = [lrclibProvider, binimumProvider, boiduLyricsProvider];

// -- Public API ---------------------------------------------------------------

function getProviders(): readonly LyricsSearchProvider[] {
  return Object.freeze([...PROVIDERS]);
}

function registerProviderForTests(provider: LyricsSearchProvider): () => void {
  PROVIDERS.push(provider);
  let removed = false;
  return () => {
    if (removed) return;
    const index = PROVIDERS.indexOf(provider);
    if (index !== -1) PROVIDERS.splice(index, 1);
    removed = true;
  };
}

function snapshotProvidersForTests(): readonly LyricsSearchProvider[] {
  return [...PROVIDERS];
}

function restoreProvidersForTests(snapshot: readonly LyricsSearchProvider[]): void {
  PROVIDERS.length = 0;
  for (const provider of snapshot) PROVIDERS.push(provider);
}

// -- Exports ------------------------------------------------------------------

export { getProviders, registerProviderForTests, restoreProvidersForTests, snapshotProvidersForTests };
