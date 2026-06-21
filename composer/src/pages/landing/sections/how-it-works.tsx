interface HowStep {
  title: string;
  description: string;
}

interface HowItWorksProps {
  title: string;
  steps: HowStep[];
}

const HowItWorks: React.FC<HowItWorksProps> = ({ title, steps }) => {
  return (
    <section className="px-6 py-20 max-w-4xl mx-auto">
      <h2 className="text-3xl md:text-4xl font-semibold text-composer-text mb-12 text-center">{title}</h2>
      <ol className="space-y-6">
        {steps.map((step, index) => (
          <li key={step.title} className="flex gap-5 items-start">
            <div className="flex-shrink-0 size-9 rounded-full bg-composer-accent-dark/20 text-composer-accent-text flex items-center justify-center text-sm font-semibold">
              {index + 1}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-composer-text mb-1">{step.title}</h3>
              <p className="text-composer-text-secondary leading-relaxed">{step.description}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
};

export { HowItWorks };
