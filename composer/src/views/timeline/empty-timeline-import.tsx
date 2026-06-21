import { useDualClickImport } from "@/hooks/useDualClickImport";
import { Button } from "@/ui/button";
import { IconFileImport, IconFileMusic } from "@tabler/icons-react";

// -- Types --------------------------------------------------------------------

interface EmptyTimelineImportProps {
  openLyricsModal: () => void;
}

// -- Component ----------------------------------------------------------------

const EmptyTimelineImport: React.FC<EmptyTimelineImportProps> = ({ openLyricsModal }) => {
  const importTriggers = useDualClickImport(openLyricsModal);
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-3 p-4">
      <IconFileMusic className="size-12 text-composer-text opacity-50" strokeWidth={1} />
      <p className="text-lg text-composer-text-secondary">No lyrics loaded</p>
      <p className="text-sm text-composer-text-muted">Paste lyrics or import a file</p>
      <Button
        variant="primary"
        hasIcon
        onClick={importTriggers.onClick}
        onDoubleClick={importTriggers.onDoubleClick}
        title="Click to search, paste, or upload. Double-click to upload a file directly."
        className="mt-2"
      >
        <IconFileImport size={16} />
        Import Lyrics
      </Button>
      {importTriggers.fileInput}
    </div>
  );
};

// -- Exports ------------------------------------------------------------------

export { EmptyTimelineImport };
