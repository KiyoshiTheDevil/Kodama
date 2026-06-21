import { GuideLayout, type RelatedLink } from "@/pages/guides/guide-layout";
import BackgroundVocalsContent from "@/pages/guides/content/background-vocals-in-ttml";
import AppleMusicSyncedLyricsContent from "@/pages/guides/content/how-to-make-apple-music-synced-lyrics";
import KaraokeStyleLyricsContent from "@/pages/guides/content/karaoke-style-lyrics-guide";
import LrcToTtmlConversionContent from "@/pages/guides/content/lrc-to-ttml-conversion-guide";
import MultiAgentDuetsContent from "@/pages/guides/content/multi-agent-lyrics-duets";
import TtmlFileFormatSpecContent from "@/pages/guides/content/ttml-file-format-spec";
import TtmlVsLrcContent from "@/pages/guides/content/ttml-vs-lrc";
import WhatIsTtmlContent from "@/pages/guides/content/what-is-ttml";
import { Navigate, useParams } from "react-router-dom";

interface GuideEntry {
  title: string;
  description: string;
  datePublished: string;
  related: RelatedLink[];
  Content: React.FC;
}

const GUIDE_ENTRIES: Record<string, GuideEntry> = {
  "what-is-ttml": {
    title: "What is TTML?",
    description:
      "A plain-English explainer of Timed Text Markup Language, the W3C format behind synced lyrics on Apple Music, Spotify, and Amazon Music.",
    datePublished: "2026-04-20",
    related: [
      { title: "TTML vs LRC", path: "/guides/ttml-vs-lrc" },
      { title: "TTML file format reference", path: "/guides/ttml-file-format-spec" },
    ],
    Content: WhatIsTtmlContent,
  },
  "ttml-vs-lrc": {
    title: "TTML vs LRC",
    description: "How the TTML and LRC formats differ, what each can express, and when to use which for synced lyrics.",
    datePublished: "2026-04-20",
    related: [
      { title: "What is TTML?", path: "/guides/what-is-ttml" },
      { title: "LRC to TTML conversion guide", path: "/guides/lrc-to-ttml-conversion-guide" },
    ],
    Content: TtmlVsLrcContent,
  },
  "ttml-file-format-spec": {
    title: "TTML File Format Reference",
    description:
      "The subset of the TTML specification you need in practice. Tags, namespaces, attributes, and examples for Apple Music.",
    datePublished: "2026-04-20",
    related: [
      { title: "What is TTML?", path: "/guides/what-is-ttml" },
      { title: "Multi-agent lyrics and duets", path: "/guides/multi-agent-lyrics-duets" },
    ],
    Content: TtmlFileFormatSpecContent,
  },
  "how-to-make-apple-music-synced-lyrics": {
    title: "How to Make Apple Music Synced Lyrics",
    description:
      "An end-to-end walkthrough for authoring Apple Music ready TTML, from audio setup to delivery-ready export.",
    datePublished: "2026-04-20",
    related: [
      { title: "Apple Music synced lyrics landing", path: "/apple-music-synced-lyrics" },
      { title: "Multi-agent lyrics and duets", path: "/guides/multi-agent-lyrics-duets" },
    ],
    Content: AppleMusicSyncedLyricsContent,
  },
  "karaoke-style-lyrics-guide": {
    title: "Karaoke-Style Lyrics Guide",
    description:
      "How to produce the bouncing-word karaoke effect: syllable splitting, pacing to the vocal onset, and held-note handling.",
    datePublished: "2026-04-20",
    related: [
      { title: "Background vocals in TTML", path: "/guides/background-vocals-in-ttml" },
      { title: "How to make Apple Music synced lyrics", path: "/guides/how-to-make-apple-music-synced-lyrics" },
    ],
    Content: KaraokeStyleLyricsContent,
  },
  "background-vocals-in-ttml": {
    title: "Background Vocals in TTML",
    description: "Use the x-bg role to add ad libs, harmonies, and backing vocals as secondary lines in a TTML file.",
    datePublished: "2026-04-20",
    related: [
      { title: "TTML file format reference", path: "/guides/ttml-file-format-spec" },
      { title: "Multi-agent lyrics and duets", path: "/guides/multi-agent-lyrics-duets" },
    ],
    Content: BackgroundVocalsContent,
  },
  "multi-agent-lyrics-duets": {
    title: "Multi-Agent Lyrics and Duets",
    description:
      "Assign lines to different vocalists using ttm:agent. Covers duets, features, group vocals, and overlapping lines.",
    datePublished: "2026-04-20",
    related: [
      { title: "TTML file format reference", path: "/guides/ttml-file-format-spec" },
      { title: "Background vocals in TTML", path: "/guides/background-vocals-in-ttml" },
    ],
    Content: MultiAgentDuetsContent,
  },
  "lrc-to-ttml-conversion-guide": {
    title: "LRC to TTML Conversion Guide",
    description:
      "A deep dive on converting plain LRC and enhanced LRC into clean TTML. Covers format differences, metadata, and edge cases.",
    datePublished: "2026-04-20",
    related: [
      { title: "LRC to TTML converter", path: "/lrc-to-ttml" },
      { title: "TTML vs LRC", path: "/guides/ttml-vs-lrc" },
    ],
    Content: LrcToTtmlConversionContent,
  },
};

const GuidePage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const entry = slug ? GUIDE_ENTRIES[slug] : undefined;

  if (!slug || !entry) {
    return <Navigate to="/guides" replace />;
  }

  const { title, description, datePublished, related, Content } = entry;

  return (
    <GuideLayout slug={slug} title={title} description={description} datePublished={datePublished} related={related}>
      <Content />
    </GuideLayout>
  );
};

export default GuidePage;
