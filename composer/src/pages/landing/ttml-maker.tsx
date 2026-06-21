import { LandingLayout } from "@/pages/landing/landing-layout";
import { BetterLyricsPromo } from "@/pages/landing/sections/better-lyrics-promo";
import { FaqSection } from "@/pages/landing/sections/faq-section";
import { FeatureGrid } from "@/pages/landing/sections/feature-grid";
import { Hero } from "@/pages/landing/sections/hero";
import { HowItWorks } from "@/pages/landing/sections/how-it-works";
import { PageHead } from "@/seo/page-head";
import { breadcrumbListSchema, faqPageSchema, organizationSchema, softwareApplicationSchema } from "@/seo/schemas";
import { IconFileExport, IconHandStop, IconKeyboard, IconUsers, IconWaveSine, IconWindmill } from "@tabler/icons-react";

const FAQS = [
  {
    question: "What is a TTML maker?",
    answer:
      "A TTML maker is a tool that turns plain lyrics and an audio file into a Timed Text Markup Language file, the format used by Apple Music, Spotify, and Amazon Music for synchronized lyrics. Composer handles tap-to-sync, word-level timing, and export so you never write the XML by hand.",
  },
  {
    question: "Do I need to install anything to make a TTML file?",
    answer:
      "No. Composer runs in your browser. Drop an audio file in, paste your lyrics, sync, and download the TTML. There is no signup, no install, and your audio never leaves your machine.",
  },
  {
    question: "Can I make word-level or just line-level TTML?",
    answer:
      "Both. Start in line-sync mode to capture the skeleton, then refine into word-level timing whenever a section needs per-word animation. You can switch at any point.",
  },
  {
    question: "Does the TTML I make work with Apple Music?",
    answer:
      "Yes. Composer outputs the Apple-flavored TTML structure with ttm:agent for multi-voice lines and ttm:role for background vocals, matching what Apple Music ingests.",
  },
  {
    question: "Can I import an existing LRC or eLRC file and convert it?",
    answer:
      "Yes. Drop an LRC or eLRC file into the import view and Composer parses the timings, including inline word timestamps, so you can touch up in the timeline and export straight to TTML.",
  },
];

const PATH = "/ttml-maker";
const TITLE = "Free TTML Maker Online ・ Composer";
const DESCRIPTION =
  "Make word-level synchronized TTML lyrics in your browser. Import audio, tap to sync, edit in a timeline, and export Apple Music and Spotify ready TTML files.";

const TtmlMakerPage: React.FC = () => {
  return (
    <LandingLayout>
      <PageHead
        title={TITLE}
        description={DESCRIPTION}
        path={PATH}
        jsonLd={[
          softwareApplicationSchema("Composer TTML Maker", DESCRIPTION, PATH),
          faqPageSchema(FAQS),
          breadcrumbListSchema([
            { name: "Composer", path: "/" },
            { name: "TTML Maker", path: PATH },
          ]),
          organizationSchema(),
        ]}
      />
      <Hero
        eyebrow="Free ・ Browser based ・ No signup"
        headline="Make TTML in minutes, not hours."
        subhead="Composer turns an audio file and plain lyrics into a standard TTML file with word-level timing. Tap along to sync, fine tune in the timeline, and export."
        primaryCta={{ label: "Start making TTML", to: "/" }}
        secondaryCta={{ label: "Convert LRC instead", to: "/lrc-to-ttml" }}
      />
      <FeatureGrid
        title="Everything you need to author synced lyrics"
        subtitle="Composer is built to author the kind of TTML that Apple Music, Spotify, and Better Lyrics actually ship."
        features={[
          {
            icon: IconHandStop,
            title: "Tap to sync",
            description:
              "Play the track, tap on each word. Composer captures precise timing without you touching a timestamp.",
          },
          {
            icon: IconWaveSine,
            title: "Waveform timeline",
            description: "Drag word boundaries against a real audio waveform. Zoom in for per-syllable accuracy.",
          },
          {
            icon: IconUsers,
            title: "Multi agent duets",
            description:
              "Assign lines to different voices with ttm:agent. Duets, group vocals, and call-and-response all fit.",
          },
          {
            icon: IconWindmill,
            title: "Background vocals",
            description: "Add ad libs and background lines with ttm:role='x-bg'. Renders cleanly on Apple Music.",
          },
          {
            icon: IconKeyboard,
            title: "Keyboard first",
            description: "Every action has a remappable shortcut. Sync an entire song without leaving the keyboard.",
          },
          {
            icon: IconFileExport,
            title: "Standards compliant export",
            description: "Export valid TTML with proper namespaces. Ready for Apple Music ingestion or Better Lyrics.",
          },
        ]}
      />
      <HowItWorks
        title="From audio file to TTML in four steps"
        steps={[
          {
            title: "Drop your audio",
            description: "Upload any common audio file. Composer generates a waveform locally in your browser.",
          },
          {
            title: "Paste the lyrics",
            description: "Paste plain text, LRC, or existing TTML. Composer parses what it can and fills the rest.",
          },
          {
            title: "Sync the timing",
            description: "Use tap-to-sync for the first pass, then fine tune word boundaries in the timeline.",
          },
          {
            title: "Export TTML",
            description: "Download a valid TTML file with agents, background vocals, and per-word timing intact.",
          },
        ]}
      />
      <FaqSection title="Frequently asked questions" entries={FAQS} />
      <BetterLyricsPromo />
    </LandingLayout>
  );
};

export default TtmlMakerPage;
