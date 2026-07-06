import { FileDropZone } from "@/audio/file-drop-zone";
import { YouTubeUrlInput } from "@/audio/youtube-url-input";
import { useBridgeThumb } from "@/hooks/useBridgeThumb";
import { useAudioStore } from "@/stores/audio";
import { useProjectStore } from "@/stores/project";
import { useSettingsStore } from "@/stores/settings";
import { Button } from "@/ui/button";
import { Modal } from "@/ui/modal";
import { Checkbox } from "@heroui/react";
import { IconBrandYoutube, IconClock, IconFile, IconLoader2, IconMusic, IconX } from "@/ui/icons/fa";
import { useCallback, useEffect, useState } from "react";

// -- Helpers ------------------------------------------------------------------

function formatDuration(seconds: number): string {
  if (seconds <= 0) return "--:--";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileExtension(filename: string): string {
  return filename.split(".").pop()?.toUpperCase() || "AUDIO";
}

// -- Constants ----------------------------------------------------------------

const GUTTER_WIDTH = 56;
const ROW_HEIGHT = 56;

// -- Sub-components -----------------------------------------------------------

const YouTubeSourceThumb: React.FC<{ videoId: string; loading: boolean }> = ({ videoId, loading }) => {
  const bridgeEnabled = useSettingsStore((s) => s.experiments.youtubeBridge);
  const persistedThumb = useProjectStore((s) => s.metadata.thumbnailDataUrl);
  const persistedFor = useProjectStore((s) => s.metadata.thumbnailForVideoId);
  const hasMatchingPersistedThumb = Boolean(persistedThumb && persistedFor === videoId);
  const thumbQuery = useBridgeThumb();

  if (hasMatchingPersistedThumb) {
    return <img src={persistedThumb} alt="" className="size-full object-cover" />;
  }
  if (loading || (bridgeEnabled && thumbQuery.isFetching)) {
    return <div className="size-full bg-composer-bg-elevated animate-pulse" />;
  }
  return <IconBrandYoutube size={16} className="text-composer-accent" />;
};

const OrDivider: React.FC = () => (
  <div className="flex items-center gap-3 w-full max-w-md select-none">
    <div className="flex-1 h-px bg-composer-border" />
    <span className="text-xs text-composer-text-muted">or</span>
    <div className="flex-1 h-px bg-composer-border" />
  </div>
);

interface ReplaceControlsProps {
  onFileDrop: (file: File) => void;
}

const ReplaceControls: React.FC<ReplaceControlsProps> = ({ onFileDrop }) => (
  <div className="flex flex-col items-center gap-4 flex-1 p-6 w-full">
    <div className="w-full max-w-md flex-1 min-h-32">
      <FileDropZone accept="audio/*" onFileDrop={onFileDrop}>
        <p className="text-sm text-composer-text-muted">Drop another file to replace</p>
      </FileDropZone>
    </div>
    <OrDivider />
    <YouTubeUrlInput placeholder="Or load a different YouTube URL" />
  </div>
);

interface SourceDurationProps {
  loading: boolean;
  duration: number;
}

// Shown in the imported-source row. While the source is loading (a YouTube
// download or an mp3 decode) it shows the spinner; once ready it shows the
// clock and resolved duration.
const SourceDuration: React.FC<SourceDurationProps> = ({ loading, duration }) => (
  <div className="flex items-center gap-1.5">
    {loading ? (
      <>
        <IconLoader2 size={14} className="animate-spin text-composer-accent" />
        <span className="text-sm font-mono text-composer-text-muted tabular-nums">--:--</span>
      </>
    ) : (
      <>
        <IconClock size={14} className="text-composer-text opacity-50" />
        <span className="text-sm font-mono text-composer-text tabular-nums select-text">
          {formatDuration(duration)}
        </span>
      </>
    )}
  </div>
);

// Clears the loaded track so a different one can be imported. Lyrics/project content is
// kept (it lives in a separate store slice) — only the audio source + playback reset.
const RemoveSourceButton: React.FC<{ onRemove: () => void }> = ({ onRemove }) => (
  <Button
    size="icon"
    variant="ghost"
    onClick={onRemove}
    title="Remove track"
    aria-label="Remove track"
    className="shrink-0 text-composer-text-muted hover:text-composer-text"
  >
    <IconX size={16} />
  </Button>
);

// Confirmation before unloading the track, with an opt-in to also wipe the lyrics.
const RemoveTrackModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (clearLyrics: boolean) => void;
}> = ({ isOpen, onClose, onConfirm }) => {
  const [clearLyrics, setClearLyrics] = useState(false);
  useEffect(() => {
    if (isOpen) setClearLyrics(false);
  }, [isOpen]);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Remove track?" className="max-w-md">
      <div className="flex flex-col gap-4">
        <p className="text-sm leading-relaxed text-composer-text-secondary">
          This unloads the current audio so you can import a different track. Your lyrics are
          kept unless you choose to clear them.
        </p>
        <Checkbox
          isSelected={clearLyrics}
          onChange={setClearLyrics}
          className="text-sm text-composer-text"
        >
          Also clear the lyrics
        </Checkbox>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => onConfirm(clearLyrics)}
            className="bg-[#c0392b]! hover:bg-[#e24b4a]! text-white!"
          >
            Remove
          </Button>
        </div>
      </div>
    </Modal>
  );
};

// -- Component ----------------------------------------------------------------

const ImportPanel: React.FC = () => {
  const source = useAudioStore((s) => s.source);
  const duration = useAudioStore((s) => s.duration);
  const isLoading = useAudioStore((s) => s.isLoading);
  const setSource = useAudioStore((s) => s.setSource);
  const setMetadata = useProjectStore((s) => s.setMetadata);
  const projectTitle = useProjectStore((s) => s.metadata.title);

  const handleFileDrop = useCallback(
    (file: File) => {
      setSource({ type: "file", file });
      setMetadata({ title: file.name.replace(/\.[^/.]+$/, "") });
    },
    [setSource, setMetadata],
  );

  // Remove the current (e.g. wrong) track — confirmed via a dialog, with an option to
  // also clear the lyrics.
  const [removeOpen, setRemoveOpen] = useState(false);
  const handleRemove = useCallback(() => setRemoveOpen(true), []);
  const confirmRemove = useCallback(
    (clearLyrics: boolean) => {
      setSource(null);
      if (clearLyrics) useProjectStore.getState().reset();
      setRemoveOpen(false);
    },
    [setSource],
  );
  const removeModal = (
    <RemoveTrackModal isOpen={removeOpen} onClose={() => setRemoveOpen(false)} onConfirm={confirmRemove} />
  );

  if (source && source.type === "file") {
    const file = source.file;
    const extension = getFileExtension(file.name);
    const fileName = file.name.replace(/\.[^/.]+$/, "");

    return (
      <div data-tour="import-dropzone" className="flex flex-col-reverse flex-1 size-full">
        <div className="flex m-4 rounded-xl bg-composer-bg-elevated/50 overflow-hidden">
          <div
            className="shrink-0 flex items-center justify-center bg-composer-accent/10"
            style={{ width: GUTTER_WIDTH, height: ROW_HEIGHT }}
          >
            <IconFile size={16} className="text-composer-accent" />
          </div>

          <div
            className="flex-1 flex items-center gap-6 px-4 border-l border-composer-accent/25"
            style={{ height: ROW_HEIGHT }}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate text-composer-text select-text">{fileName}</p>
              <p className="text-xs text-composer-text-muted">{extension}</p>
            </div>

            <SourceDuration loading={isLoading} duration={duration} />

            <div className="text-sm text-composer-text-muted">{formatFileSize(file.size)}</div>

            <RemoveSourceButton onRemove={handleRemove} />
          </div>
        </div>

        <ReplaceControls onFileDrop={handleFileDrop} />
        {removeModal}
      </div>
    );
  }

  if (source && source.type === "youtube") {
    const videoId = source.videoId;
    const hasResolvedTitle = Boolean(projectTitle && projectTitle !== videoId);
    const downloading = isLoading && !source.file;
    const titleLoading = downloading && !hasResolvedTitle;

    return (
      <div data-tour="import-dropzone" className="flex flex-col-reverse flex-1 size-full">
        <div className="flex m-4 rounded-xl bg-composer-bg-elevated/50 overflow-hidden">
          <div
            className="shrink-0 flex items-center justify-center bg-composer-accent/10 overflow-hidden"
            style={{ width: GUTTER_WIDTH, height: ROW_HEIGHT }}
          >
            <YouTubeSourceThumb videoId={videoId} loading={downloading} />
          </div>

          <div
            className="flex-1 flex items-center gap-6 px-4 border-l border-composer-accent/25"
            style={{ height: ROW_HEIGHT }}
          >
            <div className="flex-1 min-w-0">
              {titleLoading ? (
                <div className="h-4 w-40 rounded bg-composer-bg-elevated animate-pulse" />
              ) : (
                <p className="text-sm font-medium truncate text-composer-text select-text">
                  {hasResolvedTitle ? projectTitle : videoId}
                </p>
              )}
              <p className="text-xs text-composer-text-muted select-text">
                {videoId} ・ {downloading ? "Downloading from YouTube" : "from YouTube"}
              </p>
            </div>

            <SourceDuration loading={downloading} duration={duration} />

            <RemoveSourceButton onRemove={handleRemove} />
          </div>
        </div>

        <ReplaceControls onFileDrop={handleFileDrop} />
        {removeModal}
      </div>
    );
  }

  return (
    <div data-tour="import-dropzone" className="flex flex-col items-center justify-center gap-6 flex-1 size-full p-6">
      <div className="w-full max-w-md flex-1 max-h-72 min-h-40">
        <FileDropZone accept="audio/*" onFileDrop={handleFileDrop}>
          <IconMusic className="size-12 mb-4 opacity-50 text-composer-text" stroke={1.5} />
          <p className="text-composer-text-secondary">Drop audio file here</p>
          <p className="mt-1 text-sm text-composer-text-muted">or click to browse</p>
          <p className="mt-4 text-xs text-composer-text-muted">Supports MP3, WAV, M4A, OGG, FLAC</p>
        </FileDropZone>
      </div>

      <OrDivider />

      <YouTubeUrlInput />
    </div>
  );
};

// -- Exports ------------------------------------------------------------------

export { ImportPanel };
