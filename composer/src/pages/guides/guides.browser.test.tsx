import { describe, expect, it } from "vitest";
import { render } from "@/test/render";
import BackgroundVocalsContent from "@/pages/guides/content/background-vocals-in-ttml";
import AppleMusicLyricsContent from "@/pages/guides/content/how-to-make-apple-music-synced-lyrics";
import KaraokeContent from "@/pages/guides/content/karaoke-style-lyrics-guide";
import LrcToTtmlContent from "@/pages/guides/content/lrc-to-ttml-conversion-guide";
import MultiAgentContent from "@/pages/guides/content/multi-agent-lyrics-duets";
import TtmlSpecContent from "@/pages/guides/content/ttml-file-format-spec";
import TtmlVsLrcContent from "@/pages/guides/content/ttml-vs-lrc";
import WhatIsTtmlContent from "@/pages/guides/content/what-is-ttml";
import GuidesIndexPage from "@/pages/guides/guides-index";
import GuidePage from "@/pages/guides/guide-page";

const CONTENT_COMPONENTS = [
  ["BackgroundVocals", BackgroundVocalsContent],
  ["AppleMusicLyrics", AppleMusicLyricsContent],
  ["Karaoke", KaraokeContent],
  ["LrcToTtml", LrcToTtmlContent],
  ["MultiAgent", MultiAgentContent],
  ["TtmlSpec", TtmlSpecContent],
  ["TtmlVsLrc", TtmlVsLrcContent],
  ["WhatIsTtml", WhatIsTtmlContent],
] as const;

describe("Guide content components", () => {
  for (const [name, Content] of CONTENT_COMPONENTS) {
    it(`${name} renders prose without crashing`, async () => {
      const screen = await render(<Content />);
      expect(screen.container.textContent ?? "").not.toBe("");
    });
  }
});

describe("Guide index and page modules", () => {
  it("guides-index exports a default page component", () => {
    expect(typeof GuidesIndexPage).toBe("function");
  });

  it("guide-page exports a default page component", () => {
    expect(typeof GuidePage).toBe("function");
  });
});
