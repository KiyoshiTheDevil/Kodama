import { scrubPreview } from "@/audio/scrub-preview";
import { scrubStemRouter } from "@/audio/scrub-stem-router";
import { bufferToBlobUrl, makeSineBuffer } from "@/test/audio-fixtures";
import { allowConsole } from "@/test/console-guard";
import { afterEach, describe, expect, test } from "vitest";

describe("scrub-stem-router", () => {
  afterEach(() => {
    scrubStemRouter.clearCache();
    scrubPreview.stop();
    scrubPreview.useBuffer(null);
  });

  describe("happy path", () => {
    test("setOriginalBuffer + selectStem('original') routes to scrubPreview", () => {
      const buf = makeSineBuffer(1);
      scrubStemRouter.setOriginalBuffer(buf);
      scrubStemRouter.selectStem("original", () => undefined);
      expect(scrubStemRouter.getActiveStem()).toBe("original");
      scrubPreview.play(0.5, 1);
      const snippet = scrubPreview.getActiveSnippet();
      expect(snippet).not.toBeNull();
      expect(snippet?.time).toBe(0.5);
      expect(snippet?.rate).toBe(1);
    });
  });

  describe("edge cases", () => {
    test("setOriginalBuffer(null) clears scrubPreview if original was active", () => {
      const buf = makeSineBuffer(1);
      scrubStemRouter.setOriginalBuffer(buf);
      scrubStemRouter.selectStem("original", () => undefined);
      expect(scrubStemRouter.getActiveStem()).toBe("original");
      scrubStemRouter.setOriginalBuffer(null);
      expect(scrubStemRouter.getActiveStem()).toBeNull();
      scrubPreview.play(0.5, 1);
      expect(scrubPreview.getActiveSnippet()).toBeNull();
    });

    test("getActiveStem is null before any buffer is set", () => {
      expect(scrubStemRouter.getActiveStem()).toBeNull();
    });
  });

  describe("invariants", () => {
    test("setOriginalBuffer does not steal routing when a stem is already active", async () => {
      const vocalsBuf = makeSineBuffer(1);
      scrubStemRouter.setOriginalBuffer(makeSineBuffer(1));
      scrubStemRouter.selectStem("original", () => undefined);
      const vocalsUrl = bufferToBlobUrl(vocalsBuf);
      scrubStemRouter.selectStem("vocals", () => vocalsUrl);
      await expect.poll(() => scrubStemRouter.getActiveStem(), { timeout: 5000 }).toBe("vocals");
      scrubStemRouter.setOriginalBuffer(makeSineBuffer(1));
      expect(scrubStemRouter.getActiveStem()).toBe("vocals");
      URL.revokeObjectURL(vocalsUrl);
    });

    test("clearCache resets activeStem regardless of which stem was active", async () => {
      const vocalsBuf = makeSineBuffer(1);
      const vocalsUrl = bufferToBlobUrl(vocalsBuf);
      scrubStemRouter.setOriginalBuffer(makeSineBuffer(1));
      scrubStemRouter.selectStem("vocals", () => vocalsUrl);
      await expect.poll(() => scrubStemRouter.getActiveStem(), { timeout: 5000 }).toBe("vocals");
      scrubStemRouter.clearCache();
      expect(scrubStemRouter.getActiveStem()).toBeNull();
      URL.revokeObjectURL(vocalsUrl);
    });

    test("selectStem('original') before setOriginalBuffer waits, then activates on setOriginalBuffer", () => {
      scrubStemRouter.selectStem("original", () => undefined);
      expect(scrubStemRouter.getActiveStem()).toBeNull();
      const buf = makeSineBuffer(1);
      scrubStemRouter.setOriginalBuffer(buf);
      expect(scrubStemRouter.getActiveStem()).toBe("original");
      scrubPreview.play(0.3, 1);
      expect(scrubPreview.getActiveSnippet()?.time).toBe(0.3);
    });

    test("selectStem('original') deactivates a non-original stem when original is uncached", async () => {
      const vocalsUrl = bufferToBlobUrl(makeSineBuffer(1));
      scrubStemRouter.setOriginalBuffer(makeSineBuffer(1));
      scrubStemRouter.selectStem("vocals", () => vocalsUrl);
      await expect.poll(() => scrubStemRouter.getActiveStem(), { timeout: 5000 }).toBe("vocals");

      scrubStemRouter.setOriginalBuffer(null);
      expect(scrubStemRouter.getActiveStem()).toBe("vocals");

      scrubStemRouter.selectStem("original", () => undefined);
      expect(scrubStemRouter.getActiveStem()).toBeNull();
      scrubPreview.play(0.5, 1);
      expect(scrubPreview.getActiveSnippet()).toBeNull();

      URL.revokeObjectURL(vocalsUrl);
    });
  });

  describe("uncached fetch path", () => {
    test("selectStem('vocals') fetches and decodes the URL on cache miss", async () => {
      scrubStemRouter.setOriginalBuffer(makeSineBuffer(1));
      const vocalsBuf = makeSineBuffer(1);
      const vocalsUrl = bufferToBlobUrl(vocalsBuf);

      scrubStemRouter.selectStem("vocals", () => vocalsUrl);
      await expect.poll(() => scrubStemRouter.getActiveStem(), { timeout: 5000 }).toBe("vocals");

      scrubPreview.play(0.5, 1);
      const snippet = scrubPreview.getActiveSnippet();
      expect(snippet?.time).toBe(0.5);
      expect(snippet?.rate).toBe(1);

      URL.revokeObjectURL(vocalsUrl);
    });

    test("selectStem('vocals') with no URL provider warns and stays on previous stem", () => {
      scrubStemRouter.setOriginalBuffer(makeSineBuffer(1));
      scrubStemRouter.selectStem("original", () => undefined);
      expect(scrubStemRouter.getActiveStem()).toBe("original");

      allowConsole(/\[ScrubStemRouter\]/);
      scrubStemRouter.selectStem("vocals", () => undefined);
      expect(scrubStemRouter.getActiveStem()).toBe("original");
    });

    test("selectStem('instrumental') routes to scrubPreview after decode", async () => {
      scrubStemRouter.setOriginalBuffer(makeSineBuffer(1));
      const instrUrl = bufferToBlobUrl(makeSineBuffer(1));

      scrubStemRouter.selectStem("instrumental", () => instrUrl);
      await expect.poll(() => scrubStemRouter.getActiveStem(), { timeout: 5000 }).toBe("instrumental");

      scrubPreview.play(0.2, 1);
      expect(scrubPreview.getActiveSnippet()?.time).toBe(0.2);

      URL.revokeObjectURL(instrUrl);
    });
  });

  describe("cache hit", () => {
    test("re-selecting a stem uses the cached buffer (no second URL call)", async () => {
      scrubStemRouter.setOriginalBuffer(makeSineBuffer(1));
      const vocalsUrl = bufferToBlobUrl(makeSineBuffer(1));

      let urlCalls = 0;
      const getVocalsUrl = () => {
        urlCalls += 1;
        return vocalsUrl;
      };

      scrubStemRouter.selectStem("vocals", getVocalsUrl);
      await expect.poll(() => scrubStemRouter.getActiveStem(), { timeout: 5000 }).toBe("vocals");
      expect(urlCalls).toBe(1);

      scrubStemRouter.selectStem("original", () => undefined);
      expect(scrubStemRouter.getActiveStem()).toBe("original");

      scrubStemRouter.selectStem("vocals", getVocalsUrl);
      expect(scrubStemRouter.getActiveStem()).toBe("vocals");
      expect(urlCalls).toBe(1);

      URL.revokeObjectURL(vocalsUrl);
    });

    test("re-selecting the currently-active stem is a no-op (does not stop mid-scrub)", async () => {
      scrubStemRouter.setOriginalBuffer(makeSineBuffer(1));
      const vocalsUrl = bufferToBlobUrl(makeSineBuffer(1));

      scrubStemRouter.selectStem("vocals", () => vocalsUrl);
      await expect.poll(() => scrubStemRouter.getActiveStem(), { timeout: 5000 }).toBe("vocals");

      scrubPreview.play(0.5, 1);
      const before = scrubPreview.getActiveSnippet();
      expect(before).not.toBeNull();

      scrubStemRouter.selectStem("vocals", () => vocalsUrl);
      const after = scrubPreview.getActiveSnippet();
      expect(after?.time).toBe(before?.time);
      expect(after?.rate).toBe(before?.rate);

      URL.revokeObjectURL(vocalsUrl);
    });
  });

  describe("clearCache", () => {
    test("clearCache invalidates the cache and forces refetch on next selectStem", async () => {
      scrubStemRouter.setOriginalBuffer(makeSineBuffer(1));
      const vocalsUrl = bufferToBlobUrl(makeSineBuffer(1));

      let urlCalls = 0;
      const getVocalsUrl = () => {
        urlCalls += 1;
        return vocalsUrl;
      };

      scrubStemRouter.selectStem("vocals", getVocalsUrl);
      await expect.poll(() => scrubStemRouter.getActiveStem()).toBe("vocals");
      expect(urlCalls).toBe(1);

      scrubStemRouter.clearCache();
      expect(scrubStemRouter.getActiveStem()).toBeNull();

      scrubStemRouter.setOriginalBuffer(makeSineBuffer(1));
      scrubStemRouter.selectStem("vocals", getVocalsUrl);
      await expect.poll(() => scrubStemRouter.getActiveStem(), { timeout: 5000 }).toBe("vocals");
      expect(urlCalls).toBe(2);

      URL.revokeObjectURL(vocalsUrl);
    });

    test("clearCache leaves scrubPreview with no active buffer", () => {
      scrubStemRouter.setOriginalBuffer(makeSineBuffer(1));
      scrubStemRouter.selectStem("original", () => undefined);
      expect(scrubStemRouter.getActiveStem()).toBe("original");

      scrubStemRouter.clearCache();
      scrubPreview.play(0.5, 1);
      expect(scrubPreview.getActiveSnippet()).toBeNull();
    });
  });

  describe("race protection", () => {
    test("rapid switch only applies the latest selection", async () => {
      scrubStemRouter.setOriginalBuffer(makeSineBuffer(1));
      const vocalsUrl = bufferToBlobUrl(makeSineBuffer(1));
      const instrumentalUrl = bufferToBlobUrl(makeSineBuffer(1));

      scrubStemRouter.selectStem("vocals", () => vocalsUrl);
      scrubStemRouter.selectStem("instrumental", () => instrumentalUrl);

      await expect.poll(() => scrubStemRouter.getActiveStem(), { timeout: 5000 }).toBe("instrumental");

      URL.revokeObjectURL(vocalsUrl);
      URL.revokeObjectURL(instrumentalUrl);
    });

    test("three rapid switches converge on the third stem", async () => {
      scrubStemRouter.setOriginalBuffer(makeSineBuffer(1));
      const vocalsUrl = bufferToBlobUrl(makeSineBuffer(1));
      const instrumentalUrl = bufferToBlobUrl(makeSineBuffer(1));

      scrubStemRouter.selectStem("vocals", () => vocalsUrl);
      scrubStemRouter.selectStem("instrumental", () => instrumentalUrl);
      scrubStemRouter.selectStem("original", () => undefined);

      expect(scrubStemRouter.getActiveStem()).toBe("original");

      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(scrubStemRouter.getActiveStem()).toBe("original");

      URL.revokeObjectURL(vocalsUrl);
      URL.revokeObjectURL(instrumentalUrl);
    });
  });

  describe("decode failure", () => {
    test("garbage blob URL leaves the previous active stem in place", async () => {
      scrubStemRouter.setOriginalBuffer(makeSineBuffer(1));
      scrubStemRouter.selectStem("original", () => undefined);
      expect(scrubStemRouter.getActiveStem()).toBe("original");

      const garbageBlob = new Blob([new Uint8Array([1, 2, 3, 4, 5])], { type: "audio/wav" });
      const garbageUrl = URL.createObjectURL(garbageBlob);

      allowConsole(/\[ScrubStemRouter\]/);
      scrubStemRouter.selectStem("vocals", () => garbageUrl);

      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(scrubStemRouter.getActiveStem()).toBe("original");

      URL.revokeObjectURL(garbageUrl);
    });

    test("decode failure does not poison the cache for the failed stem", async () => {
      scrubStemRouter.setOriginalBuffer(makeSineBuffer(1));
      scrubStemRouter.selectStem("original", () => undefined);

      const garbageUrl = URL.createObjectURL(new Blob([new Uint8Array([0, 0, 0, 0])], { type: "audio/wav" }));
      allowConsole(/\[ScrubStemRouter\]/);
      scrubStemRouter.selectStem("vocals", () => garbageUrl);
      await new Promise((resolve) => setTimeout(resolve, 200));
      expect(scrubStemRouter.getActiveStem()).toBe("original");

      URL.revokeObjectURL(garbageUrl);
      const validUrl = bufferToBlobUrl(makeSineBuffer(1));
      scrubStemRouter.selectStem("vocals", () => validUrl);
      await expect.poll(() => scrubStemRouter.getActiveStem(), { timeout: 5000 }).toBe("vocals");

      URL.revokeObjectURL(validUrl);
    });
  });
});
