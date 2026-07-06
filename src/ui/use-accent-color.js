// Extract an average accent color (r,g,b string) from an image URL. Extracted from App.jsx.
import { useState, useEffect } from "react";

export function useAccentColor(imageUrl) {
  const [color, setColor] = useState("40,40,60");
  useEffect(() => {
    if (!imageUrl) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = 50;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, 50, 50);
        const d = ctx.getImageData(0, 0, 50, 50).data;
        let r = 0, g = 0, b = 0, count = 0;
        for (let i = 0; i < d.length; i += 16) {
          r += d[i]; g += d[i+1]; b += d[i+2]; count++;
        }
        r = Math.round(r/count); g = Math.round(g/count); b = Math.round(b/count);
        setColor(`${r},${g},${b}`);
      } catch {}
    };
    img.src = imageUrl;
  }, [imageUrl]);
  return color;
}
