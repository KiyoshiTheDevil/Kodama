// The track-table view stack: a selection-action button, the shared table row, and the
// PlaylistLayout (used by playlist / album / liked / downloads / history). Extracted from App.jsx.
import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { thumb, useLang, useAnimations, useTrackNumbers } from "../context.jsx";
import { useAccentColor } from "../ui/use-accent-color.js";
import { Tooltip } from "../ui/tooltip.jsx";
import { ExplicitBadge, ArtistLinks, SkeletonRow } from "../ui/rows.jsx";
import { parseDurationToSeconds } from "../lyrics/parse.js";
import { usePlaybackStatus, usePlayerActions } from "../features/player/player-context.jsx";
import { useDownloadState, useDownloadActions } from "../features/downloads/download-context.jsx";
import {
  ArrowClockwise,
  ArrowLeft,
  CheckCircle,
  ClockCounterClockwise,
  Crown,
  DownloadSimple,
  Heart,
  MagnifyingGlass,
  Pause,
  Play,
  Shuffle,
  Trash,
} from "../icons.jsx";

function formatTotalDuration(tracks) {
  const totalSecs = tracks.reduce((sum, t) => sum + (parseDurationToSeconds(t.duration) || 0), 0);
  if (totalSecs <= 0) return null;
  const h = Math.floor(totalSecs / 3600);
  const m = Math.floor((totalSecs % 3600) / 60);
  const s = totalSecs % 60;
  if (h > 0) return `${h} h ${m} min`;
  if (m > 0) return `${m} min ${s} s`;
  return `${s} s`;
}

export function SelActionBtn({ icon, label, onClick, danger, iconOnly, horizontal }) {
  const [hov, setHov] = React.useState(false);
  const btn = (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: "flex",
        flexDirection: horizontal ? "row" : "column",
        alignItems: "center",
        justifyContent: "center",
        gap: horizontal ? 8 : 6,
        padding: iconOnly ? "10px 14px" : horizontal ? "10px 18px" : "10px 20px",
        border: "none",
        borderRadius: 12,
        background: hov
          ? danger
            ? "rgba(239,68,68,0.85)"
            : "rgba(255,255,255,0.10)"
          : "transparent",
        color: hov ? (danger ? "#fff" : "var(--text-primary)") : "var(--text-secondary)",
        cursor: "default",
        transition: "background 0.15s, color 0.15s",
        flexShrink: 0,
        fontFamily: "inherit",
      }}
    >
      <span style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
        {icon}
      </span>
      {!iconOnly && (
        <span
          style={{
            fontSize: horizontal ? "var(--t13)" : "var(--t11)",
            fontWeight: 500,
            whiteSpace: "nowrap",
            fontFamily: "inherit",
          }}
        >
          {label}
        </span>
      )}
    </button>
  );
  return iconOnly ? <Tooltip text={label}>{btn}</Tooltip> : btn;
}

export function TableRow({
  track,
  index,
  isPlaying,
  onPlay,
  onOpenArtist,
  onOpenAlbum,
  isAlbum,
  onContextMenu,
  isCached,
  isDownloading,
  onDownload,
  isPremiumOnly,
  selected = false,
  onToggleSelect,
}) {
  const anim = useAnimations();
  const t = useLang();
  const showNum = useTrackNumbers();

  const gridCols = onToggleSelect
    ? isAlbum
      ? "28px minmax(0,2fr) minmax(0,1fr) 28px 52px"
      : "28px minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) 28px 52px"
    : isAlbum
      ? "minmax(0,2fr) minmax(0,1fr) 28px 52px"
      : "minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) 28px 52px";

  const row = (
    <div
      data-track-id={track.videoId}
      onClick={isPremiumOnly ? undefined : () => onPlay(track)}
      onContextMenu={
        !isPremiumOnly && onContextMenu
          ? (e) => {
              e.preventDefault();
              onContextMenu(e, track);
            }
          : undefined
      }
      style={{ gridTemplateColumns: gridCols }}
      className={`group grid items-center gap-2 px-4 py-1 min-h-[52px] rounded-lg cursor-default transition-colors ${
        selected
          ? "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
          : isPlaying
            ? "bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]"
            : "hover:bg-hover"
      } ${isPremiumOnly ? "opacity-40" : ""}`}
    >
      {onToggleSelect && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            onToggleSelect();
          }}
          className={`flex items-center justify-center shrink-0 cursor-default transition-opacity ${selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
        >
          {selected ? (
            <CheckCircle size={18} weight="fill" className="text-accent" />
          ) : (
            <div className="w-4 h-4 rounded-full border-[1.5px] border-[var(--text-muted)] bg-elevated" />
          )}
        </div>
      )}
      {/* Title */}
      <div className="flex items-center gap-3 min-w-0">
        {showNum && (
          <span
            className={`w-6 text-right shrink-0 text-t12 tabular-nums ${isPlaying ? "text-accent" : "text-muted"}`}
          >
            {index + 1}
          </span>
        )}
        <div className="relative w-10 h-10 shrink-0 overflow-hidden rounded-md bg-elevated">
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
                <Pause size={12} className="text-accent" />
              )}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <div
            className={`flex items-center gap-1 overflow-hidden text-t13 font-medium ${isPlaying ? "text-accent" : "text-primary"}`}
          >
            <span className="truncate min-w-0">{track.title}</span>
            {track.isExplicit && <ExplicitBadge />}
          </div>
        </div>
      </div>
      {/* Artist */}
      <div className="text-t12 text-secondary truncate">
        <ArtistLinks track={track} onOpenArtist={onOpenArtist} />
        {(!track.artists || (Array.isArray(track.artists) && track.artists.length === 0)) && "—"}
      </div>
      {/* Album */}
      {!isAlbum && (
        <div
          onClick={(e) => {
            if (track.albumBrowseId && onOpenAlbum) {
              e.stopPropagation();
              onOpenAlbum({ browseId: track.albumBrowseId, title: track.album });
            }
          }}
          className="text-t12 text-secondary truncate cursor-default transition-colors hover:text-primary"
        >
          {track.album || "—"}
        </div>
      )}
      {/* Download */}
      <div
        className="flex justify-center"
        onClick={(e) => {
          e.stopPropagation();
          if (!isPremiumOnly && onDownload && !isCached && !isDownloading) onDownload(track);
        }}
      >
        {isPremiumOnly ? (
          <Crown size={14} weight="fill" className="text-[#f0b429]" />
        ) : isCached ? (
          <CheckCircle size={14} className="text-[#4caf50]" />
        ) : isDownloading ? (
          <DownloadSimple size={14} className="text-accent animate-pulse" />
        ) : onDownload ? (
          <DownloadSimple
            size={14}
            className="text-muted cursor-default opacity-0 transition-opacity group-hover:opacity-100"
          />
        ) : null}
      </div>
      {/* Duration */}
      <div className="text-t12 text-muted text-right">{track.duration || "—"}</div>
    </div>
  );

  return isPremiumOnly ? <Tooltip text={t("premiumOnly")}>{row}</Tooltip> : row;
}

// ─── Shared playlist/collection layout ────────────────────────────────────
export function PlaylistLayout({
  title,
  thumbnail,
  tracks,
  total,
  loading,
  progress,
  cached,
  onBack,
  isLiked,
  onOpenArtist,
  onOpenAlbum,
  isAlbum,
  albumArtists,
  albumArtistBrowseId,
  year,
  onRefresh,
  onTrackContextMenu,
  onDownloadAll,
  onRemoveAll,
  hideExplicit,
  onToggleLike,
  likedIds,
  selectedTracks,
  onToggleSelect,
  onSelectAll,
  extraActions,
  typeLabel,
}) {
  // Playback state/action from PlayerContext (Step 11) rather than currentTrack/isPlaying/onPlay props.
  const { track: currentTrack, isPlaying } = usePlaybackStatus();
  const { handlePlay } = usePlayerActions();
  // Cached/downloading/premium id sets + the single-track download action come from
  // DownloadContext (Step 12); onDownloadAll/onRemoveAll stay props since only collection/album
  // views offer a "download all" action.
  const { cachedSongIds, downloadingIds, premiumSongIds } = useDownloadState();
  const { downloadSong: onDownloadSong } = useDownloadActions();
  const accentColor = useAccentColor(thumbnail);
  const t = useLang();
  const [trackSearch, setTrackSearch] = useState("");
  const [searchVisible, setSearchVisible] = useState(false);
  const searchInputRef = useRef(null);

  useEffect(() => {
    if (searchVisible) searchInputRef.current?.focus();
  }, [searchVisible]);

  const visibleTracks = tracks.filter((tr) => {
    if (hideExplicit && tr.isExplicit) return false;
    if (trackSearch.trim()) {
      const q = trackSearch.toLowerCase();
      return (
        (tr.title || "").toLowerCase().includes(q) || (tr.artists || "").toLowerCase().includes(q)
      );
    }
    return true;
  });

  const totalDuration = formatTotalDuration(tracks);
  const skeletonCount = total ? Math.max(0, total - tracks.length) : 0;

  // ── List virtualization ─────────────────────────────────────────────────────
  // Only the visible rows are mounted (constant DOM regardless of list length).
  // The whole page scrolls (the list is NOT the scroll container), so we virtualize
  // against the nearest `.scrollable` ancestor and offset by the list's position in it.
  const listInnerRef = useRef(null);
  const [scrollEl, setScrollEl] = useState(null);
  const [listScrollMargin, setListScrollMargin] = useState(0);
  const [, bumpMeasure] = useState(0);

  useEffect(() => {
    const onResize = () => bumpMeasure((n) => n + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Re-measure the list's offset within the scroll container every render (cheap, guarded);
  // catches header-height changes as tracks/metadata stream in.
  useLayoutEffect(() => {
    const inner = listInnerRef.current;
    if (!inner) return;
    const sc = inner.closest(".scrollable");
    if (sc !== scrollEl) setScrollEl(sc);
    if (!sc) return;
    const top = Math.max(
      0,
      Math.round(inner.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop)
    );
    setListScrollMargin((prev) => (prev === top ? prev : top));
  });

  const skelN = trackSearch ? 0 : skeletonCount;
  const rowCount = visibleTracks.length + skelN;
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollEl,
    estimateSize: () => 52,
    overscan: 12,
    scrollMargin: listScrollMargin,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <style>{`@keyframes pulse{0%,100%{opacity:.4}50%{opacity:.9}}`}</style>

      {/* Hero header */}
      <div
        style={{
          position: "relative",
        }}
      >
        {/* Navigation row */}
        <div style={{ padding: "48px 22px 18px", display: "flex", gap: 8 }}>
          <button
            onClick={onBack || undefined}
            disabled={!onBack}
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "rgba(0,0,0,0.38)",
              border: "0.5px solid rgba(255,255,255,0.12)",
              color: onBack ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.25)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "default",
              backdropFilter: "blur(8px)",
              transition: "background 0.15s",
              padding: 0,
            }}
            onMouseEnter={(e) => {
              if (onBack) e.currentTarget.style.background = "rgba(0,0,0,0.58)";
            }}
            onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.38)")}
          >
            <ArrowLeft size={16} />
          </button>
        </div>

        {/* Album / playlist info */}
        <div style={{ display: "flex", gap: 26, alignItems: "flex-end", padding: "0 28px 28px" }}>
          {/* Cover */}
          <div
            style={{
              width: 190,
              height: 190,
              borderRadius: 12,
              flexShrink: 0,
              overflow: "hidden",
              background: "var(--bg-elevated)",
              boxShadow: `0 18px 52px rgba(${accentColor},0.38)`,
            }}
          >
            {thumbnail ? (
              <img
                src={thumb(thumbnail)}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  background: `linear-gradient(135deg, rgba(${accentColor},0.8), rgba(${accentColor},0.3))`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {isLiked ? (
                  <Heart size={72} weight="fill" style={{ color: "rgba(255,255,255,0.9)" }} />
                ) : typeLabel ? (
                  <ClockCounterClockwise size={72} style={{ color: "rgba(255,255,255,0.9)" }} />
                ) : null}
              </div>
            )}
          </div>

          {/* Info */}
          <div style={{ minWidth: 0, flex: 1 }}>
            {/* Type label */}
            <div
              style={{
                fontSize: "var(--t11)",
                fontWeight: 600,
                color: "rgba(255,255,255,0.5)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
                marginBottom: 8,
              }}
            >
              {typeLabel ?? (isAlbum ? t("album") : t("playlist"))}
            </div>

            {/* Title */}
            <div
              style={{
                fontSize: 38,
                fontWeight: 800,
                lineHeight: 1.1,
                marginBottom: 14,
                color: "#fff",
                textShadow: "0 2px 20px rgba(0,0,0,0.55)",
              }}
            >
              {title}
            </div>

            {/* Metadata row with pipe separators */}
            <div
              style={{
                fontSize: "var(--t13)",
                color: "rgba(255,255,255,0.65)",
                marginBottom: 20,
                display: "flex",
                alignItems: "center",
                gap: 0,
                flexWrap: "wrap",
              }}
            >
              {isAlbum && albumArtists && (
                <>
                  <span
                    onClick={() =>
                      albumArtistBrowseId &&
                      onOpenArtist?.({ browseId: albumArtistBrowseId, artist: albumArtists })
                    }
                    style={{
                      cursor: "default",
                      display: "inline-flex",
                      alignItems: "center",
                      background: `rgba(${accentColor},0.25)`,
                      border: `1px solid rgba(${accentColor},0.42)`,
                      borderRadius: 20,
                      padding: "3px 12px",
                      fontSize: "var(--t13)",
                      fontWeight: 600,
                      color: "var(--accent)",
                      transition: "background 0.15s, border-color 0.15s",
                      marginRight: 10,
                    }}
                    onMouseEnter={(e) => {
                      if (albumArtistBrowseId) {
                        e.currentTarget.style.background = `rgba(${accentColor},0.38)`;
                        e.currentTarget.style.borderColor = `rgba(${accentColor},0.65)`;
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = `rgba(${accentColor},0.25)`;
                      e.currentTarget.style.borderColor = `rgba(${accentColor},0.42)`;
                    }}
                  >
                    {albumArtists}
                  </span>
                  <span
                    style={{
                      color: "rgba(255,255,255,0.2)",
                      margin: "0 10px",
                      fontSize: "var(--t14)",
                    }}
                  >
                    |
                  </span>
                </>
              )}
              {isAlbum && year && (
                <>
                  <span>{year}</span>
                  <span
                    style={{
                      color: "rgba(255,255,255,0.2)",
                      margin: "0 10px",
                      fontSize: "var(--t14)",
                    }}
                  >
                    |
                  </span>
                </>
              )}
              <span>
                {total || tracks.length} {t("songs")}
              </span>
              {totalDuration && (
                <>
                  <span
                    style={{
                      color: "rgba(255,255,255,0.2)",
                      margin: "0 10px",
                      fontSize: "var(--t14)",
                    }}
                  >
                    |
                  </span>
                  <span>{totalDuration}</span>
                </>
              )}
            </div>

            {/* Action buttons — play left, secondary right */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              {/* Left: play + shuffle */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  onClick={() => tracks.length && handlePlay(tracks[0], tracks)}
                  style={{
                    background: `rgba(${accentColor},0.18)`,
                    border: `1px solid rgba(${accentColor},0.38)`,
                    borderRadius: 28,
                    height: 50,
                    padding: "0 28px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    cursor: "default",
                    transition: "background 0.18s, border-color 0.18s, transform 0.15s",
                    fontSize: "var(--t15)",
                    fontWeight: 700,
                    color: "var(--accent)",
                    fontFamily: "var(--font)",
                    backdropFilter: "blur(6px)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = `rgba(${accentColor},0.3)`;
                    e.currentTarget.style.borderColor = `rgba(${accentColor},0.6)`;
                    e.currentTarget.style.transform = "scale(1.03)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = `rgba(${accentColor},0.18)`;
                    e.currentTarget.style.borderColor = `rgba(${accentColor},0.38)`;
                    e.currentTarget.style.transform = "scale(1)";
                  }}
                >
                  <Play size={14} weight="fill" style={{ color: "var(--accent)" }} />
                  {t("playAll")}
                </button>
                {/* Shuffle: start the collection in a shuffled order without touching the player-bar shuffle toggle */}
                <button
                  title={t("shuffle")}
                  onClick={() => {
                    if (!tracks.length) return;
                    const sh = [...tracks].sort(() => Math.random() - 0.5);
                    handlePlay(sh[0], sh);
                  }}
                  style={{
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid var(--border)",
                    borderRadius: 28,
                    height: 50,
                    padding: "0 22px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 9,
                    cursor: "default",
                    transition: "background 0.18s, transform 0.15s",
                    fontSize: "var(--t14)",
                    fontWeight: 600,
                    color: "var(--text-secondary)",
                    fontFamily: "var(--font)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.12)";
                    e.currentTarget.style.transform = "scale(1.03)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "rgba(255,255,255,0.06)";
                    e.currentTarget.style.transform = "scale(1)";
                  }}
                >
                  <Shuffle size={15} />
                  {t("shuffle")}
                </button>
              </div>

              {/* Right: secondary actions */}
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {extraActions}
                {/* Inline search input */}
                <div
                  style={{
                    width: searchVisible ? 200 : 0,
                    overflow: "hidden",
                    transition: "width 0.25s cubic-bezier(0.4,0,0.2,1)",
                    display: "flex",
                    alignItems: "center",
                  }}
                >
                  <input
                    ref={searchInputRef}
                    value={trackSearch}
                    onChange={(e) => setTrackSearch(e.target.value)}
                    placeholder={t("searchInPlaylist")}
                    style={{
                      background: "rgba(0,0,0,0.35)",
                      border: "0.5px solid rgba(255,255,255,0.18)",
                      borderRadius: 20,
                      padding: "9px 14px",
                      fontSize: "var(--t13)",
                      color: "#fff",
                      outline: "none",
                      width: 200,
                      flexShrink: 0,
                      fontFamily: "var(--font)",
                    }}
                  />
                </div>
                {searchVisible && trackSearch && (
                  <span
                    style={{
                      fontSize: "var(--t12)",
                      color: "rgba(255,255,255,0.5)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {visibleTracks.length} {t("xOfY")} {tracks.length}
                  </span>
                )}
                {/* Search toggle */}
                <Tooltip text={t("searchInPlaylist")}>
                  <button
                    onClick={() => {
                      setSearchVisible((v) => !v);
                      if (searchVisible) setTrackSearch("");
                    }}
                    style={{
                      background: searchVisible ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.3)",
                      border: "0.5px solid rgba(255,255,255,0.15)",
                      borderRadius: "50%",
                      width: 42,
                      height: 42,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "default",
                      transition: "background 0.15s",
                      color: "rgba(255,255,255,0.85)",
                      padding: 0,
                      backdropFilter: "blur(6px)",
                    }}
                    onMouseEnter={(e) =>
                      (e.currentTarget.style.background = "rgba(255,255,255,0.2)")
                    }
                    onMouseLeave={(e) =>
                      (e.currentTarget.style.background = searchVisible
                        ? "rgba(255,255,255,0.16)"
                        : "rgba(0,0,0,0.3)")
                    }
                  >
                    <MagnifyingGlass size={15} />
                  </button>
                </Tooltip>

                {/* Download / downloaded state */}
                {onDownloadAll &&
                  tracks.length > 0 &&
                  (() => {
                    const allCached =
                      cachedSongIds && tracks.every((tr) => cachedSongIds.has(tr.videoId));
                    const someDownloading =
                      downloadingIds && tracks.some((tr) => downloadingIds.has(tr.videoId));
                    const btnBase = {
                      borderRadius: 28,
                      height: 42,
                      display: "flex",
                      alignItems: "center",
                      padding: "0 18px",
                      gap: 8,
                      fontSize: "var(--t13)",
                      fontWeight: 600,
                      cursor: "default",
                      transition: "background 0.15s, border-color 0.15s",
                      fontFamily: "var(--font)",
                      backdropFilter: "blur(6px)",
                      border: "0.5px solid rgba(255,255,255,0.15)",
                    };
                    return allCached ? (
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div
                          style={{
                            ...btnBase,
                            cursor: "default",
                            color: "#4caf50",
                            background: "rgba(76,175,80,0.12)",
                            border: "0.5px solid rgba(76,175,80,0.3)",
                          }}
                        >
                          <CheckCircle size={14} weight="fill" />
                          {t("downloaded")}
                        </div>
                        {onRemoveAll && (
                          <Tooltip text={t("removeDownload")}>
                            <button
                              onClick={() => onRemoveAll(tracks)}
                              style={{
                                background: "rgba(0,0,0,0.3)",
                                border: "0.5px solid rgba(255,255,255,0.15)",
                                borderRadius: "50%",
                                width: 42,
                                height: 42,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                cursor: "default",
                                transition: "background 0.15s",
                                color: "rgba(255,255,255,0.7)",
                                padding: 0,
                                backdropFilter: "blur(6px)",
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = "rgba(224,82,82,0.25)";
                                e.currentTarget.style.color = "#e05252";
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = "rgba(0,0,0,0.3)";
                                e.currentTarget.style.color = "rgba(255,255,255,0.7)";
                              }}
                            >
                              <Trash size={14} />
                            </button>
                          </Tooltip>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => onDownloadAll(tracks)}
                        disabled={someDownloading}
                        style={{
                          ...btnBase,
                          background: "rgba(0,0,0,0.3)",
                          color: "rgba(255,255,255,0.85)",
                          opacity: someDownloading ? 0.65 : 1,
                          cursor: someDownloading ? "default" : "default",
                        }}
                        onMouseEnter={(e) => {
                          if (!someDownloading)
                            e.currentTarget.style.background = "rgba(255,255,255,0.14)";
                        }}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(0,0,0,0.3)")}
                      >
                        {someDownloading ? (
                          <DownloadSimple
                            size={14}
                            style={{ animation: "pulse 1s ease-in-out infinite" }}
                          />
                        ) : (
                          <DownloadSimple size={14} />
                        )}
                        {t("downloadAll")}
                      </button>
                    );
                  })()}

                {/* Refresh */}
                {cached && onRefresh && (
                  <Tooltip text={t("refresh")}>
                    <button
                      onClick={onRefresh}
                      style={{
                        background: "rgba(0,0,0,0.3)",
                        border: "0.5px solid rgba(255,255,255,0.15)",
                        borderRadius: "50%",
                        width: 42,
                        height: 42,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "default",
                        transition: "background 0.15s, transform 0.15s",
                        color: "rgba(255,255,255,0.85)",
                        padding: 0,
                        backdropFilter: "blur(6px)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = "rgba(255,255,255,0.14)";
                        e.currentTarget.style.transform = "rotate(30deg)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = "rgba(0,0,0,0.3)";
                        e.currentTarget.style.transform = "rotate(0deg)";
                      }}
                    >
                      <ArrowClockwise size={14} />
                    </button>
                  </Tooltip>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Loading progress */}
      {loading && !cached && (
        <div style={{ padding: "0 28px 12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: "var(--t11)", color: "var(--text-muted)" }}>
              {t("fetchingSongs")}
            </span>
            <span style={{ fontSize: "var(--t11)", color: "var(--accent)", fontWeight: 500 }}>
              {progress}%
            </span>
          </div>
          <div
            style={{
              height: 3,
              background: "var(--bg-elevated)",
              borderRadius: 2,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                borderRadius: 2,
                background: "linear-gradient(90deg,var(--accent),#c020e0)",
                width: `${progress}%`,
                transition: "width 0.4s ease",
              }}
            />
          </div>
        </div>
      )}

      {/* Column headers */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: onToggleSelect
            ? isAlbum
              ? "28px minmax(0,2fr) minmax(0,1fr) 28px 52px"
              : "28px minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) 28px 52px"
            : isAlbum
              ? "minmax(0,2fr) minmax(0,1fr) 28px 52px"
              : "minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) 28px 52px",
          gap: 8,
          padding: "8px 16px",
          margin: "0 12px",
          borderBottom: "0.5px solid var(--border)",
          fontSize: "var(--t11)",
          fontWeight: 600,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {onToggleSelect &&
          (() => {
            const allSelected =
              visibleTracks.length > 0 &&
              visibleTracks.every((tr) => selectedTracks?.has(tr.videoId));
            return (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "default",
                }}
                onClick={() => onSelectAll?.(visibleTracks, allSelected)}
                title={allSelected ? t("deselectAll") : t("selectAll")}
              >
                {allSelected ? (
                  <CheckCircle size={18} weight="fill" style={{ color: "var(--accent)" }} />
                ) : (
                  <div
                    style={{
                      width: 16,
                      height: 16,
                      borderRadius: "50%",
                      border: "1.5px solid var(--text-muted)",
                      background: "var(--bg-elevated)",
                    }}
                  />
                )}
              </div>
            );
          })()}
        <div>{t("colTitle")}</div>
        <div>{t("colArtist")}</div>
        {!isAlbum && <div>{t("colAlbum")}</div>}
        <div></div>
        <div style={{ textAlign: "right" }}>{t("colDuration")}</div>
      </div>

      {/* Track list (virtualized — only on-screen rows are mounted) */}
      <div style={{ padding: "8px 12px 32px" }}>
        <div
          ref={listInnerRef}
          style={{ position: "relative", height: rowVirtualizer.getTotalSize() }}
        >
          {rowVirtualizer.getVirtualItems().map((vi) => {
            const i = vi.index;
            const tr = visibleTracks[i];
            return (
              <div
                key={vi.key}
                data-index={i}
                ref={rowVirtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${vi.start - listScrollMargin}px)`,
                }}
              >
                {tr ? (
                  <TableRow
                    track={tr}
                    index={i}
                    isPlaying={isPlaying && currentTrack?.videoId === tr.videoId}
                    onPlay={() => handlePlay(tr, visibleTracks)}
                    onOpenArtist={onOpenArtist}
                    onOpenAlbum={onOpenAlbum}
                    isAlbum={isAlbum}
                    onContextMenu={onTrackContextMenu}
                    isCached={cachedSongIds?.has(tr.videoId)}
                    isDownloading={downloadingIds?.has(tr.videoId)}
                    isPremiumOnly={premiumSongIds?.has(tr.videoId)}
                    onDownload={onDownloadSong}
                    selected={selectedTracks?.has(tr.videoId)}
                    onToggleSelect={onToggleSelect ? () => onToggleSelect(tr) : undefined}
                  />
                ) : (
                  <SkeletonRow />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
