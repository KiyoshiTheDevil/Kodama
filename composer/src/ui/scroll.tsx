import { cn } from "@/utils/cn";
import "overlayscrollbars/overlayscrollbars.css";
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import type { MutableRefObject } from "react";

// -- Types --------------------------------------------------------------------

type AutoHide = "scroll" | "leave" | "move" | "never";

interface ScrollProps {
  children: React.ReactNode;
  className?: string;
  autoHide?: AutoHide;
  autoHideDelay?: number;
  viewportRef?: MutableRefObject<HTMLDivElement | null>;
}

// -- Component ----------------------------------------------------------------

const Scroll: React.FC<ScrollProps> = ({
  children,
  className,
  autoHide = "leave",
  autoHideDelay = 800,
  viewportRef,
}) => (
  <OverlayScrollbarsComponent
    defer
    className={cn("overflow-auto", className)}
    options={{
      scrollbars: { theme: "os-theme-light", autoHide, autoHideDelay },
    }}
    events={{
      initialized: (instance) => {
        if (!viewportRef) return;
        viewportRef.current = instance.elements().viewport as HTMLDivElement;
      },
      destroyed: () => {
        if (viewportRef) viewportRef.current = null;
      },
    }}
  >
    {children}
  </OverlayScrollbarsComponent>
);

// -- Exports ------------------------------------------------------------------

export { Scroll };
