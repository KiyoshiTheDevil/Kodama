import { HelpSectionContent } from "@/ui/help-sections";
import { Modal } from "@/ui/modal";
import { ModalNavLayout, type ModalNavSection } from "@/ui/modal-nav-layout";
import { KeyBadge } from "@/ui/shortcut-reference";
import { getEffectiveKeysArray } from "@/stores/shortcut-bindings";
import {
  IconAward,
  IconDownload,
  IconEye,
  IconFileImport,
  IconHandClick,
  IconInfoHexagon,
  IconKeyboard,
  IconLayoutRows,
  IconLifebuoy,
  IconLink,
  IconPencil,
  IconRocket,
} from "@tabler/icons-react";
import { useState } from "react";

// -- Types --------------------------------------------------------------------

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

// -- Data ---------------------------------------------------------------------

const HELP_SECTIONS: ModalNavSection[] = [
  { id: "getting-started", label: "Getting Started", icon: IconRocket },
  { id: "keyboard-shortcuts", label: "Keyboard Shortcuts", icon: IconKeyboard },
  { id: "importing", label: "Importing", icon: IconFileImport },
  { id: "editing", label: "Editing Lyrics", icon: IconPencil },
  { id: "syncing", label: "Syncing", icon: IconHandClick },
  { id: "timeline", label: "Timeline", icon: IconLayoutRows },
  { id: "groups", label: "Linked groups", icon: IconLink },
  { id: "preview", label: "Preview", icon: IconEye },
  { id: "exporting", label: "Exporting", icon: IconDownload },
  { id: "recovery", label: "Recovery", icon: IconLifebuoy },
  { id: "ttml-standards", label: "TTML & standards", icon: IconAward },
  { id: "about", label: "About", icon: IconInfoHexagon },
];

// -- Help Modal ---------------------------------------------------------------

const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  const [activeSection, setActiveSection] = useState("getting-started");

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Help"
      className="max-w-4xl h-[80%] flex flex-col"
      bodyClassName="p-0 flex-1 min-h-0 flex flex-col"
    >
      <ModalNavLayout
        sections={HELP_SECTIONS}
        activeSection={activeSection}
        onSectionChange={setActiveSection}
        sidebarClassName="w-48"
        contentClassName="p-6"
      >
        <div data-help-content>
          <HelpSectionContent section={activeSection} />
        </div>
      </ModalNavLayout>

      <div className="px-5 py-3 border-t border-composer-border text-xs text-composer-text-muted text-center shrink-0 select-none flex items-center justify-center gap-1.5">
        Press{" "}
        {getEffectiveKeysArray("global.help").map((key) => (
          <KeyBadge key={key} keyName={key} />
        ))}{" "}
        to open anytime
      </div>
    </Modal>
  );
};

// -- Exports ------------------------------------------------------------------

export { HelpModal };
