import { ErrorFallback } from "@/pages/error-fallback";
import type { RouteRecord } from "vite-react-ssg";

const GUIDE_SLUGS = [
  "what-is-ttml",
  "ttml-vs-lrc",
  "ttml-file-format-spec",
  "how-to-make-apple-music-synced-lyrics",
  "karaoke-style-lyrics-guide",
  "background-vocals-in-ttml",
  "multi-agent-lyrics-duets",
  "lrc-to-ttml-conversion-guide",
] as const;

const errorElement = <ErrorFallback />;

const routes: RouteRecord[] = [
  {
    path: "/",
    lazy: async () => ({ Component: (await import("@/pages/home")).default }),
    entry: "src/pages/home.tsx",
    errorElement,
  },
  {
    path: "/ttml-maker",
    lazy: async () => ({ Component: (await import("@/pages/landing/ttml-maker")).default }),
    entry: "src/pages/landing/ttml-maker.tsx",
    errorElement,
  },
  {
    path: "/ttml-editor",
    lazy: async () => ({ Component: (await import("@/pages/landing/ttml-editor")).default }),
    entry: "src/pages/landing/ttml-editor.tsx",
    errorElement,
  },
  {
    path: "/ttml-generator",
    lazy: async () => ({ Component: (await import("@/pages/landing/ttml-generator")).default }),
    entry: "src/pages/landing/ttml-generator.tsx",
    errorElement,
  },
  {
    path: "/apple-music-synced-lyrics",
    lazy: async () => ({
      Component: (await import("@/pages/landing/apple-music-synced-lyrics")).default,
    }),
    entry: "src/pages/landing/apple-music-synced-lyrics.tsx",
    errorElement,
  },
  {
    path: "/spotify-synced-lyrics",
    lazy: async () => ({
      Component: (await import("@/pages/landing/spotify-synced-lyrics")).default,
    }),
    entry: "src/pages/landing/spotify-synced-lyrics.tsx",
    errorElement,
  },
  {
    path: "/lrc-to-ttml",
    lazy: async () => ({ Component: (await import("@/pages/converters/lrc-to-ttml")).default }),
    entry: "src/pages/converters/lrc-to-ttml.tsx",
    errorElement,
  },
  {
    path: "/srt-to-ttml",
    lazy: async () => ({ Component: (await import("@/pages/converters/srt-to-ttml")).default }),
    entry: "src/pages/converters/srt-to-ttml.tsx",
    errorElement,
  },
  {
    path: "/guides",
    lazy: async () => ({ Component: (await import("@/pages/guides/guides-index")).default }),
    entry: "src/pages/guides/guides-index.tsx",
    errorElement,
  },
  {
    path: "/guides/:slug",
    lazy: async () => ({ Component: (await import("@/pages/guides/guide-page")).default }),
    entry: "src/pages/guides/guide-page.tsx",
    getStaticPaths: () => GUIDE_SLUGS.map((slug) => `/guides/${slug}`),
    errorElement,
  },
  {
    path: "/recover",
    lazy: async () => ({ Component: (await import("@/pages/recover")).default }),
    entry: "src/pages/recover.tsx",
    errorElement,
  },
  {
    path: "*",
    element: errorElement,
  },
];

export { routes };
