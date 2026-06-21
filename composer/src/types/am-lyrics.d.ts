import "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "am-lyrics": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          ttml?: string;
          "current-time"?: number;
          "highlight-color"?: string;
          "font-family"?: string;
          autoscroll?: boolean;
          interpolate?: boolean;
          "song-duration"?: number;
          "song-title"?: string;
          "song-artist"?: string;
          "song-album"?: string;
          query?: string;
          "music-id"?: string;
          isrc?: string;
          duration?: number;
          "hide-source-footer"?: boolean;
        },
        HTMLElement
      >;
    }
  }
}
