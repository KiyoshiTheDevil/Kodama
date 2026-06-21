import { LandingLayout } from "@/pages/landing/landing-layout";
import { BetterLyricsPromo } from "@/pages/landing/sections/better-lyrics-promo";
import { FaqSection } from "@/pages/landing/sections/faq-section";
import { FeatureGrid } from "@/pages/landing/sections/feature-grid";
import { Hero } from "@/pages/landing/sections/hero";
import { HowItWorks } from "@/pages/landing/sections/how-it-works";
import { PageHead } from "@/seo/page-head";
import { breadcrumbListSchema, faqPageSchema, organizationSchema, softwareApplicationSchema } from "@/seo/schemas";
import {
  IconAdjustmentsHorizontal,
  IconArrowsMoveHorizontal,
  IconFileImport,
  IconHistory,
  IconLiveView,
  IconWaveSine,
} from "@tabler/icons-react";

const FAQS = [
  {
    question: "What makes Composer a real TTML editor and not just a generator?",
    answer:
      "Every word has a draggable boundary over a zoomable waveform. You can nudge timing by a single millisecond, split and merge syllables, swap agents, and edit background vocal spans in place. Generators only produce; Composer lets you shape.",
  },
  {
    question: "Can I open an existing TTML file and edit it?",
    answer:
      "Yes. Drop a TTML file in and Composer parses agents, word-level spans, background vocals, and metadata. You can refine it and re-export without losing structure.",
  },
  {
    question: "Does Composer support undo and history?",
    answer:
      "Yes. Every timing adjustment, text edit, agent change, and split or merge is undoable. History is preserved per session.",
  },
  {
    question: "Can I edit lyrics and timing at the same time?",
    answer:
      "Yes. Changing lyrics text preserves timing on matching words by content first, then by position, so your sync work survives typo fixes and spelling changes.",
  },
  {
    question: "What file formats can I import into the TTML editor?",
    answer:
      "TTML, LRC, eLRC (with inline word timing), SRT, and plain text. Composer detects the format and imports with maximum fidelity.",
  },
];

const PATH = "/ttml-editor";
const TITLE = "TTML Editor ・ Edit Timed Lyrics in Your Browser";
const DESCRIPTION =
  "A visual TTML editor with a waveform timeline, word-level timing, agent management, and history. Open, refine, and export TTML without touching XML.";

const TtmlEditorPage: React.FC = () => {
  return (
    <LandingLayout>
      <PageHead
        title={TITLE}
        description={DESCRIPTION}
        path={PATH}
        jsonLd={[
          softwareApplicationSchema("Composer TTML Editor", DESCRIPTION, PATH),
          faqPageSchema(FAQS),
          breadcrumbListSchema([
            { name: "Composer", path: "/" },
            { name: "TTML Editor", path: PATH },
          ]),
          organizationSchema(),
        ]}
      />
      <Hero
        eyebrow="Timeline ・ Waveform ・ Word-level"
        headline="A real TTML editor, not a generator."
        subhead="Open an existing TTML file, fix timing against a real waveform, and ship a clean file. Every boundary is draggable. Every change is undoable."
        primaryCta={{ label: "Open the editor", to: "/" }}
        secondaryCta={{ label: "Or make one from scratch", to: "/ttml-maker" }}
      />
      <FeatureGrid
        title="Built for refining timing, not just producing files"
        subtitle="Most TTML tools generate and hope. Composer lets you edit at the level of a single millisecond."
        features={[
          {
            icon: IconWaveSine,
            title: "Waveform timeline",
            description: "Every word sits above a real audio waveform. Drag boundaries with frame-accurate precision.",
          },
          {
            icon: IconArrowsMoveHorizontal,
            title: "Nudge timing",
            description:
              "Shift a single word by a millisecond or a whole line by a second. Keyboard-driven adjustments.",
          },
          {
            icon: IconAdjustmentsHorizontal,
            title: "Split and merge",
            description:
              "Break words into syllables for karaoke-style pacing. Merge over-segmented words back together.",
          },
          {
            icon: IconLiveView,
            title: "Live preview",
            description: "Watch the animated preview play back your edits in real time. No export required.",
          },
          {
            icon: IconHistory,
            title: "Full undo history",
            description: "Experiment freely. Every edit is reversible within the session.",
          },
          {
            icon: IconFileImport,
            title: "Import any format",
            description:
              "TTML, LRC, eLRC, SRT, plain text. Composer reads them all and gives you a single editing surface.",
          },
        ]}
      />
      <HowItWorks
        title="Open, refine, ship"
        steps={[
          {
            title: "Import your file",
            description: "Drop in a TTML, LRC, or SRT file. Composer parses timing and agents automatically.",
          },
          {
            title: "Load the audio",
            description: "Add the matching audio file so the waveform lines up with the lyric timing.",
          },
          {
            title: "Edit with precision",
            description: "Drag word boundaries, split syllables, reassign agents, and add background vocals.",
          },
          {
            title: "Export clean TTML",
            description: "Export a well-formed file ready for Apple Music, Spotify, or Better Lyrics.",
          },
        ]}
      />
      <FaqSection title="TTML editor FAQ" entries={FAQS} />
      <BetterLyricsPromo />
    </LandingLayout>
  );
};

export default TtmlEditorPage;
