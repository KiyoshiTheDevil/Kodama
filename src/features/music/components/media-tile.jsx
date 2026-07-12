import { CardRoot } from "@heroui/react";

import { Microphone, MusicNote, Play } from "../../../icons.jsx";
import { thumb } from "../../../shared/api/thumbnails.js";

// Reusable media tile matching the Home-page card behavior (hover image-scale,
// play overlay, CardRoot). shape: "square" | "circle" | "video".
export function MediaTile({
  thumbnail,
  title,
  subtitle,
  fallbackIcon,
  shape = "square",
  size = 148,
  onOpen,
  onPlay,
  onContextMenu,
}) {
  const isVideo = shape === "video";
  const isCircle = shape === "circle";
  const w = isVideo ? 200 : size;
  const h = isVideo ? 113 : size;
  const Fallback = fallbackIcon || (isCircle ? Microphone : MusicNote);
  return (
    <CardRoot
      variant="transparent"
      className="home-card p-0! gap-0! rounded-none! shadow-none!"
      onClick={onOpen}
      onContextMenu={onContextMenu}
      style={{ flexShrink: 0, width: w, cursor: "default" }}
    >
      <div
        style={{
          position: "relative",
          marginBottom: 8,
          borderRadius: isCircle ? "50%" : 10,
          overflow: "hidden",
          boxShadow: "0 4px 14px rgba(0,0,0,0.3)",
        }}
      >
        <div style={{ width: w, height: h, background: "var(--bg-elevated)" }}>
          {thumbnail ? (
            <img
              className="home-card-img"
              src={thumb(thumbnail)}
              alt=""
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                transition: "transform 0.25s",
              }}
            />
          ) : (
            <div
              style={{
                width: "100%",
                height: "100%",
                background: "linear-gradient(135deg,#2a1535,#1a0a25)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Fallback size={Math.round(w * 0.3)} style={{ opacity: 0.3 }} />
            </div>
          )}
        </div>
        {onPlay && !isCircle && (
          <div
            className="home-card-play"
            style={{
              position: "absolute",
              bottom: 8,
              right: 8,
              opacity: 0,
              transform: "translateY(8px)",
              transition: "opacity 0.2s, transform 0.2s",
              pointerEvents: "none",
            }}
          >
            <div
              className="home-card-play-btn"
              onClick={(e) => {
                e.stopPropagation();
                onPlay(e);
              }}
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: "var(--accent)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                pointerEvents: "auto",
                cursor: "default",
                boxShadow: "0 4px 14px rgba(0,0,0,0.5)",
              }}
            >
              <Play size={17} weight="fill" style={{ color: "white", marginLeft: 2 }} />
            </div>
          </div>
        )}
      </div>
      <div
        style={{
          fontSize: "var(--t12)",
          fontWeight: 600,
          color: "var(--text-primary)",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          textAlign: isCircle ? "center" : "left",
        }}
      >
        {title}
      </div>
      {subtitle && (
        <div
          style={{
            fontSize: "var(--t11)",
            color: "var(--text-muted)",
            marginTop: 2,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            textAlign: isCircle ? "center" : "left",
          }}
        >
          {subtitle}
        </div>
      )}
    </CardRoot>
  );
}
