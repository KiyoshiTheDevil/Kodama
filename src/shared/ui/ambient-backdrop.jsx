import { useEffect, useRef, useState } from "react";

import { thumb } from "../api/thumbnails.js";

// Ambient app-wide backdrop: the playing track's heavily-blurred cover. New covers are
// preloaded, then stacked on top and faded in (crossfade); once a layer has fully faded in
// the layers beneath it are pruned. Passing thumbnail={null} clears it with no flash.
export function AmbientBackdrop({ thumbnail }) {
  const [layers, setLayers] = useState([]);
  const idRef = useRef(0);
  const curUrlRef = useRef(null);

  useEffect(() => {
    const url = thumbnail ? thumb(thumbnail) : null;
    if (url === curUrlRef.current) return;
    curUrlRef.current = url;
    if (!url) {
      setLayers([]);
      return;
    }
    const key = ++idRef.current;
    const img = new Image();
    img.onload = () => setLayers((prev) => [...prev, { key, url }].slice(-3));
    img.src = url;
  }, [thumbnail]);

  if (layers.length === 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        zIndex: -1,
        pointerEvents: "none",
        overflow: "hidden",
      }}
    >
      {layers.map((layer) => (
        <div
          key={layer.key}
          onAnimationEnd={() =>
            setLayers((prev) => {
              const idx = prev.findIndex((l) => l.key === layer.key);
              return idx <= 0 ? prev : prev.slice(idx);
            })
          }
          style={{
            position: "absolute",
            inset: 0,
            animation: "ambientFade 0.9s ease-out forwards",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: "-10%",
              backgroundImage: `url(${layer.url})`,
              backgroundSize: "cover",
              backgroundPosition: "center",
              filter: "blur(70px) saturate(1.5) brightness(0.9)",
              transform: "scale(1.2)",
            }}
          />
          <div
            style={{ position: "absolute", inset: 0, background: "var(--bg-base)", opacity: 0.45 }}
          />
        </div>
      ))}
    </div>
  );
}
