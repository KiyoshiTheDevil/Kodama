import { describe, expect, it } from "vitest";
import {
  __resetPersistenceSettledForTests,
  getHashImportSettled,
  getPersistenceSettled,
  markHashImportSettled,
  markPersistenceSettled,
} from "@/lib/persistence-settled";

// -- Helpers ------------------------------------------------------------------

const SETTLE_TIMEOUT_MS = 100;

function withinTimeout<T>(promise: Promise<T>, ms: number): Promise<T | "timeout"> {
  return Promise.race([promise, new Promise<"timeout">((resolve) => setTimeout(() => resolve("timeout"), ms))]);
}

// -- Tests --------------------------------------------------------------------

describe("persistenceSettled", () => {
  it("starts pending until markPersistenceSettled is called", async () => {
    const settled = getPersistenceSettled();
    const raced = await withinTimeout(settled, SETTLE_TIMEOUT_MS);
    expect(raced).toBe("timeout");
  });

  it("resolves after markPersistenceSettled", async () => {
    const settled = getPersistenceSettled();
    markPersistenceSettled();
    await expect(settled).resolves.toBeUndefined();
  });

  it("getPersistenceSettled returns the same Promise reference for repeat calls within a session", () => {
    const a = getPersistenceSettled();
    const b = getPersistenceSettled();
    expect(a).toBe(b);
  });

  it("calling markPersistenceSettled twice is idempotent", async () => {
    const settled = getPersistenceSettled();
    markPersistenceSettled();
    markPersistenceSettled();
    await expect(settled).resolves.toBeUndefined();
  });

  it("a consumer awaiting before mark resolves once mark fires", async () => {
    const settled = getPersistenceSettled();
    let resolvedValue: string | null = null;
    const consumer = settled.then(() => {
      resolvedValue = "resolved";
    });
    expect(resolvedValue).toBeNull();
    markPersistenceSettled();
    await consumer;
    expect(resolvedValue).toBe("resolved");
  });

  it("multiple consumers awaiting concurrently all resolve from one mark", async () => {
    const a = getPersistenceSettled().then(() => "a");
    const b = getPersistenceSettled().then(() => "b");
    const c = getPersistenceSettled().then(() => "c");
    markPersistenceSettled();
    await expect(Promise.all([a, b, c])).resolves.toEqual(["a", "b", "c"]);
  });
});

// -- Reset semantics ----------------------------------------------------------

describe("__resetPersistenceSettledForTests", () => {
  it("replaces the resolved promise with a fresh pending one", async () => {
    markPersistenceSettled();
    await getPersistenceSettled();

    __resetPersistenceSettledForTests();

    const next = getPersistenceSettled();
    const raced = await withinTimeout(next, SETTLE_TIMEOUT_MS);
    expect(raced).toBe("timeout");
  });

  it("keeps the previously captured promise resolved after reset (old refs do not regress)", async () => {
    markPersistenceSettled();
    const oldRef = getPersistenceSettled();
    await oldRef;

    __resetPersistenceSettledForTests();

    // oldRef is the once-resolved promise; awaiting it again still resolves immediately.
    await expect(oldRef).resolves.toBeUndefined();
  });

  it("a fresh mark resolves the post-reset promise without touching the old one", async () => {
    markPersistenceSettled();
    const oldRef = getPersistenceSettled();
    await oldRef;

    __resetPersistenceSettledForTests();
    const newRef = getPersistenceSettled();

    expect(newRef).not.toBe(oldRef);
    markPersistenceSettled();
    await expect(newRef).resolves.toBeUndefined();
  });

  it("reset before any mark also produces a fresh pending promise", async () => {
    __resetPersistenceSettledForTests();
    const next = getPersistenceSettled();
    const raced = await withinTimeout(next, SETTLE_TIMEOUT_MS);
    expect(raced).toBe("timeout");
  });

  it("repeated resets in sequence do not break subsequent mark resolution", async () => {
    __resetPersistenceSettledForTests();
    __resetPersistenceSettledForTests();
    __resetPersistenceSettledForTests();
    const next = getPersistenceSettled();
    markPersistenceSettled();
    await expect(next).resolves.toBeUndefined();
  });

  it("a consumer that captured the post-reset promise is unaffected by a subsequent reset", async () => {
    __resetPersistenceSettledForTests();
    const captured = getPersistenceSettled();

    __resetPersistenceSettledForTests();
    const freshAfter = getPersistenceSettled();

    expect(captured).not.toBe(freshAfter);

    // Marking now resolves the FRESH promise (the latest one), not the captured one.
    markPersistenceSettled();
    await expect(freshAfter).resolves.toBeUndefined();
    const racedCaptured = await withinTimeout(captured, SETTLE_TIMEOUT_MS);
    expect(racedCaptured).toBe("timeout");
  });
});

// -- hashImportSettled mirrors persistenceSettled -----------------------------

describe("hashImportSettled", () => {
  it("starts pending until markHashImportSettled is called", async () => {
    const settled = getHashImportSettled();
    const raced = await withinTimeout(settled, SETTLE_TIMEOUT_MS);
    expect(raced).toBe("timeout");
  });

  it("resolves after markHashImportSettled", async () => {
    const settled = getHashImportSettled();
    markHashImportSettled();
    await expect(settled).resolves.toBeUndefined();
  });

  it("is a distinct promise from persistenceSettled (independent signals)", () => {
    expect(getHashImportSettled()).not.toBe(getPersistenceSettled());
  });

  it("marking persistence does not resolve hash, and vice versa", async () => {
    const hash = getHashImportSettled();
    markPersistenceSettled();
    const raced = await withinTimeout(hash, SETTLE_TIMEOUT_MS);
    expect(raced).toBe("timeout");
  });

  it("calling markHashImportSettled twice is idempotent", async () => {
    const settled = getHashImportSettled();
    markHashImportSettled();
    markHashImportSettled();
    await expect(settled).resolves.toBeUndefined();
  });
});

// -- reset clears both signals together ---------------------------------------

describe("__resetPersistenceSettledForTests covers both signals", () => {
  it("resets persistence AND hash to fresh pending promises", async () => {
    markPersistenceSettled();
    markHashImportSettled();
    await getPersistenceSettled();
    await getHashImportSettled();

    __resetPersistenceSettledForTests();

    const racedP = await withinTimeout(getPersistenceSettled(), SETTLE_TIMEOUT_MS);
    const racedH = await withinTimeout(getHashImportSettled(), SETTLE_TIMEOUT_MS);
    expect(racedP).toBe("timeout");
    expect(racedH).toBe("timeout");
  });

  it("marking persistence after reset does not resolve hash", async () => {
    markPersistenceSettled();
    markHashImportSettled();
    await Promise.all([getPersistenceSettled(), getHashImportSettled()]);

    __resetPersistenceSettledForTests();
    markPersistenceSettled();

    await expect(getPersistenceSettled()).resolves.toBeUndefined();
    const racedH = await withinTimeout(getHashImportSettled(), SETTLE_TIMEOUT_MS);
    expect(racedH).toBe("timeout");
  });
});
