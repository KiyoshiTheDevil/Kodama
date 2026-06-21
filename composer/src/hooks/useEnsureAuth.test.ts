import { describe, expect, it } from "vitest";
import { isJwtFresh } from "@/hooks/useEnsureAuth";

const NOW = 1_700_000_000;

describe("isJwtFresh", () => {
  it("returns false for null expiresAt", () => {
    expect(isJwtFresh(null, NOW)).toBe(false);
  });

  it("returns false when already expired", () => {
    expect(isJwtFresh(NOW - 100, NOW)).toBe(false);
  });

  it("returns false when within the 5-minute refresh buffer", () => {
    expect(isJwtFresh(NOW + 60, NOW)).toBe(false);
    expect(isJwtFresh(NOW + 299, NOW)).toBe(false);
  });

  it("returns true when comfortably valid", () => {
    expect(isJwtFresh(NOW + 3600, NOW)).toBe(true);
  });

  it("returns true exactly past the buffer", () => {
    expect(isJwtFresh(NOW + 301, NOW)).toBe(true);
  });
});
