// Extract an accent colour (as an "r,g,b" string) from an image. Extracted from App.jsx.
import { useState, useEffect } from "react";
import { thumb } from "../context.jsx";

const FALLBACK = "40,40,60";

export function useAccentColor(imageUrl) {
  const [color, setColor] = useState(FALLBACK);

  useEffect(() => {
    if (!imageUrl) { setColor(FALLBACK); return; }
    let cancelled = false;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      try {
        const N = 50;
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = N;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0, N, N);
        const d = ctx.getImageData(0, 0, N, N).data;

        // Weight each pixel by its saturation. A flat average over a whole cover lands in
        // muddy brown-grey almost every time, because the colourful part is outnumbered by
        // dark and neutral pixels; weighting lets the colour that defines the artwork win.
        let r = 0, g = 0, b = 0, w = 0;
        let ar = 0, ag = 0, ab = 0, n = 0; // plain average, kept as a fallback
        for (let i = 0; i < d.length; i += 4) {
          const R = d[i], G = d[i + 1], B = d[i + 2];
          ar += R; ag += G; ab += B; n++;
          const max = Math.max(R, G, B), min = Math.min(R, G, B);
          if (max < 30 || max > 245) continue;      // near-black or blown out
          const sat = (max - min) / max;
          if (sat < 0.18) continue;                 // greys carry no hue
          r += R * sat; g += G * sat; b += B * sat; w += sat;
        }
        if (!n) return;

        let out = w > 0 ? [r / w, g / w, b / w] : [ar / n, ag / n, ab / n];

        // It ends up as a button fill under white text, so keep it out of the extremes.
        const peak = Math.max(...out);
        if (peak > 205) out = out.map(v => v * (205 / peak));
        else if (peak < 85 && peak > 0) out = out.map(v => Math.min(255, v * (85 / peak)));

        setColor(out.map(v => Math.round(v)).join(","));
      } catch {}
    };

    // Through the backend image proxy rather than the CDN directly: reading pixels back
    // needs a CORS-clean image, and the CDN sends no such headers. Loaded straight from the
    // origin the canvas is tainted, getImageData throws, the catch swallows it — and the
    // hook keeps returning FALLBACK, which is why every cover produced the same blue-grey.
    img.src = thumb(imageUrl);

    return () => { cancelled = true; };
  }, [imageUrl]);

  return color;
}
