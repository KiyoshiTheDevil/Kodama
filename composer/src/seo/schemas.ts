const SITE_ORIGIN = "https://composer.boidu.dev";
const SITE_NAME = "Composer";
const ORG_NAME = "Better Lyrics";
const ORG_URL = "https://better-lyrics.boidu.dev";

interface FaqEntry {
  question: string;
  answer: string;
}

interface HowToStep {
  name: string;
  text: string;
}

interface BreadcrumbEntry {
  name: string;
  path: string;
}

function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: ORG_NAME,
    url: ORG_URL,
    sameAs: [SITE_ORIGIN, "https://better-lyrics-docs.boidu.dev", "https://blog.boidu.dev"],
  };
}

function softwareApplicationSchema(name: string, description: string, url: string) {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name,
    url: `${SITE_ORIGIN}${url}`,
    description,
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Any",
    browserRequirements: "Requires a modern web browser with JavaScript enabled",
    offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
    publisher: { "@type": "Organization", name: ORG_NAME, url: ORG_URL },
  };
}

function faqPageSchema(entries: FaqEntry[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entries.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: { "@type": "Answer", text: entry.answer },
    })),
  };
}

function howToSchema(name: string, description: string, steps: HowToStep[]) {
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name,
    description,
    step: steps.map((step, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: step.name,
      text: step.text,
    })),
  };
}

function articleSchema(title: string, description: string, url: string, datePublished: string) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    url: `${SITE_ORIGIN}${url}`,
    datePublished,
    author: { "@type": "Organization", name: ORG_NAME, url: ORG_URL },
    publisher: {
      "@type": "Organization",
      name: SITE_NAME,
      logo: { "@type": "ImageObject", url: `${SITE_ORIGIN}/logo.svg` },
    },
  };
}

function breadcrumbListSchema(crumbs: BreadcrumbEntry[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: `${SITE_ORIGIN}${crumb.path}`,
    })),
  };
}

export {
  articleSchema,
  breadcrumbListSchema,
  faqPageSchema,
  howToSchema,
  organizationSchema,
  SITE_ORIGIN,
  softwareApplicationSchema,
};
export type { FaqEntry };
