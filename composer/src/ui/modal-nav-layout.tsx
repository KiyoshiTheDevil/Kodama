import { Scroll } from "@/ui/scroll";
import { cn } from "@/utils/cn";

// -- Types --------------------------------------------------------------------

interface ModalNavSection {
  id: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

interface ModalNavLayoutProps {
  sections: ModalNavSection[];
  activeSection: string;
  onSectionChange: (id: string) => void;
  children: React.ReactNode;
  sidebarClassName?: string;
  contentClassName?: string;
}

// -- Component ----------------------------------------------------------------

const ModalNavLayout: React.FC<ModalNavLayoutProps> = ({
  sections,
  activeSection,
  onSectionChange,
  children,
  sidebarClassName,
  contentClassName,
}) => (
  <div className="flex flex-1 min-h-0">
    <Scroll className={cn("w-44 shrink-0 border-r border-composer-border select-none", sidebarClassName)}>
      <div className="flex flex-col gap-px p-2">
        {sections.map((section) => {
          const Icon = section.icon;
          const isActive = activeSection === section.id;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => onSectionChange(section.id)}
              className={cn(
                "flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm text-left cursor-pointer transition-colors",
                isActive
                  ? "bg-composer-button text-composer-text font-medium"
                  : "text-composer-text-secondary hover:bg-composer-button/50 hover:text-composer-text",
              )}
            >
              <Icon size={16} className="shrink-0" />
              {section.label}
            </button>
          );
        })}
      </div>
    </Scroll>

    <Scroll className={cn("flex-1", contentClassName)}>{children}</Scroll>
  </div>
);

// -- Exports ------------------------------------------------------------------

export { ModalNavLayout };
export type { ModalNavSection };
