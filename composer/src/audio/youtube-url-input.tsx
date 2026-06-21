import { IconBrandYoutube, IconLoader2 } from "@tabler/icons-react";
import { useCallback, useState } from "react";
import { useLoadYouTubeSource } from "@/hooks/useLoadYouTubeSource";
import { useAudioStore } from "@/stores/audio";
import { Button } from "@/ui/button";
import { extractVideoId } from "@/utils/youtube-url";

// -- Component ----------------------------------------------------------------

interface YouTubeUrlInputProps {
  placeholder?: string;
  className?: string;
}

const YouTubeUrlInput: React.FC<YouTubeUrlInputProps> = ({
  placeholder = "Paste YouTube URL or video ID",
  className,
}) => {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const isLoading = useAudioStore((s) => s.isLoading);
  const youtubeLoadError = useAudioStore((s) => s.youtubeLoadError);
  const loadYouTubeSource = useLoadYouTubeSource();

  const handleSubmit = useCallback(async () => {
    const videoId = extractVideoId(value);
    if (!videoId) {
      setError("That doesn't look like a valid YouTube URL or ID");
      return;
    }
    setError(null);
    try {
      await loadYouTubeSource(videoId);
      setValue("");
    } catch {
      // Error is surfaced via the store's youtubeLoadError; keep the input populated for retry.
    }
  }, [value, loadYouTubeSource]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
    e.stopPropagation();
  };

  const trimmed = value.trim();

  return (
    <div className={`flex flex-col gap-1.5 w-full max-w-md ${className ?? ""}`}>
      <div className="flex gap-2">
        <input
          type="text"
          aria-label="YouTube URL or video ID"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError(null);
            if (youtubeLoadError) useAudioStore.getState().setYouTubeLoadError(null);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={isLoading}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          className="flex-1 h-8 px-3 text-sm rounded-md bg-composer-input border border-composer-border focus:outline-none focus:border-composer-accent cursor-text disabled:opacity-50 select-text"
        />
        <Button variant="primary" hasIcon onClick={handleSubmit} disabled={isLoading || trimmed.length === 0}>
          {isLoading ? <IconLoader2 size={16} className="animate-spin" /> : <IconBrandYoutube size={16} />}
          {isLoading ? "Loading" : "Load"}
        </Button>
      </div>
      {error && <p className="text-xs text-red-400 select-text">{error}</p>}
    </div>
  );
};

// -- Exports ------------------------------------------------------------------

export { YouTubeUrlInput };
