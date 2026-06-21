import { LandingLayout } from "@/pages/landing/landing-layout";
import { BetterLyricsPromo } from "@/pages/landing/sections/better-lyrics-promo";
import { PageHead } from "@/seo/page-head";
import { breadcrumbListSchema, organizationSchema } from "@/seo/schemas";
import { IconArrowRight } from "@tabler/icons-react";
import { Link } from "react-router-dom";

interface GuideListing {
  slug: string;
  title: string;
  description: string;
}

const GUIDES: GuideListing[] = [
  {
    slug: "what-is-ttml",
    title: "What is TTML?",
    description: "The timed-text format behind synced lyrics on Apple Music, Spotify, and Amazon Music.",
  },
  {
    slug: "ttml-vs-lrc",
    title: "TTML vs LRC",
    description: "When to use each, how they differ, and how to convert between them.",
  },
  {
    slug: "ttml-file-format-spec",
    title: "TTML File Format Reference",
    description: "Tags, namespaces, attributes, and examples for the TTML profile Apple Music uses.",
  },
  {
    slug: "how-to-make-apple-music-synced-lyrics",
    title: "How to Make Apple Music Synced Lyrics",
    description: "End-to-end workflow for authoring Apple Music ready TTML with agents and background vocals.",
  },
  {
    slug: "karaoke-style-lyrics-guide",
    title: "Karaoke-Style Lyrics Guide",
    description: "Split words into syllables, pace timing, and produce the bouncing-word effect users love.",
  },
  {
    slug: "background-vocals-in-ttml",
    title: "Background Vocals in TTML",
    description: "Use the x-bg role to add ad libs and backing parts as secondary lines.",
  },
  {
    slug: "multi-agent-lyrics-duets",
    title: "Multi-Agent Lyrics and Duets",
    description: "Assign lines to multiple vocalists using ttm:agent for duets, features, and group parts.",
  },
  {
    slug: "lrc-to-ttml-conversion-guide",
    title: "LRC to TTML Conversion Guide",
    description: "Deep dive on converting plain LRC and enhanced LRC into clean TTML you can ship.",
  },
];

const PATH = "/guides";
const TITLE = "TTML and Synced Lyrics Guides ・ Composer";
const DESCRIPTION =
  "Guides for authoring TTML synced lyrics. TTML fundamentals, format reference, platform workflows, and conversion deep dives.";

const GuidesIndexPage: React.FC = () => {
  return (
    <LandingLayout>
      <PageHead
        title={TITLE}
        description={DESCRIPTION}
        path={PATH}
        jsonLd={[
          breadcrumbListSchema([
            { name: "Composer", path: "/" },
            { name: "Guides", path: PATH },
          ]),
          organizationSchema(),
        ]}
      />
      <section className="px-6 py-16 md:py-24 max-w-4xl mx-auto">
        <p className="text-xs font-medium tracking-wide text-composer-accent-text mb-4 select-none">Guides</p>
        <h1 className="text-3xl md:text-5xl font-semibold text-composer-text mb-5">
          Learn TTML and synced lyrics authoring.
        </h1>
        <p className="text-lg text-composer-text-secondary max-w-2xl">
          Everything you need to ship great synced lyrics. Start with the fundamentals, then move into platform-specific
          workflows and advanced techniques.
        </p>
      </section>
      <section className="px-6 pb-20 max-w-4xl mx-auto">
        <ul className="divide-y divide-composer-border border-y border-composer-border">
          {GUIDES.map((guide) => (
            <li key={guide.slug}>
              <Link
                to={`/guides/${guide.slug}`}
                className="group flex items-center justify-between gap-5 py-5 hover:bg-composer-bg-elevated/50 transition-colors px-2 -mx-2 rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-semibold text-composer-text mb-1">{guide.title}</h2>
                  <p className="text-sm text-composer-text-secondary">{guide.description}</p>
                </div>
                <IconArrowRight
                  size={18}
                  className="text-composer-text-muted group-hover:text-composer-accent-text transition-colors flex-shrink-0"
                />
              </Link>
            </li>
          ))}
        </ul>
      </section>
      <BetterLyricsPromo />
    </LandingLayout>
  );
};

export { GUIDES };
export default GuidesIndexPage;
export type { GuideListing };
