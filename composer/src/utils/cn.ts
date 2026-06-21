import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "bg-color": [
        "bg-composer-bg",
        "bg-composer-bg-dark",
        "bg-composer-bg-elevated",
        "bg-composer-overlay",
        "bg-composer-overlay-hover",
        "bg-composer-button",
        "bg-composer-button-hover",
        "bg-composer-input",
        "bg-composer-accent",
        "bg-composer-accent-dark",
        "bg-composer-accent-darker",
        "bg-composer-accent-warm",
        "bg-composer-error",
        "bg-composer-warning",
      ],
      "text-color": [
        "text-composer-text",
        "text-composer-text-secondary",
        "text-composer-text-muted",
        "text-composer-text-disabled",
        "text-composer-text-tertiary",
        "text-composer-accent-text",
        "text-composer-error-text",
        "text-composer-link",
      ],
      "border-color": [
        "border-composer-border",
        "border-composer-border-hover",
        "border-composer-error",
        "border-composer-accent",
      ],
    },
  },
});

function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export { cn };
