import { describe, expect, it } from "vitest";
import { useSyncHandlers } from "@/hooks/useSyncHandlers";
import { usePersistence } from "@/hooks/usePersistence";
import { useImportFromHash } from "@/hooks/useImportFromHash";
import { useImportFromYouTube } from "@/hooks/useImportFromYouTube";
import { useResolveYouTubeTunnel } from "@/hooks/useResolveYouTubeTunnel";
import { useLoadYouTubeSource } from "@/hooks/useLoadYouTubeSource";

describe("hook exports", () => {
  const hooks: Array<[string, unknown]> = [
    ["useSyncHandlers", useSyncHandlers],
    ["usePersistence", usePersistence],
    ["useImportFromHash", useImportFromHash],
    ["useImportFromYouTube", useImportFromYouTube],
    ["useResolveYouTubeTunnel", useResolveYouTubeTunnel],
    ["useLoadYouTubeSource", useLoadYouTubeSource],
  ];

  for (const [name, hook] of hooks) {
    it(`${name} is a function`, () => {
      expect(typeof hook).toBe("function");
    });
  }
});
