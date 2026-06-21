import { describe, expect, it } from "vitest";
import { DB_NAME, DB_VERSION, PROJECT_STORE_NAME } from "@/lib/persistence-idb";
import { clearRecoveryStorage, downloadRecoveryFile, readRecoveryMetadata } from "@/lib/recovery";
import { seedProject } from "@/test/idb";

// -- Helpers ------------------------------------------------------------------

const STORE_NAME = PROJECT_STORE_NAME;
const CURRENT_KEY = "current";

function captureDownload(): { resolve: () => Promise<{ filename: string; size: number }>; cleanup: () => void } {
  let captured: { filename: string; size: number } | null = null;
  const originalCreate = document.createElement.bind(document);
  const originalAppend = document.body.appendChild.bind(document.body);

  document.createElement = ((tag: string) => {
    const el = originalCreate(tag);
    if (tag.toLowerCase() === "a") {
      const anchor = el as HTMLAnchorElement;
      const originalClick = anchor.click.bind(anchor);
      anchor.click = () => {
        captured = { filename: anchor.download, size: 0 };
        const blob = anchor.href;
        if (blob.startsWith("blob:")) {
          fetch(blob)
            .then((res) => res.blob())
            .then((b) => {
              if (captured) captured.size = b.size;
            })
            .catch(() => {});
        }
        originalClick();
      };
    }
    return el;
    // biome-ignore lint/suspicious/noExplicitAny: monkey-patch for capture
  }) as any;

  return {
    resolve: async () => {
      for (let i = 0; i < 20 && (!captured || captured.size === 0); i++) {
        await new Promise((r) => setTimeout(r, 10));
      }
      if (!captured) throw new Error("download was not triggered");
      return captured;
    },
    cleanup: () => {
      document.createElement = originalCreate;
      document.body.appendChild = originalAppend;
    },
  };
}

// -- Tests --------------------------------------------------------------------

describe("recovery", () => {
  describe("readRecoveryMetadata", () => {
    it("returns found=false when IndexedDB has no project", async () => {
      const result = await readRecoveryMetadata();
      expect(result.found).toBe(false);
      expect(result.lineCount).toBe(0);
    });

    it("returns title, line count, and savedAt from the stored project", async () => {
      await seedProject({
        version: 1,
        savedAt: 1715000000000,
        metadata: { title: "Drift" },
        lines: [
          { id: "a", text: "first", agentId: "v1" },
          { id: "b", text: "second", agentId: "v1" },
          { id: "c", text: "third", agentId: "v1" },
        ],
      });
      const result = await readRecoveryMetadata();
      expect(result.found).toBe(true);
      expect(result.title).toBe("Drift");
      expect(result.lineCount).toBe(3);
      expect(result.savedAt).toBe(1715000000000);
      expect(result.filename).toMatch(/^Drift-\d{4}-\d{2}-\d{2}\.ttml-project\.json$/);
    });

    it("falls back to 'recovered' when metadata.title is missing or empty", async () => {
      await seedProject({ version: 1, lines: [], metadata: { title: "  " } });
      const result = await readRecoveryMetadata();
      expect(result.title).toBe("recovered");
      expect(result.filename).toMatch(/^recovered-/);
    });
  });

  describe("downloadRecoveryFile", () => {
    it("triggers a file download with the project JSON when one exists", async () => {
      await seedProject({
        version: 1,
        savedAt: 1715000000000,
        metadata: { title: "Drift" },
        lines: [{ id: "a", text: "first line", agentId: "v1" }],
      });
      const capture = captureDownload();
      try {
        const result = await downloadRecoveryFile();
        expect(result.found).toBe(true);
        const dl = await capture.resolve();
        expect(dl.filename).toMatch(/^Drift-\d{4}-\d{2}-\d{2}\.ttml-project\.json$/);
        expect(dl.size).toBeGreaterThan(0);
      } finally {
        capture.cleanup();
      }
    });

    it("returns found=false without throwing when IndexedDB has no project", async () => {
      const result = await downloadRecoveryFile();
      expect(result.found).toBe(false);
    });
  });

  describe("clearRecoveryStorage", () => {
    it("wipes the projects store so a subsequent read returns found=false", async () => {
      await seedProject({
        version: 1,
        metadata: { title: "Wipe" },
        lines: [{ id: "a", text: "x", agentId: "v1" }],
      });
      expect((await readRecoveryMetadata()).found).toBe(true);
      await clearRecoveryStorage();
      expect((await readRecoveryMetadata()).found).toBe(false);
    });

    it("resolves without error when IndexedDB has no project", async () => {
      await expect(clearRecoveryStorage()).resolves.toBeUndefined();
    });
  });

  describe("cold-start schema creation", () => {
    // Regression: if recovery.ts opens IDB without onupgradeneeded on a fresh
    // browser, the DB materialises at v1 with no object store. The main app
    // would later open the same version, skip its own upgrade handler, and
    // every read/write would throw NotFoundError until site data is cleared.
    it("creates the projects store on a fresh DB so persistence can still write to it", async () => {
      expect((await readRecoveryMetadata()).found).toBe(false);

      await new Promise<void>((resolve, reject) => {
        const open = indexedDB.open(DB_NAME, DB_VERSION);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result;
          expect(db.objectStoreNames.contains(STORE_NAME)).toBe(true);
          const tx = db.transaction(STORE_NAME, "readwrite");
          tx.objectStore(STORE_NAME).put({ version: 1, lines: [], metadata: { title: "After" } }, CURRENT_KEY);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        };
      });

      const after = await readRecoveryMetadata();
      expect(after.found).toBe(true);
      expect(after.title).toBe("After");
    });
  });
});
