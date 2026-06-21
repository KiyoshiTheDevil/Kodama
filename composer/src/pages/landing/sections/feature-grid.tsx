import type { IconProps } from "@tabler/icons-react";
import type { ComponentType } from "react";

interface FeatureCard {
  icon: ComponentType<IconProps>;
  title: string;
  description: string;
}

interface FeatureGridProps {
  title: string;
  subtitle?: string;
  features: FeatureCard[];
}

const FeatureGrid: React.FC<FeatureGridProps> = ({ title, subtitle, features }) => {
  return (
    <section className="px-6 py-20 max-w-6xl mx-auto">
      <div className="text-center mb-14">
        <h2 className="text-3xl md:text-4xl font-semibold text-composer-text mb-4">{title}</h2>
        {subtitle ? <p className="text-composer-text-secondary max-w-2xl mx-auto">{subtitle}</p> : null}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {features.map((feature) => (
          <div key={feature.title} className="rounded-xl bg-composer-bg-elevated border border-composer-border p-6">
            <div className="inline-flex items-center justify-center size-10 rounded-lg bg-composer-accent-dark/20 text-composer-accent-text mb-4">
              <feature.icon size={20} stroke={1.75} />
            </div>
            <h3 className="text-lg font-semibold text-composer-text mb-2">{feature.title}</h3>
            <p className="text-sm text-composer-text-secondary leading-relaxed">{feature.description}</p>
          </div>
        ))}
      </div>
    </section>
  );
};

export { FeatureGrid };
