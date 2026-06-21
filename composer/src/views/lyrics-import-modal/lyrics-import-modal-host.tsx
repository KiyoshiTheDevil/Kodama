import { useImportModalState } from "@/stores/import-modal-store";
import { LyricsImportModalShell } from "@/views/lyrics-import-modal/lyrics-import-modal";

// -- Component ----------------------------------------------------------------

const LyricsImportModalHost: React.FC = () => {
  const { isOpen } = useImportModalState();
  if (!isOpen) return null;
  return <LyricsImportModalShell />;
};

// -- Exports ------------------------------------------------------------------

export { LyricsImportModalHost };
