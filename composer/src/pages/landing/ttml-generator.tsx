import { LandingLayout } from "@/pages/landing/landing-layout";
import { BetterLyricsPromo } from "@/pages/landing/sections/better-lyrics-promo";
import { FaqSection } from "@/pages/landing/sections/faq-section";
import { FeatureGrid } from "@/pages/landing/sections/feature-grid";
import { Hero } from "@/pages/landing/sections/hero";
import { HowItWorks } from "@/pages/landing/sections/how-it-works";
import { PageHead } from "@/seo/page-head";
import { breadcrumbListSchema, faqPageSchema, organizationSchema, softwareApplicationSchema } from "@/seo/schemas";
import { IconBolt, IconDownload, IconFileCheck, IconHandStop, IconLanguage, IconMusic } from "@tabler/icons-react";

const FAQS = [
  {
    question: "What does a TTML generator do?",
    answer:
      "It turns audio and text into a Timed Text Markup Language file. Composer captures timing as you tap along with the track, then serializes a valid TTML document complete with agent metadata and word-level spans.",
  },
  {
    question: "Can I generate TTML without timing anything myself?",
    answer:
      "If you already have timing data in LRC, eLRC, SRT, or a source TTML, Composer maps it to the target TTML structure automatically. For fresh lyrics you still need to tap to sync, but it takes minutes, not hours.",
  },
  {
    question: "Is the generated TTML valid for Apple Music and Spotify?",
    answer:
      "Yes. The output includes the xml, ttml, and ttm namespaces, agent declarations, and the span structure these services expect.",
  },
  {
    question: "Can Composer generate word-level timing automatically from a single line tap?",
    answer:
      "Yes. If you only tap line begins, Composer distributes word timing proportionally to character length. You can then refine whichever words need fixing.",
  },
  {
    question: "Does the generator support non-English lyrics?",
    answer:
      "Yes. Composer treats word splits based on whitespace and user-defined split characters, so it handles most languages with word-based scripts.",
  },
];

const PATH = "/ttml-generator";
const TITLE = "TTML Generator Online ・ Free, No Signup";
const DESCRIPTION =
  "Generate word-level TTML files from audio and lyrics in your browser. Tap-to-sync, automatic word distribution, and Apple Music ready output.";

const TtmlGeneratorPage: React.FC = () => {
  return (
    <LandingLayout>
      <PageHead
        title={TITLE}
        description={DESCRIPTION}
        path={PATH}
        jsonLd={[
          softwareApplicationSchema("Composer TTML Generator", DESCRIPTION, PATH),
          faqPageSchema(FAQS),
          breadcrumbListSchema([
            { name: "Composer", path: "/" },
            { name: "TTML Generator", path: PATH },
          ]),
          organizationSchema(),
        ]}
      />
      <Hero
        eyebrow="Fast path ・ Browser based"
        headline="Generate TTML from audio and lyrics."
        subhead="Paste lyrics, load audio, tap along to mark timing, and Composer generates a valid TTML file you can download immediately."
        primaryCta={{ label: "Generate TTML now", to: "/" }}
        secondaryCta={{ label: "Or convert existing LRC", to: "/lrc-to-ttml" }}
      />
      <FeatureGrid
        title="The fastest path from text to timed TTML"
        features={[
          {
            icon: IconBolt,
            title: "Tap-driven sync",
            description: "Hit a key on each word. Composer records timing in real time as the audio plays.",
          },
          {
            icon: IconHandStop,
            title: "Line-first workflow",
            description: "Tap line begins only. Composer distributes word timing automatically based on word length.",
          },
          {
            icon: IconMusic,
            title: "Any audio source",
            description: "Works with MP3, WAV, FLAC, M4A, and more. Processed locally, never uploaded.",
          },
          {
            icon: IconFileCheck,
            title: "Valid output",
            description: "Generated TTML includes all required namespaces, agents, and metadata.",
          },
          {
            icon: IconLanguage,
            title: "Language agnostic",
            description:
              "Works with any language that uses whitespace-separated words, plus configurable split characters.",
          },
          {
            icon: IconDownload,
            title: "One-click download",
            description: "Export the final TTML as a single file. No signup, no account, no watermark.",
          },
        ]}
      />
      <HowItWorks
        title="How the TTML generator works"
        steps={[
          {
            title: "Add audio and lyrics",
            description: "Load any audio file and paste your lyrics text. Composer prepares a waveform locally.",
          },
          {
            title: "Tap to capture timing",
            description: "Play the audio and tap on each line or word. Composer records timestamps as you go.",
          },
          {
            title: "Refine if needed",
            description: "Drag boundaries in the timeline for any section that feels off.",
          },
          {
            title: "Download the TTML",
            description: "Export a standard TTML file ready for Apple Music, Spotify, or Better Lyrics.",
          },
        ]}
      />
      <FaqSection title="TTML generator FAQ" entries={FAQS} />
      <BetterLyricsPromo />
    </LandingLayout>
  );
};

export default TtmlGeneratorPage;
