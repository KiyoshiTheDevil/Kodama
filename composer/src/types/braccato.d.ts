import "react";
import type { BraccatoElement } from "@braccato/core";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "braccato-lyrics": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          source?: string;
          src?: string;
          playing?: boolean;
          "current-time"?: number;
          "scroll-mode"?: "internal" | "external";
          dir?: "auto" | "ltr" | "rtl";
        },
        BraccatoElement
      >;
    }
  }
}
