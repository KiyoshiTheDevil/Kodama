import { describe, expect, it } from "vitest";
import AppleMusicSyncedLyrics from "@/pages/landing/apple-music-synced-lyrics";
import SpotifySyncedLyrics from "@/pages/landing/spotify-synced-lyrics";
import TtmlEditor from "@/pages/landing/ttml-editor";
import TtmlGenerator from "@/pages/landing/ttml-generator";
import TtmlMaker from "@/pages/landing/ttml-maker";

describe("Landing pages", () => {
  for (const [name, Component] of [
    ["AppleMusicSyncedLyrics", AppleMusicSyncedLyrics],
    ["SpotifySyncedLyrics", SpotifySyncedLyrics],
    ["TtmlEditor", TtmlEditor],
    ["TtmlGenerator", TtmlGenerator],
    ["TtmlMaker", TtmlMaker],
  ] as const) {
    it(`${name} exports a default page component`, () => {
      expect(typeof Component).toBe("function");
    });
  }
});
