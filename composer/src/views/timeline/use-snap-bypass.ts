import { useTimelineStore } from "@/views/timeline/timeline-store";
import { useEffect, useRef } from "react";

// -- Interfaces ----------------------------------------------------------------
interface UseSnapBypassArgs {
  active: boolean;
  getLastPointer: () => { clientX: number; clientY: number } | null;
}

// -- Hook ----------------------------------------------------------------------
function useSnapBypass({ active, getLastPointer }: UseSnapBypassArgs) {
  const bypassRef = useRef(false);

  useEffect(() => {
    if (!active) {
      if (bypassRef.current) {
        bypassRef.current = false;
        useTimelineStore.getState().setIsBypassing(false);
      }
      return;
    }

    const handleKey = (e: KeyboardEvent) => {
      const next = e.metaKey || e.ctrlKey;
      if (next === bypassRef.current) return;
      bypassRef.current = next;
      useTimelineStore.getState().setIsBypassing(next);
      const last = getLastPointer();
      if (last) {
        window.dispatchEvent(
          new PointerEvent("pointermove", {
            clientX: last.clientX,
            clientY: last.clientY,
            bubbles: true,
            pointerType: "mouse",
          }),
        );
      }
    };

    window.addEventListener("keydown", handleKey);
    window.addEventListener("keyup", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("keyup", handleKey);
    };
  }, [active, getLastPointer]);

  return bypassRef;
}

// -- Exports -------------------------------------------------------------------
export { useSnapBypass };
