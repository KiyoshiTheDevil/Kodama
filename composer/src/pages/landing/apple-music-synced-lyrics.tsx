import { LandingLayout } from "@/pages/landing/landing-layout";
import { BetterLyricsPromo } from "@/pages/landing/sections/better-lyrics-promo";
import { FaqSection } from "@/pages/landing/sections/faq-section";
import { FeatureGrid } from "@/pages/landing/sections/feature-grid";
import { Hero } from "@/pages/landing/sections/hero";
import { HowItWorks } from "@/pages/landing/sections/how-it-works";
import { PageHead } from "@/seo/page-head";
import { breadcrumbListSchema, faqPageSchema, organizationSchema, softwareApplicationSchema } from "@/seo/schemas";
import {
  IconBrandApple,
  IconMicrophone2,
  IconUsers,
  IconWaveSine,
  IconWindmill,
  IconWriting,
} from "@tabler/icons-react";

const FAQS = [
  {
    question: "What format does Apple Music use for synced lyrics?",
    answer:
      "Apple Music uses TTML (Timed Text Markup Language) with word-level spans, ttm:agent declarations for multi-voice songs, and ttm:role='x-bg' for background vocals. Composer produces exactly this structure.",
  },
  {
    question: "How do I submit synced lyrics to Apple Music?",
    answer:
      "Rights holders submit lyrics through Apple's Content Collector tools or directly via an aggregator. Composer handles the authoring side; the platform you use for delivery to Apple handles ingestion.",
  },
  {
    question: "Can Composer handle duets and featured artists?",
    answer:
      "Yes. Every line is assigned to an agent. Add as many agents as the song needs, including 'person', 'group', or 'character' types, and Composer serializes them into the TTML ttm:agent metadata Apple Music expects.",
  },
  {
    question: "How are background vocals and ad libs represented?",
    answer:
      "Composer wraps them in a ttm:role='x-bg' container span. Inner word spans carry the timing. This matches the structure Apple Music uses for the smaller, muted lyric line shown alongside the main line.",
  },
  {
    question: "Do I need to time every single word for Apple Music?",
    answer:
      "Apple Music supports both line-synced and word-synced lyrics. Word-synced gets the animated 'sing-along' presentation. Composer lets you choose the granularity and switch whenever you want.",
  },
];

const PATH = "/apple-music-synced-lyrics";
const TITLE = "Make Apple Music Synced Lyrics ・ Composer";
const DESCRIPTION =
  "Author Apple Music ready synced lyrics. Multi-agent duets, background vocals, word-level timing, and correct TTML output all in one browser tool.";

const AppleMusicLyricsPage: React.FC = () => {
  return (
    <LandingLayout>
      <PageHead
        title={TITLE}
        description={DESCRIPTION}
        path={PATH}
        jsonLd={[
          softwareApplicationSchema("Composer for Apple Music Synced Lyrics", DESCRIPTION, PATH),
          faqPageSchema(FAQS),
          breadcrumbListSchema([
            { name: "Composer", path: "/" },
            { name: "Apple Music Synced Lyrics", path: PATH },
          ]),
          organizationSchema(),
        ]}
      />
      <Hero
        eyebrow="For Apple Music ready TTML"
        headline="Author the exact TTML Apple Music expects."
        subhead="Composer handles multi-agent duets, background vocals with x-bg, and word-level timing the way Apple Music ingests it. No XML, no guesswork."
        primaryCta={{ label: "Start authoring", to: "/" }}
        secondaryCta={{ label: "See the guide", to: "/guides/how-to-make-apple-music-synced-lyrics" }}
      />
      <FeatureGrid
        title="Everything Apple Music lyrics need, in one editor"
        subtitle="Apple Music has specific TTML requirements. Composer meets them by default."
        features={[
          {
            icon: IconBrandApple,
            title: "Apple Music schema",
            description:
              "Every export includes the xml, ttml, and ttm namespaces and agents exactly as Apple Music ingests them.",
          },
          {
            icon: IconUsers,
            title: "Agents for duets",
            description: "Assign each line to a named agent. Duets, group vocals, and featured verses carry correctly.",
          },
          {
            icon: IconWindmill,
            title: "Background vocals",
            description: "Add x-bg spans with their own word-level timing, matching how Apple Music renders ad libs.",
          },
          {
            icon: IconWaveSine,
            title: "Millisecond precision",
            description:
              "Drag word boundaries against the waveform. Apple Music expects precise timing; Composer delivers it.",
          },
          {
            icon: IconMicrophone2,
            title: "Line and word sync",
            description:
              "Use line-sync for a first pass, then upgrade specific lines to word sync where it matters most.",
          },
          {
            icon: IconWriting,
            title: "Edit existing TTML",
            description: "Import Apple Music TTML you already have and refine without losing structure or metadata.",
          },
        ]}
      />
      <HowItWorks
        title="Authoring flow for Apple Music"
        steps={[
          {
            title: "Set up the song",
            description: "Add the audio, paste the lyrics, and define agents for every vocalist on the track.",
          },
          {
            title: "Assign lines to agents",
            description: "Tag each line with the correct voice. Composer writes ttm:agent for you.",
          },
          {
            title: "Sync timing",
            description: "Tap through the track, then refine word boundaries for the sing-along sections.",
          },
          {
            title: "Add background vocals",
            description: "Mark ad libs and backing parts with x-bg so Apple Music shows them as the secondary lyric.",
          },
        ]}
      />
      <FaqSection title="Apple Music synced lyrics FAQ" entries={FAQS} />
      <BetterLyricsPromo />
    </LandingLayout>
  );
};

export default AppleMusicLyricsPage;
