import { useCallback, useRef, useState } from "react";

// -- Types --------------------------------------------------------------------

interface FileDropZoneProps {
  accept: string;
  onFileDrop: (file: File) => void;
  children?: React.ReactNode;
}

// -- Constants ----------------------------------------------------------------

const ACCEPTED_AUDIO_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/wave",
  "audio/x-wav",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/ogg",
  "audio/flac",
];

// -- Component ----------------------------------------------------------------

const FileDropZone: React.FC<FileDropZoneProps> = ({ accept, onFileDrop, children }) => {
  const [isDragging, setIsDragging] = useState(false);
  const inputId = "file-drop-input";
  const dragCountRef = useRef(0);

  const handleFile = useCallback(
    (file: File) => {
      if (ACCEPTED_AUDIO_TYPES.includes(file.type) || file.name.match(/\.(mp3|wav|m4a|ogg|flac)$/i)) {
        onFileDrop(file);
      }
    },
    [onFileDrop],
  );

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current++;
    if (dragCountRef.current === 1) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountRef.current--;
    if (dragCountRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCountRef.current = 0;
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        handleFile(file);
      }
    },
    [handleFile],
  );

  return (
    <label
      htmlFor={inputId}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={`size-full flex cursor-pointer flex-col items-center justify-center p-8 transition-colors ${
        isDragging
          ? "border-composer-accent bg-composer-accent/10"
          : "border-composer-border hover:border-composer-border-hover"
      }`}
    >
      <input
        id={inputId}
        type="file"
        aria-label="Upload audio file"
        accept={accept}
        onChange={handleInputChange}
        className="sr-only"
      />
      {children}
    </label>
  );
};

export { FileDropZone };
