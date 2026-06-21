import { LandingLayout } from "@/pages/landing/landing-layout";
import { BetterLyricsPromo } from "@/pages/landing/sections/better-lyrics-promo";
import { FaqSection } from "@/pages/landing/sections/faq-section";
import { FeatureGrid } from "@/pages/landing/sections/feature-grid";
import { Hero } from "@/pages/landing/sections/hero";
import { HowItWorks } from "@/pages/landing/sections/how-it-works";
import { PageHead } from "@/seo/page-head";
import { breadcrumbListSchema, faqPageSchema, organizationSchema, softwareApplicationSchema } from "@/seo/schemas";
import {
  IconBrandSpotify,
  IconFileMusic,
  IconHandStop,
  IconListTree,
  IconRefresh,
  IconWaveSine,
} from "@tabler/icons-react";

const FAQS = [
  {
    question: "Does Spotify use TTML for synced lyrics?",
    answer:
      "Spotify's lyrics infrastructure accepts TTML as part of its standard lyrics ingestion. Composer produces standards-compliant TTML that downstream aggregators can package for Spotify delivery.",
  },
  {
    question: "How do I get synced lyrics on Spotify?",
    answer:
      "Lyrics are typically delivered to Spotify through Musixmatch or other licensed partners. Composer authors the TTML; your distribution partner handles delivery. For independent releases, check with your distributor about their lyrics submission workflow.",
  },
  {
    question: "What granularity does Spotify support?",
    answer:
      "Both line-synced and word-synced lyrics are supported. Word-synced produces the animated highlighting you see during playback. Composer lets you mix granularities on the same song.",
  },
  {
    question: "Can I author TTML for Spotify without also producing an LRC file?",
    answer:
      "Yes. TTML is a superset of what LRC expresses, so a well-formed TTML file is sufficient. If you also need LRC for another service, Composer exports straight from the same project.",
  },
  {
    question: "How is Spotify TTML different from Apple Music TTML?",
    answer:
      "The core structure is the same. Apple Music uses more extensions for background vocals and agents; Spotify lyrics tend to be simpler in practice. Composer can produce either profile from one project.",
  },
];

const PATH = "/spotify-synced-lyrics";
const TITLE = "Make Spotify Synced Lyrics ・ Composer";
const DESCRIPTION =
  "Create Spotify ready synced lyrics in TTML. Line-synced and word-synced output, clean export, and a visual timeline editor.";

const SpotifyLyricsPage: React.FC = () => {
  return (
    <LandingLayout>
      <PageHead
        title={TITLE}
        description={DESCRIPTION}
        path={PATH}
        jsonLd={[
          softwareApplicationSchema("Composer for Spotify Synced Lyrics", DESCRIPTION, PATH),
          faqPageSchema(FAQS),
          breadcrumbListSchema([
            { name: "Composer", path: "/" },
            { name: "Spotify Synced Lyrics", path: PATH },
          ]),
          organizationSchema(),
        ]}
      />
      <Hero
        eyebrow="Spotify ready TTML"
        headline="Sync lyrics for Spotify without writing XML."
        subhead="Composer produces clean, standards-compliant TTML files ready for Spotify's lyrics pipeline. Tap to sync, adjust against a waveform, export."
        primaryCta={{ label: "Start authoring", to: "/" }}
        secondaryCta={{ label: "What is TTML?", to: "/guides/what-is-ttml" }}
      />
      <FeatureGrid
        title="What you get with Composer for Spotify lyrics"
        features={[
          {
            icon: IconBrandSpotify,
            title: "Spotify compatible TTML",
            description: "Outputs the standard TTML profile your distribution partner expects.",
          },
          {
            icon: IconHandStop,
            title: "Tap-to-sync",
            description: "Capture line and word timing in real time as the track plays.",
          },
          {
            icon: IconWaveSine,
            title: "Waveform editor",
            description: "Adjust timing visually against the actual audio waveform, not a timestamp list.",
          },
          {
            icon: IconListTree,
            title: "Line or word granularity",
            description: "Pick the level of sync that fits the song. Mix both on the same file.",
          },
          {
            icon: IconFileMusic,
            title: "Multi-format import",
            description: "Start from existing LRC, SRT, TTML, or plain text. Composer figures out the rest.",
          },
          {
            icon: IconRefresh,
            title: "Iterate without losing work",
            description: "Edit lyrics while preserving timing on matching words. Full undo history per session.",
          },
        ]}
      />
      <HowItWorks
        title="Authoring flow for Spotify"
        steps={[
          {
            title: "Set up the track",
            description: "Load the audio file and paste the lyrics into Composer.",
          },
          {
            title: "Choose your granularity",
            description: "Start line-synced for a quick pass. Upgrade to word-level for high-profile tracks.",
          },
          {
            title: "Refine in the timeline",
            description: "Drag boundaries against the waveform until timing feels right on playback.",
          },
          {
            title: "Export and deliver",
            description: "Download the TTML and hand it to your distribution partner for Spotify delivery.",
          },
        ]}
      />
      <FaqSection title="Spotify synced lyrics FAQ" entries={FAQS} />
      <BetterLyricsPromo />
    </LandingLayout>
  );
};

export default SpotifyLyricsPage;
