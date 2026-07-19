// Shared leaf row/card primitives used across the library/playlist/search views.
// Extracted from App.jsx — depend only on context (thumb/animations) + icons.
import React from "react";
import { thumb, useAnimations } from "../context.jsx";
import { Pause } from "../icons.jsx";

export function ExplicitBadge() {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--text-muted)",
        color: "var(--bg-primary)",
        borderRadius: 3,
        fontSize: 9,
        fontWeight: 700,
        padding: "1px 4px",
        letterSpacing: "0.05em",
        flexShrink: 0,
        lineHeight: 1.2,
        userSelect: "none",
      }}
    >
      E
    </span>
  );
}

/**
 * Renders artist names as individual clickable spans (supports arrays of artist objects).
 * Falls back to a single span using track.artistBrowseId when artists is a plain string.
 */
export function ArtistLinks({ track, onOpenArtist, onBeforeNavigate, style }) {
  const base = { cursor: "default", transition: "color 0.15s", ...style };
  const hover = (e) => {
    e.currentTarget.style.color = "var(--accent)";
  };
  const unhover = (e) => {
    e.currentTarget.style.color = "";
  };

  // Prefer artistLinks from backend (has individual browseIds per artist)
  const links = track?.artistLinks;
  if (Array.isArray(links) && links.length > 0) {
    return links.map((a, i) => (
      <React.Fragment key={i}>
        {i > 0 && ", "}
        {a.browseId && onOpenArtist ? (
          <span
            onClick={(e) => {
              e.stopPropagation();
              onBeforeNavigate?.();
              onOpenArtist({ browseId: a.browseId, artist: a.name });
            }}
            style={base}
            onMouseEnter={hover}
            onMouseLeave={unhover}
          >
            {a.name}
          </span>
        ) : (
          a.name
        )}
      </React.Fragment>
    ));
  }

  // Fallback: single artistBrowseId (old data / SQLite cache)
  const artists = track?.artists;
  if (track?.artistBrowseId && onOpenArtist) {
    return (
      <span
        onClick={(e) => {
          e.stopPropagation();
          onBeforeNavigate?.();
          onOpenArtist({ browseId: track.artistBrowseId, artist: artists });
        }}
        style={base}
        onMouseEnter={hover}
        onMouseLeave={unhover}
      >
        {artists}
      </span>
    );
  }
  return artists ?? null;
}

function formatDuration(str) {
  if (!str) return "";
  return str;
}

export function TrackRow({ track, isPlaying, onPlay, onOpenArtist, onContextMenu }) {
  const anim = useAnimations();
  return (
    <div
      data-track-id={track.videoId}
      onClick={() => onPlay(track)}
      onContextMenu={
        onContextMenu
          ? (e) => {
              e.preventDefault();
              onContextMenu(e, track);
            }
          : undefined
      }
      className={`flex items-center gap-3 px-4 py-2 rounded-[var(--radius)] cursor-default transition-colors ${
        isPlaying ? "bg-accent-dim" : "hover:bg-hover"
      }`}
    >
      <div className="relative w-11 h-11 shrink-0 overflow-hidden rounded-md bg-elevated">
        {track.thumbnail ? (
          <img src={thumb(track.thumbnail)} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-[linear-gradient(135deg,#2a1535,#1a0a25)]" />
        )}
        {isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center gap-0.5 bg-black/50">
            {anim ? (
              [1, 2, 3].map((b) => (
                <div
                  key={b}
                  className="w-[3px] rounded-[2px] bg-accent"
                  style={{
                    animation: `eqBar${b} ${0.6 + b * 0.15}s ease-in-out infinite`,
                    animationDelay: `${b * 0.1}s`,
                  }}
                />
              ))
            ) : (
              <Pause size={15} className="text-accent" />
            )}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-hidden">
        <div
          className={`flex items-center gap-1 overflow-hidden text-t13 font-medium transition-colors ${isPlaying ? "text-accent" : "text-primary"}`}
        >
          <span className="truncate min-w-0">{track.title}</span>
          {track.isExplicit && <ExplicitBadge />}
        </div>
        <div className="text-t12 text-secondary truncate">
          <ArtistLinks track={track} onOpenArtist={onOpenArtist} />
          {track.album ? ` · ${track.album}` : ""}
        </div>
      </div>
      <div className="text-t12 text-muted shrink-0">{formatDuration(track.duration)}</div>
    </div>
  );
}

export function GridCard({ thumbnail, title, subtitle, onClick, onContextMenu, cardId }) {
  return (
    <div
      data-card-id={cardId}
      onClick={onClick}
      onContextMenu={onContextMenu}
      className="grid-card cursor-default overflow-hidden rounded-[14px] bg-surface shadow-[0_2px_10px_rgba(0,0,0,0.3)] transition-[transform,box-shadow] duration-200 hover:scale-[1.03] hover:shadow-[0_12px_32px_rgba(0,0,0,0.55)]"
    >
      {/* Thumbnail */}
      <div className="w-full aspect-square overflow-hidden bg-elevated">
        {thumbnail ? (
          <img src={thumb(thumbnail)} alt="" className="block w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-[linear-gradient(135deg,#2a1535,#1a0a25)]" />
        )}
      </div>
      {/* Info footer */}
      <div className="grid-card-footer min-h-[52px] px-[14px] pt-3 pb-[14px] bg-[rgb(10,10,12)]">
        <div className="text-t13 font-semibold text-white truncate">{title}</div>
        <div className="text-t11 text-muted mt-1 min-h-[14px] truncate">{subtitle || ""}</div>
      </div>
    </div>
  );
}

export function SkeletonRow() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "8px 16px",
        borderRadius: "var(--radius)",
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 6,
          background: "var(--bg-elevated)",
          flexShrink: 0,
          animation: "pulse 1.4s ease-in-out infinite",
        }}
      />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        <div
          style={{
            height: 12,
            width: "45%",
            borderRadius: 4,
            background: "var(--bg-elevated)",
            animation: "pulse 1.4s ease-in-out infinite",
          }}
        />
        <div
          style={{
            height: 10,
            width: "30%",
            borderRadius: 4,
            background: "var(--bg-elevated)",
            animation: "pulse 1.4s ease-in-out 0.2s infinite",
          }}
        />
      </div>
      <div
        style={{
          height: 10,
          width: 36,
          borderRadius: 4,
          background: "var(--bg-elevated)",
          animation: "pulse 1.4s ease-in-out infinite",
        }}
      />
    </div>
  );
}
