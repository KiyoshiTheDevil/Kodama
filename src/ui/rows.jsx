// Shared leaf row/card primitives used across the library/playlist/search views.
// Extracted from App.jsx — depend only on context (thumb/animations) + icons.
import React from "react";
import { thumb, useAnimations } from "../context.jsx";
import { Pause, Play, Shuffle, MusicNote } from "../icons.jsx";

export function ExplicitBadge() {
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      background: "var(--text-muted)", color: "var(--bg-primary)",
      borderRadius: "var(--r-xs)", fontSize: 9, fontWeight: 700, padding: "1px 4px",
      letterSpacing: "0.05em", flexShrink: 0, lineHeight: 1.2, userSelect: "none",
    }}>E</span>
  );
}

/**
 * Renders artist names as individual clickable spans (supports arrays of artist objects).
 * Falls back to a single span using track.artistBrowseId when artists is a plain string.
 */
export function ArtistLinks({ track, onOpenArtist, onBeforeNavigate, style }) {
  const base = { cursor: "default", transition: "color 0.15s", ...style };
  const hover   = e => { e.currentTarget.style.color = "var(--accent)"; };
  const unhover = e => { e.currentTarget.style.color = ""; };

  // Prefer artistLinks from backend (has individual browseIds per artist)
  const links = track?.artistLinks;
  if (Array.isArray(links) && links.length > 0) {
    return links.map((a, i) => (
      <React.Fragment key={i}>
        {i > 0 && ", "}
        {a.browseId && onOpenArtist
          ? <span
              onClick={e => { e.stopPropagation(); onBeforeNavigate?.(); onOpenArtist({ browseId: a.browseId, artist: a.name }); }}
              style={base} onMouseEnter={hover} onMouseLeave={unhover}
            >{a.name}</span>
          : a.name}
      </React.Fragment>
    ));
  }

  // Fallback: single artistBrowseId (old data / SQLite cache)
  const artists = track?.artists;
  if (track?.artistBrowseId && onOpenArtist) {
    return (
      <span
        onClick={e => { e.stopPropagation(); onBeforeNavigate?.(); onOpenArtist({ browseId: track.artistBrowseId, artist: artists }); }}
        style={base} onMouseEnter={hover} onMouseLeave={unhover}
      >{artists}</span>
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
      onClick={() => onPlay(track)}
      onContextMenu={onContextMenu ? (e) => { e.preventDefault(); onContextMenu(e, track); } : undefined}
      className={`flex items-center gap-3 px-4 py-2 rounded-[var(--radius)] cursor-default transition-colors ${
        isPlaying ? "bg-accent-dim" : "hover:bg-hover"
      }`}
    >
      <div className="relative w-11 h-11 shrink-0 overflow-hidden rounded-md bg-elevated">
        {track.thumbnail
          ? <img src={thumb(track.thumbnail)} alt="" className="w-full h-full object-cover" />
          : <div className="w-full h-full bg-[image:var(--placeholder-gradient)]" />}
        {isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center gap-0.5 bg-black/50">
            {anim
              ? [1, 2, 3].map(b => (
                  <div
                    key={b}
                    className="w-[3px] rounded-[2px] bg-accent"
                    style={{ animation: `eqBar${b} ${0.6 + b * 0.15}s ease-in-out infinite`, animationDelay: `${b * 0.1}s` }}
                  />
                ))
              : <Pause size={15} className="text-accent" />}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-hidden">
        <div className={`flex items-center gap-1 overflow-hidden text-t13 font-medium transition-colors ${isPlaying ? "text-accent" : "text-primary"}`}>
          <span className="truncate min-w-0">{track.title}</span>
          {track.isExplicit && <ExplicitBadge />}
        </div>
        <div className="text-t12 text-secondary truncate">
          <ArtistLinks track={track} onOpenArtist={onOpenArtist} />
          {track.album ? ` · ${track.album}` : ""}
        </div>
      </div>
      <div className="text-t12 text-muted shrink-0">
        {formatDuration(track.duration)}
      </div>
    </div>
  );
}

// Frameless grid card: the cover floats on the page, the title sits below it. Optional extras:
// `count` renders a frosted song-count pill on the cover; `onPlay`/`onShuffle` render hover
// buttons in the bottom-right (each stops propagation so it doesn't also fire the card's onClick).
export function GridCard({ thumbnail, title, subtitle, count, onClick, onPlay, onShuffle, onContextMenu, cardId, playLabel, shuffleLabel }) {
  const act = (fn) => (e) => { e.stopPropagation(); fn?.(); };
  return (
    <div data-card-id={cardId} className="gcard cursor-default" onContextMenu={onContextMenu}>
      {/* Cover */}
      <div className="gcard-thumb aspect-square bg-elevated" onClick={onClick}>
        {thumbnail
          ? <img src={thumb(thumbnail)} alt="" className="gcard-img" />
          : <div className="w-full h-full bg-[image:var(--placeholder-gradient)]" />}
        {(count != null && count !== "") && (
          <span className="gcard-badge"><MusicNote size={11} weight="fill" />{count}</span>
        )}
        {(onPlay || onShuffle) && (
          <div className="gcard-actions">
            {onShuffle && (
              <button className="gcard-btn gcard-btn-shuffle" onClick={act(onShuffle)} title={shuffleLabel} aria-label={shuffleLabel}>
                <Shuffle size={15} weight="bold" />
              </button>
            )}
            {onPlay && (
              <button className="gcard-btn gcard-btn-play" onClick={act(onPlay)} title={playLabel} aria-label={playLabel}>
                <Play size={17} weight="fill" />
              </button>
            )}
          </div>
        )}
      </div>
      {/* Title + subtitle below the cover */}
      <div className="pt-3 px-0.5" onClick={onClick}>
        <div className="text-t13 font-semibold text-primary truncate">{title}</div>
        {subtitle ? <div className="text-t12 text-muted mt-0.5 truncate">{subtitle}</div> : null}
      </div>
    </div>
  );
}

// Fills its slot rather than sizing itself: it stands in for a track row inside a
// virtualised list, so it has to occupy exactly the same height as the real thing.
// It used to be 60px tall against rows of 64, which quietly skewed the list's total height.
export function SkeletonRow() {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 12, height: "100%",
      padding: "0 16px", borderRadius: "var(--radius)",
    }}>
      <div style={{ width: 48, height: 48, borderRadius: "var(--r-md)", background: "var(--bg-elevated)", flexShrink: 0,
        animation: "pulse 1.4s ease-in-out infinite" }} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        <div style={{ height: 12, width: "45%", borderRadius: "var(--r-sm)", background: "var(--bg-elevated)",
          animation: "pulse 1.4s ease-in-out infinite" }} />
        <div style={{ height: 10, width: "30%", borderRadius: "var(--r-sm)", background: "var(--bg-elevated)",
          animation: "pulse 1.4s ease-in-out 0.2s infinite" }} />
      </div>
      <div style={{ height: 10, width: 36, borderRadius: "var(--r-sm)", background: "var(--bg-elevated)",
        animation: "pulse 1.4s ease-in-out infinite" }} />
    </div>
  );
}
