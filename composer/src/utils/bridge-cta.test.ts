import { beforeEach, describe, expect, it } from "vitest";
import { DEFAULTS, useSettingsStore } from "@/stores/settings";
import { shouldShowBridgeCta } from "@/utils/bridge-cta";
import { BridgeError } from "@/utils/composer-bridge-api";

// -- Setup --------------------------------------------------------------------

beforeEach(() => {
  useSettingsStore.setState({ ...DEFAULTS });
});

// -- Tests --------------------------------------------------------------------

describe("shouldShowBridgeCta", () => {
  describe("happy path", () => {
    it("returns true on a generic cobalt error when bridge is disabled", () => {
      expect(shouldShowBridgeCta(new Error("cobalt http 500"))).toBe(true);
    });

    it("returns true regardless of the specific cobalt error type", () => {
      const causes: unknown[] = [
        new Error("network failure"),
        new TypeError("fetch failed"),
        { code: "anti_bot" },
        new DOMException("custom", "AbortError"),
        "raw string thrown",
        undefined,
      ];
      for (const cause of causes) {
        expect(shouldShowBridgeCta(cause)).toBe(true);
      }
    });
  });

  describe("suppression: bridge enabled", () => {
    it("returns false when youtubeBridge experiment is enabled", () => {
      useSettingsStore.setState({ experiments: { youtubeBridge: true } });
      expect(shouldShowBridgeCta(new Error("cobalt http 500"))).toBe(false);
    });
  });

  describe("suppression: error came from bridge", () => {
    it("returns false when cause is a BridgeError so we don't suggest the broken thing as the fix", () => {
      expect(shouldShowBridgeCta(new BridgeError("unreachable", "bridge unreachable"))).toBe(false);
    });

    it("treats every BridgeError code the same way", () => {
      const codes: Array<"unreachable" | "http" | "empty" | "timeout"> = ["unreachable", "http", "empty", "timeout"];
      for (const code of codes) {
        expect(shouldShowBridgeCta(new BridgeError(code, code))).toBe(false);
      }
    });
  });

  describe("invariants", () => {
    it("bridge-error suppression beats bridge-enabled (no ambiguity in either order)", () => {
      useSettingsStore.setState({ experiments: { youtubeBridge: true } });
      expect(shouldShowBridgeCta(new BridgeError("http", "boom"))).toBe(false);
    });

    it("does not mutate settings while reading them", () => {
      const before = { ...useSettingsStore.getState() };
      shouldShowBridgeCta(new Error("cobalt http 500"));
      const after = useSettingsStore.getState();
      expect(after.experiments).toEqual(before.experiments);
    });
  });
});
