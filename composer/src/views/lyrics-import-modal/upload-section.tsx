import { IconArrowLeft, IconClipboardText, IconMusic } from "@tabler/icons-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/ui/button";
import { cn } from "@/utils/cn";

// -- Types --------------------------------------------------------------------

interface UploadSectionProps {
  onFile: (file: File) => void | Promise<void>;
  onSwitchToSearch: () => void;
  onSwitchToPaste: () => void;
}

// -- Constants ----------------------------------------------------------------

const ACCEPTED_EXTENSIONS = /\.(txt|lrc|srt|ttml|xml)$/i;
const ACCEPTED_FILE_INPUT = ".txt,.lrc,.srt,.ttml,.xml";
const UNSUPPORTED_TYPE_MESSAGE = "Unsupported file type. Use .txt .lrc .srt .ttml";

// -- Component ----------------------------------------------------------------

const UploadSection: React.FC<UploadSectionProps> = ({ onFile, onSwitchToSearch, onSwitchToPaste }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const acceptFile = useCallback(
    (file: File) => {
      if (!ACCEPTED_EXTENSIONS.test(file.name)) {
        toast.error(UNSUPPORTED_TYPE_MESSAGE);
        return;
      }
      void onFile(file);
    },
    [onFile],
  );

  const handleClickToBrowse = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) acceptFile(file);
    },
    [acceptFile],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) acceptFile(file);
      e.target.value = "";
    },
    [acceptFile],
  );

  return (
    <div className={cn("flex flex-col gap-2.5 p-3 rounded-lg", "bg-composer-input border border-composer-border")}>
      <div className="flex items-center justify-between gap-2">
        <Button variant="secondary" size="sm" hasIcon onClick={onSwitchToSearch}>
          <IconArrowLeft size={14} stroke={2} />
          Back to search
        </Button>
        <button
          type="button"
          onClick={onSwitchToPaste}
          className="inline-flex items-center gap-1.5 text-[11px] font-medium cursor-pointer bg-transparent border-none px-1 py-0.5 rounded text-composer-text-secondary hover:text-composer-text transition-colors"
        >
          <IconClipboardText size={12} stroke={2} className="text-composer-text opacity-60" />
          Paste lyrics instead
        </button>
      </div>
      <button
        type="button"
        data-upload-dropzone
        aria-label="Drop a lyrics file here or click to browse"
        onClick={handleClickToBrowse}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          "flex flex-col items-center justify-center gap-2 px-4 py-7 rounded-lg text-center cursor-pointer w-full",
          "bg-composer-overlay border border-dashed transition-colors",
          isDragOver
            ? "border-composer-accent bg-composer-accent/8"
            : "border-composer-border hover:border-composer-border-strong",
        )}
      >
        <IconMusic size={32} stroke={1.5} className="text-composer-text opacity-50 mb-0.5" />
        <div className="text-sm font-medium text-composer-text">Drop a lyrics file here</div>
        <div className="text-[11.5px] text-composer-text-muted">
          or <span className="text-composer-accent-text underline decoration-composer-accent/40">click to browse</span>
        </div>
        <div className="mt-1 font-mono text-[10.5px] tracking-tight text-composer-text-muted">.txt .lrc .srt .ttml</div>
      </button>
      <input
        ref={fileInputRef}
        type="file"
        aria-label="Import lyrics file"
        accept={ACCEPTED_FILE_INPUT}
        onChange={handleInputChange}
        className="sr-only"
      />
    </div>
  );
};

// -- Exports ------------------------------------------------------------------

export { ACCEPTED_EXTENSIONS, UNSUPPORTED_TYPE_MESSAGE, UploadSection };
export type { UploadSectionProps };
