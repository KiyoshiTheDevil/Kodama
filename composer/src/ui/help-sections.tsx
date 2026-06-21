import { AboutSection } from "@/ui/help-sections/about";
import { EditSection } from "@/ui/help-sections/editing";
import { ExportSection } from "@/ui/help-sections/exporting";
import { GettingStartedSection } from "@/ui/help-sections/getting-started";
import { GroupsSection } from "@/ui/help-sections/groups";
import { ImportSection } from "@/ui/help-sections/importing";
import { KeyboardShortcutsSection } from "@/ui/help-sections/keyboard-shortcuts";
import { PreviewSection } from "@/ui/help-sections/preview";
import { RecoverySection } from "@/ui/help-sections/recovery";
import { SyncSection } from "@/ui/help-sections/syncing";
import { TimelineSection } from "@/ui/help-sections/timeline";
import { TtmlStandardsSection } from "@/ui/help-sections/ttml-standards";

// -- Registry -----------------------------------------------------------------

const HELP_SECTION_COMPONENTS: Record<string, React.FC> = {
  "getting-started": GettingStartedSection,
  "keyboard-shortcuts": KeyboardShortcutsSection,
  importing: ImportSection,
  editing: EditSection,
  syncing: SyncSection,
  timeline: TimelineSection,
  groups: GroupsSection,
  preview: PreviewSection,
  exporting: ExportSection,
  recovery: RecoverySection,
  "ttml-standards": TtmlStandardsSection,
  about: AboutSection,
};

// -- Section Router -----------------------------------------------------------

const HelpSectionContent: React.FC<{ section: string }> = ({ section }) => {
  const Section = HELP_SECTION_COMPONENTS[section] ?? GettingStartedSection;
  return <Section />;
};

// -- Exports ------------------------------------------------------------------

export { HelpSectionContent };
