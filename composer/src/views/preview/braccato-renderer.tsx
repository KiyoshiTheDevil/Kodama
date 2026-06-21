import "@braccato/core";
import type { BraccatoElement } from "@braccato/core";
import { useRendererAudioSync } from "@/hooks/use-renderer-audio-sync";
import { useAudioStore } from "@/stores/audio";
import { useCallback, useEffect, useRef, useState } from "react";

// -- Interfaces ---------------------------------------------------------------

interface BraccatoRendererProps {
  ttmlString: string;
}

// -- Helpers ------------------------------------------------------------------

function handleBraccatoLineClick(e: Event): void {
  const detail = (e as CustomEvent<{ time: number }>).detail;
  if (detail?.time == null) return;
  const audio = useAudioStore.getState();
  audio.seekTo(detail.time / 1000);
  audio.setIsPlaying(true);
}

// -- Component ----------------------------------------------------------------

const BraccatoRenderer: React.FC<BraccatoRendererProps> = ({ ttmlString }) => {
  const elementRef = useRef<BraccatoElement>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const audioElement = useAudioStore((s) => s.audioElement);
  const elementKey = `${audioElement?.src ?? "no-audio"}:${blobUrl ?? "no-lyrics"}`;

  useEffect(() => {
    const blob = new Blob([ttmlString], { type: "application/ttml+xml" });
    const url = URL.createObjectURL(blob);
    setBlobUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [ttmlString]);

  // Callback ref so the click listener re-attaches when the <braccato-lyrics>
  // element is recreated via the `key` change. React 19 runs the returned
  // cleanup when the element is detached or this ref is reassigned.
  const setElement = useCallback((el: BraccatoElement | null) => {
    elementRef.current = el;
    if (!el) return;
    el.addEventListener("braccato:line-click", handleBraccatoLineClick);
    return () => {
      el.removeEventListener("braccato:line-click", handleBraccatoLineClick);
      elementRef.current = null;
    };
  }, []);

  useRendererAudioSync(elementRef, (el, audio) => {
    el.currentTime = audio.currentTime * 1000;
    el.playing = !audio.paused;
  });

  return (
    <braccato-lyrics
      key={elementKey}
      ref={setElement}
      source={audioElement ? "#composer-audio" : undefined}
      src={blobUrl ?? undefined}
      className="flex-1 mx-auto w-full max-w-3xl px-6"
      style={
        {
          "--braccato-font-family": "'Satoshi', sans-serif",
          "--braccato-font-size": "2.5rem",
          "--braccato-inactive-opacity": "0.2",
        } as React.CSSProperties
      }
    />
  );
};

// -- Exports ------------------------------------------------------------------

export { BraccatoRenderer };
