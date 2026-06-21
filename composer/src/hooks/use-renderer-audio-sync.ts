import { useAudioStore } from "@/stores/audio";
import { type RefObject, useEffect, useRef } from "react";

// -- Hook ---------------------------------------------------------------------

function useRendererAudioSync<T extends HTMLElement>(
  elementRef: RefObject<T | null>,
  apply: (element: T, audio: HTMLAudioElement) => void,
): void {
  const applyRef = useRef(apply);
  applyRef.current = apply;

  useEffect(() => {
    let frameId: number;
    const tick = () => {
      const element = elementRef.current;
      // Re-read the audio element from the store each frame so the loop keeps
      // tracking it after the audio engine tears down and recreates it.
      const audio = useAudioStore.getState().audioElement;
      if (element && audio) applyRef.current(element, audio);
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [elementRef]);
}

// -- Exports ------------------------------------------------------------------

export { useRendererAudioSync };
