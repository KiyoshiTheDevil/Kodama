import type { FaqEntry } from "@/seo/schemas";

interface FaqSectionProps {
  title: string;
  entries: FaqEntry[];
}

const FaqSection: React.FC<FaqSectionProps> = ({ title, entries }) => {
  return (
    <section className="px-6 py-20 max-w-3xl mx-auto">
      <h2 className="text-3xl md:text-4xl font-semibold text-composer-text mb-10 text-center">{title}</h2>
      <div className="space-y-6">
        {entries.map((entry) => (
          <details
            key={entry.question}
            className="group rounded-xl bg-composer-bg-elevated border border-composer-border p-5 open:pb-6"
          >
            <summary className="cursor-pointer font-medium text-composer-text list-none flex items-center justify-between gap-4">
              <span>{entry.question}</span>
              <span className="text-composer-text-muted text-xl leading-none group-open:rotate-45 transition-transform select-none">
                +
              </span>
            </summary>
            <p className="text-composer-text-secondary leading-relaxed mt-4 select-text">{entry.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
};

export { FaqSection };
