import { describe, expect, it } from "vitest";
import type { LyricsSearchProvider } from "@/utils/lyrics-search/types";
import { getProviders, registerProviderForTests } from "@/utils/lyrics-search/registry";

// -- Helpers ------------------------------------------------------------------

function makeProvider(name: "lrclib" | "binimum" | "boidu-lyrics" = "lrclib"): LyricsSearchProvider {
  return {
    name,
    sourceLabel: `Label for ${name}`,
    canSearch: () => true,
    search: async () => [],
  };
}

const BASELINE_PROVIDER_COUNT = getProviders().length;

// -- getProviders -------------------------------------------------------------

describe("getProviders", () => {
  it("returns a readonly array", () => {
    const providers = getProviders();
    expect(Array.isArray(providers)).toBe(true);
  });

  it("returns the baseline list when no additional providers are registered for tests", () => {
    expect(getProviders().length).toBe(BASELINE_PROVIDER_COUNT);
  });

  it("returns a frozen snapshot whose mutation does not affect internal state", () => {
    const provider = makeProvider();
    const unregister = registerProviderForTests(provider);
    const snapshot = getProviders();
    expect(snapshot.length).toBe(BASELINE_PROVIDER_COUNT + 1);

    expect(() => {
      (snapshot as LyricsSearchProvider[]).push(makeProvider("binimum"));
    }).toThrow();

    expect(getProviders().length).toBe(BASELINE_PROVIDER_COUNT + 1);
    unregister();
  });

  it("reflects the current list each time it is called", () => {
    const a = makeProvider("lrclib");
    const b = makeProvider("binimum");
    const unregisterA = registerProviderForTests(a);
    expect(getProviders().length).toBe(BASELINE_PROVIDER_COUNT + 1);
    const unregisterB = registerProviderForTests(b);
    expect(getProviders().length).toBe(BASELINE_PROVIDER_COUNT + 2);
    unregisterA();
    expect(getProviders().length).toBe(BASELINE_PROVIDER_COUNT + 1);
    unregisterB();
    expect(getProviders().length).toBe(BASELINE_PROVIDER_COUNT);
  });

  it("preserves registration order after the baseline", () => {
    const a = makeProvider("lrclib");
    const b = makeProvider("binimum");
    const c = makeProvider("boidu-lyrics");
    const unregisterA = registerProviderForTests(a);
    const unregisterB = registerProviderForTests(b);
    const unregisterC = registerProviderForTests(c);
    const trailing = getProviders()
      .slice(BASELINE_PROVIDER_COUNT)
      .map((p) => p.name);
    expect(trailing).toEqual(["lrclib", "binimum", "boidu-lyrics"]);
    unregisterA();
    unregisterB();
    unregisterC();
  });
});

// -- registerProviderForTests --------------------------------------------------

describe("registerProviderForTests", () => {
  it("adds a provider and returns an unregister function that removes it", () => {
    const provider = makeProvider();
    expect(getProviders().length).toBe(BASELINE_PROVIDER_COUNT);
    const unregister = registerProviderForTests(provider);
    expect(getProviders()).toContain(provider);
    unregister();
    expect(getProviders()).not.toContain(provider);
    expect(getProviders().length).toBe(BASELINE_PROVIDER_COUNT);
  });

  it("removing only the registered provider does not disturb unrelated registrations", () => {
    const a = makeProvider("lrclib");
    const b = makeProvider("binimum");
    const unregisterA = registerProviderForTests(a);
    const unregisterB = registerProviderForTests(b);
    unregisterA();
    const trailing = getProviders().slice(BASELINE_PROVIDER_COUNT);
    expect(trailing).toEqual([b]);
    unregisterB();
  });

  it("is idempotent if called twice for the same registration", () => {
    const provider = makeProvider();
    const unregister = registerProviderForTests(provider);
    unregister();
    expect(() => unregister()).not.toThrow();
    expect(getProviders().length).toBe(BASELINE_PROVIDER_COUNT);
  });
});
