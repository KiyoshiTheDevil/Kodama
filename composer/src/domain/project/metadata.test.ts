import { describe, it, expect } from "vitest";
import type { ProjectMetadata } from "@/domain/project/metadata";

describe("ProjectMetadata", () => {
  it("preserves thumbnailForVideoId when set alongside thumbnailDataUrl", () => {
    const m: ProjectMetadata = {
      title: "T",
      artist: "A",
      album: "AL",
      duration: 0,
      thumbnailDataUrl: "data:image/png;base64,xyz",
      thumbnailForVideoId: "dQw4w9WgXcQ",
    };
    expect(m.thumbnailDataUrl).toBe("data:image/png;base64,xyz");
    expect(m.thumbnailForVideoId).toBe("dQw4w9WgXcQ");
  });

  it("omits thumbnailForVideoId by default", () => {
    const m: ProjectMetadata = { title: "", artist: "", album: "", duration: 0 };
    expect(m.thumbnailForVideoId).toBeUndefined();
    expect(m.thumbnailDataUrl).toBeUndefined();
  });
});

describe("ProjectMetadata: persistence invariants", () => {
  it("round-trips both thumbnail fields through JSON (the persistence path uses JSON via IndexedDB)", () => {
    const original: ProjectMetadata = {
      title: "Never Gonna Give You Up",
      artist: "Rick Astley",
      album: "Whenever You Need Somebody",
      duration: 213,
      thumbnailDataUrl: "data:image/png;base64,ABCD",
      thumbnailForVideoId: "dQw4w9WgXcQ",
    };
    const restored = JSON.parse(JSON.stringify(original)) as ProjectMetadata;
    expect(restored.thumbnailDataUrl).toBe(original.thumbnailDataUrl);
    expect(restored.thumbnailForVideoId).toBe(original.thumbnailForVideoId);
    expect(restored.title).toBe(original.title);
  });

  it("distinguishes the legacy persisted state (thumbnailDataUrl only) from the post-refactor state (both set)", () => {
    const legacy: ProjectMetadata = {
      title: "",
      artist: "",
      album: "",
      duration: 0,
      thumbnailDataUrl: "data:image/png;base64,LEGACY",
    };
    const tagged: ProjectMetadata = {
      title: "",
      artist: "",
      album: "",
      duration: 0,
      thumbnailDataUrl: "data:image/png;base64,LEGACY",
      thumbnailForVideoId: "abc123",
    };
    expect(legacy.thumbnailForVideoId).toBeUndefined();
    expect(tagged.thumbnailForVideoId).toBe("abc123");
  });
});
