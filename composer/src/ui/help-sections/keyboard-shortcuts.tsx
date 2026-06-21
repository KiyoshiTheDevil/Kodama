import { ShortcutSection, SHORTCUT_SECTIONS } from "@/ui/shortcut-reference";

// -- Keyboard Shortcuts -------------------------------------------------------

const KeyboardShortcutsSection: React.FC = () => (
  <div className="grid grid-cols-2 gap-x-12 gap-y-6">
    {SHORTCUT_SECTIONS.map((section) => (
      <ShortcutSection key={section.title} {...section} />
    ))}
  </div>
);

// -- Exports ------------------------------------------------------------------

export { KeyboardShortcutsSection };
