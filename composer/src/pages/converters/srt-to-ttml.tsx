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

const SAMPLE_SRT = `1
00:00:00,500 --> 00:00:03,000
First subtitle line

2
00:00:03,000 --> 00:00:04,500
Second subtitle line`;

const FAQS = [
  {
    question: "Why convert SRT subtitles to TTML?",
    answer:
      "SRT is the common subtitle format for video captions. Streaming music services like Apple Music and Spotify expect TTML for synced lyrics. If your source timing lives in an SRT file, this converter gives you a matching TTML file in one step.",
  },
  {
    question: "Does SRT support word-level timing?",
    answer:
      "No. SRT is strictly line-level (or cue-level). The converter produces line-synced TTML that matches the source cue timing.",
  },
  {
    question: "What happens to HTML tags and styling in SRT cues?",
    answer:
      "Composer strips HTML tags like <i> and <font> from cue text before creating TTML. Only the cue text and timing are preserved.",
  },
  {
    question: "Can I upgrade the converted TTML to word-level timing later?",
    answer:
      "Yes. Open the converted project in Composer, load your audio, and use the tap-to-sync flow to capture per-word timing for the sections that need it.",
  },
  {
    question: "Is the SRT file uploaded anywhere?",
    answer: "No. Conversion happens entirely in your browser. The input and output never leave your machine.",
  },
];

const PATH = "/srt-to-ttml";
const TITLE = "SRT to TTML Converter ・ Free, Browser Based";
const DESCRIPTION =
  "Convert SRT subtitle files to TTML in your browser. Line-level timing is mapped directly into a clean TTML document. Free, no signup, no upload.";

const HOW_TO_STEPS = [
  { name: "Paste your SRT", text: "Paste your SRT file content into the input area." },
  { name: "Get TTML", text: "TTML output appears on the right as you paste." },
  {
    name: "Download or refine",
    text: "Download the TTML or open the project in Composer to upgrade to word-level timing.",
  },
];

function convertSrt({ input, filename }: ConvertArgs): { ttml: string; projectPayload: string } | { error: string } {
  try {
    const result = parseLyricsFile(filename.endsWith(".srt") ? filename : "input.srt", input);
    if (result.lines.length === 0) {
      return { error: "No subtitle cues found. Check that your input uses standard SRT formatting." };
    }
    const metadata: ProjectMetadata = {
      title: result.metadata.title ?? "",
      artist: result.metadata.artist ?? "",
      album: result.metadata.album ?? "",
      duration: 0,
      language: result.metadata.language,
    };
    const agents: Agent[] = result.agents ?? [{ id: "v1", type: "person", name: "Voice 1" }];
    const ttml = generateTTML({ metadata, agents, lines: result.lines, granularity: "line" });
    const projectPayload = JSON.stringify({ metadata, agents, lines: result.lines, granularity: "line" });
    return { ttml, projectPayload };
  } catch (conversionError) {
    console.error("[Composer] SRT conversion failed", conversionError);
    return { error: "Could not parse SRT. Check the input format." };
  }
}

const SrtToTtmlPage: React.FC = () => {
  const convert = useCallback(convertSrt, []);

  return (
    <LandingLayout>
      <PageHead
        title={TITLE}
        description={DESCRIPTION}
        path={PATH}
        jsonLd={[
          faqPageSchema(FAQS),
          howToSchema("Convert SRT to TTML online", DESCRIPTION, HOW_TO_STEPS),
          breadcrumbListSchema([
            { name: "Composer", path: "/" },
            { name: "SRT to TTML", path: PATH },
          ]),
          organizationSchema(),
        ]}
      />
      <ConverterView
        title="SRT to TTML Converter"
        inputLabel="Paste SRT"
        inputPlaceholder="1&#10;00:00:00,500 --> 00:00:03,000&#10;First cue text"
        sampleInput={SAMPLE_SRT}
        convert={convert}
        downloadFilename="lyrics.ttml"
      />
      <section className="px-6 py-14 max-w-3xl mx-auto text-composer-text-secondary leading-relaxed space-y-5">
        <h2 className="text-2xl font-semibold text-composer-text">About SRT and TTML</h2>
        <p>
          SRT (SubRip) is the most widely used subtitle format. Each cue has a sequential index, a start and end
          timestamp, and one or more lines of text. SRT timing is cue-level; there is no concept of per-word timing.
        </p>
        <p>
          TTML, the target of this converter, is the W3C Timed Text Markup Language. It expresses line-level and
          word-level timing, multi-voice agents, and background vocals. Apple Music, Spotify, and Amazon Music all rely
          on TTML for their synced lyrics features.
        </p>
        <p>
          This converter maps each SRT cue into a single TTML{" "}
          <code className="font-mono text-composer-accent-text">&lt;p&gt;</code> element with begin and end attributes.
          To upgrade the file to word-level timing, open it in Composer and resync against your audio.
        </p>
      </section>
      <FaqSection title="SRT to TTML FAQ" entries={FAQS} />
      <BetterLyricsPromo />
    </LandingLayout>
  );
};

export default SrtToTtmlPage;
