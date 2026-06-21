import { LandingLayout } from "@/pages/landing/landing-layout";
import { BetterLyricsPromo } from "@/pages/landing/sections/better-lyrics-promo";
import { PageHead } from "@/seo/page-head";
import { articleSchema, breadcrumbListSchema, organizationSchema } from "@/seo/schemas";
import { Button } from "@/ui/button";
import { IconArrowRight, IconChevronLeft } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";

interface RelatedLink {
  title: string;
  path: string;
}

interface GuideLayoutProps {
  slug: string;
  title: string;
  description: string;
  datePublished: string;
  related: RelatedLink[];
  children: ReactNode;
}

const GuideLayout: React.FC<GuideLayoutProps> = ({ slug, title, description, datePublished, related, children }) => {
  const path = `/guides/${slug}`;
  return (
    <LandingLayout>
      <PageHead
        title={`${title} ・ Composer`}
        description={description}
        path={path}
        jsonLd={[
          articleSchema(title, description, path, datePublished),
          breadcrumbListSchema([
            { name: "Composer", path: "/" },
            { name: "Guides", path: "/guides" },
            { name: title, path },
          ]),
          organizationSchema(),
        ]}
      />
      <article className="px-6 py-14 max-w-3xl mx-auto">
        <Link
          to="/guides"
          className="inline-flex items-center gap-1 text-sm text-composer-text-muted hover:text-composer-text mb-8 select-none"
        >
          <IconChevronLeft size={14} />
          Back to all guides
        </Link>
        <header className="mb-10">
          <h1 className="text-3xl md:text-5xl font-semibold text-composer-text mb-5 leading-tight">{title}</h1>
          <p className="text-lg text-composer-text-secondary leading-relaxed">{description}</p>
        </header>
        <div className="prose-guide text-composer-text-secondary leading-relaxed space-y-6 select-text">{children}</div>
        <div className="mt-14 pt-10 border-t border-composer-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <span className="text-sm text-composer-text-muted">Ready to try it?</span>
          <Link to="/">
            <Button variant="primary" size="md" hasIcon>
              Open Composer
              <IconArrowRight size={14} />
            </Button>
          </Link>
        </div>
        {related.length > 0 ? (
          <aside className="mt-16">
            <h2 className="text-lg font-semibold text-composer-text mb-4">Related guides</h2>
            <ul className="space-y-2">
              {related.map((link) => (
                <li key={link.path}>
                  <Link
                    to={link.path}
                    className="text-composer-accent-text hover:text-composer-accent inline-flex items-center gap-1"
                  >
                    {link.title}
                    <IconArrowRight size={12} />
                  </Link>
                </li>
              ))}
            </ul>
          </aside>
        ) : null}
      </article>
      <BetterLyricsPromo />
    </LandingLayout>
  );
};

export { GuideLayout };
export type { RelatedLink };
