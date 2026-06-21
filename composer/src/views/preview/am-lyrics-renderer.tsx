import { useRendererAudioSync } from "@/hooks/use-renderer-audio-sync";
import { useAudioStore } from "@/stores/audio";
import type { AmLyrics as AmLyricsElement } from "@uimaxbai/am-lyrics";
import { useEffect, useRef, useState } from "react";

// -- Interfaces ---------------------------------------------------------------

interface AmLyricsRendererProps {
  ttmlString: string;
  durationSeconds: number;
}

// -- Element registration -----------------------------------------------------

let registerPromise: Promise<void> | null = null;
function ensureRegistered(): Promise<void> {
  if (!registerPromise) {
    registerPromise = import("@uimaxbai/am-lyrics/am-lyrics.js").then(() => undefined);
  }
  return registerPromise;
}

// -- Component ----------------------------------------------------------------

const AmLyricsRenderer: React.FC<AmLyricsRendererProps> = ({ ttmlString, durationSeconds }) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const elementRef = useRef<AmLyricsElement | null>(null);
  const latestTtmlRef = useRef(ttmlString);
  const latestDurationMsRef = useRef(durationSeconds * 1000);
  latestTtmlRef.current = ttmlString;
  latestDurationMsRef.current = durationSeconds * 1000;
  // react-doctor-disable-next-line react-doctor/rerender-state-only-in-handlers
  const [isRegistered, setIsRegistered] = useState(false);

  useEffect(() => {
    let cancelled = false;
    ensureRegistered().then(() => {
      if (!cancelled) setIsRegistered(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isRegistered) return;
    const container = containerRef.current;
    if (!container) return;

    const el = document.createElement("am-lyrics") as AmLyricsElement;
    el.ttml = latestTtmlRef.current;
    el.songDurationMs = latestDurationMsRef.current;
    el.className = "block flex-1 mx-auto w-full max-w-3xl px-6";

    const handleLineClick = (event: Event) => {
      const detail = (event as CustomEvent<{ timestamp: number }>).detail;
      if (detail?.timestamp == null) return;
      const audio = useAudioStore.getState();
      audio.seekTo(detail.timestamp / 1000);
      audio.setIsPlaying(true);
    };
    el.addEventListener("line-click", handleLineClick);

    container.appendChild(el);
    elementRef.current = el;

    const injectHideStyle = () => {
      if (!el.shadowRoot) return;
      if (el.shadowRoot.querySelector("style[data-composer-hide]")) return;
      const style = document.createElement("style");
      style.dataset.composerHide = "";
      style.textContent = ".lyrics-header { display: none !important; }";
      el.shadowRoot.appendChild(style);
    };
    injectHideStyle();
    el.updateComplete.then(injectHideStyle);

    return () => {
      el.removeEventListener("line-click", handleLineClick);
      el.remove();
      elementRef.current = null;
    };
  }, [isRegistered]);

  useEffect(() => {
    const el = elementRef.current;
    if (!el) return;
    // react-doctor-disable-next-line react-doctor/no-event-handler
    if (el.ttml !== ttmlString) el.ttml = ttmlString;
  }, [ttmlString]);

  useEffect(() => {
    const el = elementRef.current;
    if (!el) return;
    el.songDurationMs = durationSeconds * 1000;
  }, [durationSeconds]);

  useRendererAudioSync(elementRef, (el, audio) => {
    el.currentTime = audio.currentTime * 1000;
  });

  return <div ref={containerRef} className="flex flex-col flex-1 min-h-0" />;
};

// -- Exports ------------------------------------------------------------------

export { AmLyricsRenderer };
