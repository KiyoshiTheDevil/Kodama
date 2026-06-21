import { useEffect, useRef } from "react";
import { useProjectStore } from "@/stores/project";

const BRAND = "Composer";
const SEPARATOR = "・";

function useDocumentTitle(): void {
  const songTitle = useProjectStore((s) => s.metadata.title);
  const baseTitleRef = useRef<string | null>(null);

  useEffect(() => {
    if (baseTitleRef.current === null) {
      baseTitleRef.current = document.title;
    }
    const trimmed = songTitle.trim();
    document.title = trimmed ? `${BRAND} ${SEPARATOR} ${trimmed}` : baseTitleRef.current;
  }, [songTitle]);

  useEffect(() => {
    return () => {
      if (baseTitleRef.current !== null) {
        document.title = baseTitleRef.current;
      }
    };
  }, []);
}

export { useDocumentTitle };
