import { Button } from "@/ui/button";
import { IconArrowRight } from "@tabler/icons-react";
import { Link } from "react-router-dom";

interface HeroProps {
  eyebrow?: string;
  headline: string;
  subhead: string;
  primaryCta: { label: string; to: string };
  secondaryCta?: { label: string; to: string };
}

const Hero: React.FC<HeroProps> = ({ eyebrow, headline, subhead, primaryCta, secondaryCta }) => {
  return (
    <section className="px-6 pt-24 pb-20 md:pt-32 md:pb-28 max-w-5xl mx-auto text-center">
      {eyebrow ? (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 mb-6 rounded-full bg-composer-accent-dark/15 border border-composer-accent-dark/25 text-xs font-medium text-composer-accent-text select-none">
          <span className="size-1.5 rounded-full bg-composer-accent-text" />
          {eyebrow}
        </span>
      ) : null}
      <h1 className="text-4xl md:text-6xl font-semibold text-composer-text leading-tight mb-6">{headline}</h1>
      <p className="text-lg md:text-xl text-composer-text-secondary max-w-2xl mx-auto mb-10 leading-relaxed">
        {subhead}
      </p>
      <div className="flex items-center justify-center gap-3">
        <Link to={primaryCta.to}>
          <Button variant="primary" size="md" hasIcon>
            {primaryCta.label}
            <IconArrowRight size={14} />
          </Button>
        </Link>
        {secondaryCta ? (
          <Link to={secondaryCta.to}>
            <Button variant="secondary" size="md">
              {secondaryCta.label}
            </Button>
          </Link>
        ) : null}
      </div>
    </section>
  );
};

export { Hero };
