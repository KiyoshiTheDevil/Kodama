import { LandingLayout } from "@/pages/landing/landing-layout";
import { BetterLyricsPromo } from "@/pages/landing/sections/better-lyrics-promo";
import { FaqSection } from "@/pages/landing/sections/faq-section";
import { ConverterView, type ConvertArgs } from "@/pages/converters/converter-view";
import { PageHead } from "@/seo/page-head";
import { breadcrumbListSchema, faqPageSchema, howToSchema, organizationSchema } from "@/seo/schemas";
import type { Agent } from "@/domain/agent/model";
import type { ProjectMetadata } from "@/domain/project/metadata";
import { parseLyricsFile } from "@/utils/lyrics-parsers";
import { generateTTML } from "@/utils/ttml";
import { useCallback } from "react";

const SAMPLE_LRC = `[ti:Sample Song]
[ar:Sample Artist]
[00:00.50]<00:00.50>First <00:01.00>line <00:01.50>with <00:02.00>word <00:02.50>timing<00:03.00>
[00:03.00]<00:03.00>Second <00:03.80>line<00:04.50>`;

const FAQS = [
  {
    question: "What is the difference between LRC and TTML?",
    answer:
      "LRC is a plain-text lyric format with line-level timestamps like [00:12.34]. Enhanced LRC adds inline per-word timestamps. TTML is an XML-based standard used by Apple Music, Spotify, and other streaming services. TTML supports multi-agent metadata, background vocals, and structured timing that LRC cannot express.",
  },
  {
    question: "Does this converter handle enhanced LRC (eLRC) with word-level timing?",
    answer:
      "Yes. Composer detects inline word timestamps of the form <mm:ss.xx> and converts them into TTML word-level spans with correct begin and end attributes. The output TTML preserves every word boundary your eLRC defined.",
  },
  {
    question: "Is my LRC file uploaded anywhere?",
    answer: "No. The entire conversion happens locally in your browser. Nothing is sent to a server.",
  },
  {
    question: "What do I do if I need to adjust timing after converting?",
    answer:
      "Click 'Open in Composer' and the converted project opens inside the full editor. You can load the matching audio file, nudge timing against the waveform, and export again.",
  },
  {
    question: "Can I convert LRC metadata like [ti:] and [ar:] too?",
    answer:
      "Yes. Composer maps the LRC metadata tags to the TTML metadata block so title and artist survive the conversion.",
  },
];

const PATH = "/lrc-to-ttml";
const TITLE = "LRC to TTML Converter ・ Supports eLRC Word Timing";
const DESCRIPTION =
  "Convert LRC and enhanced LRC (eLRC) files to Apple Music ready TTML in your browser. Inline word timestamps become TTML word-level spans. Free, no signup.";

const HOW_TO_STEPS = [
  { name: "Paste your LRC", text: "Paste your LRC or eLRC file content into the input box." },
  { name: "Review the TTML", text: "Composer produces TTML output on the right as you paste." },
  {
    name: "Download or refine",
    text: "Download the TTML, or open it in Composer to refine timing against an audio waveform.",
  },
];

function convertLrc({ input, filename }: ConvertArgs): { ttml: string; projectPayload: string } | { error: string } {
  try {
    const result = parseLyricsFile(filename.endsWith(".lrc") ? filename : "input.lrc", input);
    if (result.lines.length === 0) {
      return { error: "No timed lines found. Make sure your LRC contains [mm:ss.xx] timestamps." };
    }
    const metadata: ProjectMetadata = {
      title: result.metadata.title ?? "",
      artist: result.metadata.artist ?? "",
      album: result.metadata.album ?? "",
      duration: 0,
      language: result.metadata.language,
    };
    const agents: Agent[] = result.agents ?? [{ id: "v1", type: "person", name: "Voice 1" }];
    const granularity = result.lines.some((line) => line.words?.length) ? "word" : "line";
    const ttml = generateTTML({ metadata, agents, lines: result.lines, granularity });
    const projectPayload = JSON.stringify({ metadata, agents, lines: result.lines, granularity });
    return { ttml, projectPayload };
  } catch (conversionError) {
    console.error("[Composer] LRC conversion failed", conversionError);
    return { error: "Could not parse LRC. Check the input format." };
  }
}

const LrcToTtmlPage: React.FC = () => {
  const convert = useCallback(convertLrc, []);

  return (
    <LandingLayout>
      <PageHead
        title={TITLE}
        description={DESCRIPTION}
        path={PATH}
        jsonLd={[
          faqPageSchema(FAQS),
          howToSchema("Convert LRC to TTML online", DESCRIPTION, HOW_TO_STEPS),
          breadcrumbListSchema([
            { name: "Composer", path: "/" },
            { name: "LRC to TTML", path: PATH },
          ]),
          organizationSchema(),
        ]}
      />
      <ConverterView
        title="LRC to TTML Converter"
        inputLabel="Paste LRC or eLRC"
        inputPlaceholder="[ti:Song title]&#10;[00:12.34]Sample lyric line"
        sampleInput={SAMPLE_LRC}
        convert={convert}
        downloadFilename="lyrics.ttml"
      />
      <section className="px-6 py-14 max-w-3xl mx-auto text-composer-text-secondary leading-relaxed space-y-5">
        <h2 className="text-2xl font-semibold text-composer-text">About LRC and eLRC</h2>
        <p>
          LRC is the most common lyric file format for line-synced playback. Each line begins with a timestamp in square
          brackets, like <code className="font-mono text-composer-accent-text">[00:12.34]</code>. Enhanced LRC, usually
          called eLRC, adds inline per-word timestamps in angle brackets:
          <code className="font-mono text-composer-accent-text"> &lt;00:12.34&gt;Hello &lt;00:12.80&gt;world</code>.
        </p>
        <p>
          TTML, the target format here, is the W3C Timed Text Markup Language. Apple Music, Spotify, and Amazon Music
          all use TTML for synchronized lyrics. A TTML file wraps each line in a
          <code className="font-mono text-composer-accent-text"> &lt;p&gt; </code>element with begin and end attributes,
          and optionally nests
          <code className="font-mono text-composer-accent-text"> &lt;span&gt; </code>elements for word-level timing.
        </p>
        <p>
          When this converter sees inline word timestamps in your LRC input, it writes one TTML span per word with
          correct begin and end attributes. Plain LRC files without inline word timing produce line-synced TTML.
        </p>
        <p>
          Need a deeper dive? Read the{" "}
          <a href="/guides/ttml-vs-lrc" className="text-composer-accent-text hover:text-composer-accent">
            TTML vs LRC comparison
          </a>{" "}
          or the{" "}
          <a
            href="/guides/lrc-to-ttml-conversion-guide"
            className="text-composer-accent-text hover:text-composer-accent"
          >
            full LRC to TTML conversion guide
          </a>
          .
        </p>
      </section>
      <FaqSection title="LRC to TTML FAQ" entries={FAQS} />
      <BetterLyricsPromo />
    </LandingLayout>
  );
};

export default LrcToTtmlPage;
