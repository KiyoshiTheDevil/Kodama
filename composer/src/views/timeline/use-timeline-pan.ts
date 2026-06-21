import { type RefObject, useCallback, useEffect, useRef } from "react";

// -- Hook ----------------------------------------------------------------------

function useTimelinePan(scrollContainerRef: RefObject<HTMLDivElement | null>) {
  const isPanningRef = useRef(false);
  const panStartXRef = useRef(0);
  const panStartYRef = useRef(0);
  const panStartScrollRef = useRef(0);
  const panStartScrollTopRef = useRef(0);
  const panAxisLockRef = useRef<"x" | "y" | null>(null);

  const handlePanMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button === 1) {
        e.preventDefault();
        isPanningRef.current = true;
        panStartXRef.current = e.clientX;
        panStartYRef.current = e.clientY;
        panStartScrollRef.current = scrollContainerRef.current?.scrollLeft ?? 0;
        panStartScrollTopRef.current = scrollContainerRef.current?.scrollTop ?? 0;
        panAxisLockRef.current = null;
        scrollContainerRef.current?.classList.add("is-panning");
      }
    },
    [scrollContainerRef],
  );

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isPanningRef.current || !scrollContainerRef.current) return;
      const deltaX = panStartXRef.current - e.clientX;
      const deltaY = panStartYRef.current - e.clientY;

      if (e.shiftKey && !panAxisLockRef.current) {
        panAxisLockRef.current = Math.abs(deltaX) > Math.abs(deltaY) ? "x" : "y";
      }

      if (e.shiftKey && panAxisLockRef.current === "x") {
        scrollContainerRef.current.scrollLeft = panStartScrollRef.current + deltaX;
      } else if (e.shiftKey && panAxisLockRef.current === "y") {
        scrollContainerRef.current.scrollTop = panStartScrollTopRef.current + deltaY;
      } else {
        scrollContainerRef.current.scrollLeft = panStartScrollRef.current + deltaX;
        scrollContainerRef.current.scrollTop = panStartScrollTopRef.current + deltaY;
      }
    };

    const handleMouseUp = () => {
      isPanningRef.current = false;
      scrollContainerRef.current?.classList.remove("is-panning");
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [scrollContainerRef]);

  return { handlePanMouseDown };
}

// -- Exports -------------------------------------------------------------------

export { useTimelinePan };
