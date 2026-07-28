// The track-table view stack: a selection-action button, the shared table row, and the
// PlaylistLayout (used by playlist / album / liked / downloads / history). Extracted from App.jsx.
import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Button } from "@heroui/react";
import { thumb, useLang, useAnimations, useTrackNumbers } from "../context.jsx";
import { useAccentColor } from "../ui/use-accent-color.js";
import { Tooltip } from "../ui/tooltip.jsx";
import { ExplicitBadge, ArtistLinks, SkeletonRow } from "../ui/rows.jsx";
import { parseDurationToSeconds } from "../lyrics/parse.js";
import { ArrowClockwise, ArrowLeft, CheckCircle, ClockCounterClockwise, Crown, DownloadSimple, Heart, MagnifyingGlass, Pause, Play, Shuffle, Trash } from "../icons.jsx";

// Collapsing-header geometry. CARD_H is the height the pinned card reserves in the flow;
// the poster is pulled up under it by exactly that much, so the header's total height is
// POSTER_H at every scroll position. Keeping it constant is what stops the virtualised
// list from jumping — the page is the scroll container, so a shrinking header would move
// every row's offset mid-scroll.
// The pinned bar is a floating card, inset from the edges rather than a full-width slab.
// BAND_TOP keeps it clear of TitleBar (fixed at y=4..36) and of the ScrollShadow, which fades
// the container's first 28px.
const BAND_TOP = 30;
const CARD_H = 66;
const POSTER_H = 400;
// Exactly the distance the poster travels before its bottom edge meets the pinned card. Any
// shorter and the collapse finishes early, leaving a band of empty backdrop between the card
// and the first row.
const COLLAPSE_DIST = POSTER_H - BAND_TOP - CARD_H;

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
  const btn = (
    <Button
      variant="ghost"
      size="sm"
      isIconOnly={iconOnly}
      onPress={onClick}
      className={`rounded-xl shrink-0 ${danger ? "text-[var(--status-danger)]! hover:text-white! hover:bg-[rgba(239,68,68,0.85)]!" : ""} ${horizontal ? "gap-2 px-4.5!" : ""}`}
    >
      {icon}
      {!iconOnly && <span className="text-t13 font-medium whitespace-nowrap">{label}</span>}
    </Button>
  );
  return iconOnly ? <Tooltip text={label}>{btn}</Tooltip> : btn;
}

export function TableRow({ track, index, isPlaying, onPlay, onOpenArtist, onOpenAlbum, isAlbum, onContextMenu, isCached, isDownloading, onDownload, isPremiumOnly, selected = false, onToggleSelect }) {
  const anim = useAnimations();
  const t = useLang();
  const showNum = useTrackNumbers();

  const gridCols = onToggleSelect
    ? (isAlbum ? "28px minmax(0,2fr) minmax(0,1fr) 28px 52px" : "28px minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) 28px 52px")
    : (isAlbum ? "minmax(0,2fr) minmax(0,1fr) 28px 52px" : "minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) 28px 52px");

  const row = (
    <div
      data-track-id={track.videoId}
      onClick={isPremiumOnly ? undefined : () => onPlay(track)}
      onContextMenu={(!isPremiumOnly && onContextMenu) ? (e) => { e.preventDefault(); onContextMenu(e, track); } : undefined}
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
          onClick={e => { e.stopPropagation(); onToggleSelect(); }}
          className={`flex items-center justify-center shrink-0 cursor-default transition-opacity ${selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
        >
          {selected
            ? <CheckCircle size={18} weight="fill" className="text-accent" />
            : <div className="w-4 h-4 rounded-full border-[1.5px] border-[var(--text-muted)] bg-elevated" />}
        </div>
      )}
      {/* Title */}
      <div className="flex items-center gap-3 min-w-0">
        {showNum && <span className={`w-6 text-right shrink-0 text-t12 tabular-nums ${isPlaying ? "text-accent" : "text-muted"}`}>{index + 1}</span>}
        <div className="relative w-10 h-10 shrink-0 overflow-hidden rounded-md bg-elevated">
          {track.thumbnail
            ? <img src={thumb(track.thumbnail)} alt="" className="w-full h-full object-cover" />
            : <div className="w-full h-full bg-[image:var(--placeholder-gradient)]" />}
          {isPlaying && (
            <div className="absolute inset-0 flex items-center justify-center gap-0.5 bg-black/50">
              {anim ? [1, 2, 3].map(b => (
                <div key={b} className="w-[3px] rounded-[2px] bg-accent" style={{ animation: `eqBar${b} ${0.6 + b * 0.15}s ease-in-out infinite`, animationDelay: `${b * 0.1}s` }} />
              )) : <Pause size={12} className="text-accent" />}
            </div>
          )}
        </div>
        <div className="min-w-0">
          <div className={`flex items-center gap-1 overflow-hidden text-t13 font-medium ${isPlaying ? "text-accent" : "text-primary"}`}>
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
          onClick={e => { if (track.albumBrowseId && onOpenAlbum) { e.stopPropagation(); onOpenAlbum({ browseId: track.albumBrowseId, title: track.album }); }}}
          className="text-t12 text-secondary truncate cursor-default transition-colors hover:text-primary"
        >
          {track.album || "—"}
        </div>
      )}
      {/* Download */}
      <div className="flex justify-center"
        onClick={e => { e.stopPropagation(); if (!isPremiumOnly && onDownload && !isCached && !isDownloading) onDownload(track); }}
      >
        {isPremiumOnly ? (
          <Crown size={14} weight="fill" className="text-[var(--status-warning)]" />
        ) : isCached ? (
          <CheckCircle size={14} className="text-[var(--status-success)]" />
        ) : isDownloading ? (
          <DownloadSimple size={14} className="text-accent animate-pulse" />
        ) : onDownload ? (
          <DownloadSimple size={14} className="text-muted cursor-default opacity-0 transition-opacity group-hover:opacity-100" />
        ) : null}
      </div>
      {/* Duration */}
      <div className="text-t12 text-muted text-right">
        {track.duration || "—"}
      </div>
    </div>
  );

  return isPremiumOnly
    ? <Tooltip text={t("premiumOnly")}>{row}</Tooltip>
    : row;
}

// ─── Shared playlist/collection layout ────────────────────────────────────
export function PlaylistLayout({ title, thumbnail, tracks, total, loading, progress, cached, onPlay, currentTrack, isPlaying, onBack, isLiked, onOpenArtist, onOpenAlbum, isAlbum, albumArtists, albumArtistBrowseId, year, onRefresh, onTrackContextMenu, cachedSongIds, downloadingIds, premiumSongIds, onDownloadSong, onDownloadAll, onRemoveAll, hideExplicit, onToggleLike, likedIds, selectedTracks, onToggleSelect, onSelectAll, extraActions, typeLabel }) {
  const accentColor = useAccentColor(thumbnail);
  const t = useLang();
  const [trackSearch, setTrackSearch] = useState("");
  const [searchVisible, setSearchVisible] = useState(false);
  // The header renders its search field twice — once in the poster, once in the collapsed
  // bar — so focus has to go to whichever one is currently on screen.
  const posterSearchRef = useRef(null);
  const bandSearchRef = useRef(null);
  const posterRef = useRef(null);
  const bandRef = useRef(null);

  useEffect(() => {
    if (!searchVisible) return;
    const collapsed = parseFloat(bandRef.current?.style.opacity || "0") > 0.5;
    (collapsed ? bandSearchRef : posterSearchRef).current?.focus();
  }, [searchVisible]);

  const visibleTracks = tracks.filter(tr => {
    if (hideExplicit && tr.isExplicit) return false;
    if (trackSearch.trim()) {
      const q = trackSearch.toLowerCase();
      return (tr.title || "").toLowerCase().includes(q) || (tr.artists || "").toLowerCase().includes(q);
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
    const onResize = () => bumpMeasure(n => n + 1);
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
    const top = Math.max(0, Math.round(inner.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop));
    setListScrollMargin(prev => (prev === top ? prev : top));
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

  // ── Collapsing header ───────────────────────────────────────────────────────
  // The poster fades into a compact bar as you scroll. Progress is written straight to
  // the DOM from a rAF-throttled scroll handler — putting it in state would re-render
  // the whole (virtualised) list on every frame.
  useEffect(() => {
    if (!scrollEl) return;
    let raf = 0;
    const apply = () => {
      raf = 0;
      const t = Math.min(1, Math.max(0, scrollEl.scrollTop / COLLAPSE_DIST));
      const p = posterRef.current;
      const b = bandRef.current;
      if (p) {
        p.style.opacity = String(Math.max(0, 1 - t * 1.7));
        // "none" rather than a no-op scale(1) at rest: any transform promotes the subtree to
        // its own layer and re-rasterises the text, which visibly softens it (the header's
        // button labels looked blurry until this).
        p.style.transform = t === 0
          ? "none"
          : `translateY(${(-t * 26).toFixed(1)}px) scale(${(1 - t * 0.06).toFixed(3)})`;
        p.style.pointerEvents = t > 0.5 ? "none" : "auto";
      }
      if (b) {
        const o = Math.max(0, t * 2 - 1);
        b.style.opacity = String(o);
        b.style.pointerEvents = o > 0.5 ? "auto" : "none";
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(apply); };
    apply();
    scrollEl.addEventListener("scroll", onScroll, { passive: true });
    return () => { scrollEl.removeEventListener("scroll", onScroll); if (raf) cancelAnimationFrame(raf); };
  }, [scrollEl]);

  const roundBtn = (px) => ({
    background: "rgba(0,0,0,0.3)", border: "none",
    borderRadius: "50%", width: px, height: px, display: "flex", alignItems: "center",
    justifyContent: "center", cursor: "default",
    transition: "background 0.15s, transform 0.12s",
    color: "rgba(255,255,255,0.85)", padding: 0, backdropFilter: "blur(6px)", flexShrink: 0,
  });

  // HeroUI presses its buttons to scale(.97); these are hand-rolled elements, so they'd
  // otherwise feel dead next to the rest of the app. Applied via inline style because the
  // hover handlers below already write to style, which would beat a CSS :active rule.
  const press = {
    onPointerDown: e => { e.currentTarget.style.transform = "scale(0.97)"; },
    onPointerUp: e => { e.currentTarget.style.transform = ""; },
    onPointerLeave: e => { e.currentTarget.style.transform = ""; },
  };

  const backButton = (px) => (
    <button
      {...press}
      onClick={onBack || undefined} disabled={!onBack}
      style={{ ...roundBtn(px), background: "rgba(0,0,0,0.38)", color: onBack ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.25)" }}
      onMouseEnter={e => { if (onBack) e.currentTarget.style.background = "rgba(0,0,0,0.58)"; }}
      onMouseLeave={e => { e.currentTarget.style.background = "rgba(0,0,0,0.38)"; e.currentTarget.style.transform = ""; }}
    >
      <ArrowLeft size={Math.round(px * 0.45)} />
    </button>
  );

  const coverArt = (px, radius) => (
    <div style={{
      width: px, height: px, borderRadius: radius, flexShrink: 0, overflow: "hidden",
      background: "var(--bg-elevated)",
      boxShadow: px > 80 ? `0 18px 52px rgba(${accentColor},0.38)` : "var(--elevation-2)",
    }}>
      {thumbnail
        ? <img src={thumb(thumbnail)} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        : <div style={{ width: "100%", height: "100%", background: `linear-gradient(135deg, rgba(${accentColor},0.8), rgba(${accentColor},0.3))`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {isLiked
              ? <Heart size={Math.round(px * 0.38)} weight="fill" style={{ color: "rgba(255,255,255,0.9)" }} />
              : typeLabel
              ? <ClockCounterClockwise size={Math.round(px * 0.38)} style={{ color: "rgba(255,255,255,0.9)" }} />
              : null}
          </div>}
    </div>
  );

  // Compact one-liner for the bar; the poster gets the richer row with the artist chip.
  const compactMeta = (trackSearch
    ? [`${visibleTracks.length} ${t("xOfY")} ${tracks.length}`]
    : [
        isAlbum && albumArtists ? albumArtists : null,
        isAlbum && year ? String(year) : null,
        `${total || tracks.length} ${t("songs")}`,
        totalDuration,
      ]
  ).filter(Boolean).join("  ·  ");

  // One action set, two sizes. Everything stays reachable in the collapsed bar too — the
  // secondary actions shrink to icons rather than disappearing into a menu.
  const headerActions = (compact) => {
    const px = compact ? 34 : 44;
    const pillH = compact ? 34 : 48;
    const fs = compact ? "var(--t13)" : "var(--t14)";
    const pill = {
      borderRadius: "var(--r-full)", height: pillH, display: "flex", alignItems: "center",
      justifyContent: "center", gap: compact ? 7 : 9, cursor: "default", fontWeight: 700,
      fontSize: fs, fontFamily: "var(--font)", flexShrink: 0,
      transition: "background 0.18s, border-color 0.18s, transform 0.12s",
    };
    const allCached = cachedSongIds && tracks.length > 0 && tracks.every(tr => cachedSongIds.has(tr.videoId));
    const someDownloading = downloadingIds && tracks.some(tr => downloadingIds.has(tr.videoId));
    return (
      <>
        {/* Play carries the app accent rather than the collection's own cover colour: with
            the dynamic accent on, that follows the playing track, so the primary action
            stays in step with the rest of the UI instead of sitting on the playlist's hue. */}
        <button
          {...press}
          onClick={() => tracks.length && onPlay(tracks[0], tracks)}
          style={{ ...pill, padding: compact ? "0 16px" : "0 26px", background: "var(--accent)", border: "none", color: "var(--accent-foreground)" }}
          onMouseEnter={e => { e.currentTarget.style.background = "color-mix(in srgb, var(--accent) 86%, #fff)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "var(--accent)"; e.currentTarget.style.transform = ""; }}
        >
          <Play size={compact ? 13 : 15} weight="fill" style={{ color: "var(--accent-foreground)" }} />
          {t("playAll")}
        </button>

        <Tooltip text={t("shuffle")}><button
          {...press}
          onClick={() => { if (!tracks.length) return; const sh = [...tracks].sort(() => Math.random() - 0.5); onPlay(sh[0], sh); }}
          style={compact
            ? { ...roundBtn(px), color: "#fff" }
            : { ...pill, padding: "0 22px", background: "rgba(255,255,255,0.06)", border: "none", color: "#fff", fontWeight: 600 }}
          onMouseEnter={e => { e.currentTarget.style.background = compact ? "rgba(255,255,255,0.16)" : "rgba(255,255,255,0.12)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = compact ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.06)"; e.currentTarget.style.transform = ""; }}
        >
          <Shuffle size={15} />
          {!compact && t("shuffle")}
        </button></Tooltip>

        <div style={{ width: 1, height: compact ? 18 : 22, background: "rgba(255,255,255,0.12)", margin: "0 2px", flexShrink: 0 }} />

        {extraActions}

        {/* Search: field and toggle share one group, so the collapsed (zero-width) field
            doesn't leave a second row gap behind and push the divider out of rhythm. */}
        <div style={{ display: "flex", alignItems: "center", gap: searchVisible ? 8 : 0, flexShrink: 0 }}>
          <div style={{ width: searchVisible ? (compact ? 180 : 200) : 0, overflow: "hidden", transition: "width 0.25s cubic-bezier(0.4,0,0.2,1)", display: "flex", alignItems: "center", flexShrink: 0 }}>
            <input
              ref={compact ? bandSearchRef : posterSearchRef}
              value={trackSearch}
              onChange={e => setTrackSearch(e.target.value)}
              placeholder={t("searchInPlaylist")}
              style={{
                background: "rgba(0,0,0,0.35)", border: "none",
                borderRadius: "var(--r-full)", padding: "0 16px",
                height: px, boxSizing: "border-box",
                fontSize: "var(--t13)", color: "#fff", outline: "none",
                width: compact ? 180 : 200, flexShrink: 0, fontFamily: "var(--font)",
              }}
            />
          </div>

          <Tooltip text={t("searchInPlaylist")}><button
            {...press}
            onClick={() => { setSearchVisible(v => !v); if (searchVisible) setTrackSearch(""); }}
            style={{ ...roundBtn(px), background: searchVisible ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.3)" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,0.2)"}
            onMouseLeave={e => { e.currentTarget.style.background = searchVisible ? "rgba(255,255,255,0.16)" : "rgba(0,0,0,0.3)"; e.currentTarget.style.transform = ""; }}
          >
            <MagnifyingGlass size={15} />
          </button></Tooltip>
        </div>

        {/* Download all / downloaded */}
        {onDownloadAll && tracks.length > 0 && (allCached ? (
          <>
            <div style={{ ...pill, padding: compact ? "0 12px" : "0 18px", color: "var(--status-success)", background: "var(--status-success-soft)", border: "none", fontWeight: 600, backdropFilter: "blur(6px)" }}>
              <CheckCircle size={14} weight="fill" />
              {!compact && t("downloaded")}
            </div>
            {onRemoveAll && (
              <Tooltip text={t("removeDownload")}><button
                {...press}
                onClick={() => onRemoveAll(tracks)}
                style={{ ...roundBtn(px), color: "rgba(255,255,255,0.7)" }}
                onMouseEnter={e => { e.currentTarget.style.background = "var(--status-danger-line)"; e.currentTarget.style.color = "var(--status-danger)"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "rgba(0,0,0,0.3)"; e.currentTarget.style.color = "rgba(255,255,255,0.7)"; e.currentTarget.style.transform = ""; }}
              >
                <Trash size={14} />
              </button></Tooltip>
            )}
          </>
        ) : compact ? (
          <Tooltip text={t("downloadAll")}><button
            {...press}
            onClick={() => onDownloadAll(tracks)} disabled={someDownloading}
            style={{ ...roundBtn(px), opacity: someDownloading ? 0.65 : 1 }}
            onMouseEnter={e => { if (!someDownloading) e.currentTarget.style.background = "rgba(255,255,255,0.14)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(0,0,0,0.3)"; e.currentTarget.style.transform = ""; }}
          >
            <DownloadSimple size={14} style={someDownloading ? { animation: "pulse 1s ease-in-out infinite" } : undefined} />
          </button></Tooltip>
        ) : (
          <button
            {...press}
            onClick={() => onDownloadAll(tracks)} disabled={someDownloading}
            style={{ ...pill, padding: "0 18px", background: "rgba(0,0,0,0.3)", color: "rgba(255,255,255,0.85)", border: "none", fontWeight: 600, opacity: someDownloading ? 0.65 : 1 }}
            onMouseEnter={e => { if (!someDownloading) e.currentTarget.style.background = "rgba(255,255,255,0.14)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(0,0,0,0.3)"; e.currentTarget.style.transform = ""; }}
          >
            <DownloadSimple size={14} style={someDownloading ? { animation: "pulse 1s ease-in-out infinite" } : undefined} />
            {t("downloadAll")}
          </button>
        ))}

        {cached && onRefresh && (
          <Tooltip text={t("refresh")}><button
            onClick={onRefresh}
            onPointerDown={e => { e.currentTarget.style.transform = "rotate(30deg) scale(0.97)"; }}
            onPointerUp={e => { e.currentTarget.style.transform = "rotate(30deg)"; }}
            style={roundBtn(px)}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.14)"; e.currentTarget.style.transform = "rotate(30deg)"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(0,0,0,0.3)"; e.currentTarget.style.transform = "rotate(0deg)"; }}
          >
            <ArrowClockwise size={14} />
          </button></Tooltip>
        )}
      </>
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}>
      <style>{`@keyframes pulse{0%,100%{opacity:.4}50%{opacity:.9}}`}</style>

      {/* ── Collapsing hero header ──────────────────────────────────────────────
          Two states of the same header: a centred poster on arrival, a compact bar
          once you scroll. The card is sticky and reserves CARD_H in the flow; the
          poster is pulled up under it by exactly that much, so the header occupies
          POSTER_H at every scroll position. That constant height is deliberate — the
          page is the scroll container, so a header that actually shrank would move
          listScrollMargin and make the virtualised rows jump under the cursor.

          The bar is a direct child of the column below, NOT of a header wrapper: a sticky
          element only stays pinned while its own parent box is still on screen, so wrapping
          it in a 400px header made it scroll away with that wrapper. Its parent has to span
          the whole scrollable content. */}

        {/* Collapsed bar */}
        <div ref={bandRef} style={{
          position: "sticky", top: BAND_TOP, zIndex: 6, height: CARD_H,
          opacity: 0, pointerEvents: "none",
          // Inset far enough that the shadow fades out before the content card's edge.
          // That card clips with overflow:hidden, so a shadow still carrying weight when it
          // gets there is cut off mid-falloff and draws a hard seam against the sidebar.
          margin: "0 24px",
          borderRadius: "var(--r-xl)",
          boxShadow: "var(--elevation-3)",
        }}>
          {/* The frosted look is built rather than sampled. backdrop-filter is unreliable in
              this spot: it does apply, but only up to a radius of roughly 5px — beyond that
              Chromium stops honouring it and the rows behind become legible again. So the
              card paints its own blurred copy of the cover under a dark wash, which is what
              the effect was meant to show anyway, and stays fully opaque to the list. */}
          <div aria-hidden style={{ position: "absolute", inset: 0, borderRadius: "inherit", overflow: "hidden", pointerEvents: "none" }}>
            {thumbnail && (
              <div style={{
                position: "absolute", inset: -60,
                backgroundImage: `url(${thumb(thumbnail)})`,
                backgroundSize: "cover", backgroundPosition: "center",
                filter: "blur(30px) saturate(160%)",
              }} />
            )}
            <div style={{ position: "absolute", inset: 0, background: thumbnail ? "rgba(10,10,10,0.62)" : "var(--bg-elevated)" }} />
          </div>

          <div style={{ position: "relative", height: "100%", display: "flex", alignItems: "center", gap: 14, padding: "0 14px" }}>
            {backButton(34)}
            {coverArt(40, "var(--r-md)")}
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: "var(--t15)", fontWeight: 700, color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
              <div style={{ fontSize: "var(--t11)", color: "rgba(255,255,255,0.55)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{compactMeta}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
              {headerActions(true)}
            </div>
          </div>
        </div>

        {/* Poster */}
        <div ref={posterRef} style={{
          position: "relative", marginTop: -CARD_H, height: POSTER_H,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          padding: `${BAND_TOP + 16}px 28px 0`, textAlign: "center",
        }}>
          <div style={{ position: "absolute", top: 26, left: 22 }}>{backButton(36)}</div>

          {coverArt(148, "var(--r-xl)")}

          <div style={{ marginTop: 18, fontSize: "var(--t11)", fontWeight: 600, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
            {typeLabel ?? (isAlbum ? t("album") : t("playlist"))}
          </div>

          <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.15, margin: "5px 0 7px", color: "#fff", textShadow: "0 2px 20px rgba(0,0,0,0.55)", maxWidth: "100%", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            {title}
          </div>

          {/* Metadata — albums additionally carry the artist chip and the year */}
          <div style={{ fontSize: "var(--t13)", color: "rgba(255,255,255,0.65)", marginBottom: 20, display: "flex", alignItems: "center", justifyContent: "center", flexWrap: "wrap", rowGap: 6 }}>
            {isAlbum && albumArtists && (
              <>
                <span
                  onClick={() => albumArtistBrowseId && onOpenArtist?.({ browseId: albumArtistBrowseId, artist: albumArtists })}
                  style={{
                    cursor: "default", display: "inline-flex", alignItems: "center",
                    // Slightly denser fill than before: without the outline the chip needs a
                    // touch more body to stay legible as a distinct, clickable thing.
                    background: `rgba(${accentColor},0.34)`, border: "none",
                    borderRadius: "var(--r-full)", padding: "3px 12px",
                    fontSize: "var(--t13)", fontWeight: 600, color: "#fff",
                    transition: "background 0.15s", marginRight: 10,
                  }}
                  onMouseEnter={e => { if (albumArtistBrowseId) e.currentTarget.style.background = `rgba(${accentColor},0.5)`; }}
                  onMouseLeave={e => { e.currentTarget.style.background = `rgba(${accentColor},0.34)`; }}
                >{albumArtists}</span>
                <span style={{ color: "rgba(255,255,255,0.2)", margin: "0 10px", fontSize: "var(--t14)" }}>|</span>
              </>
            )}
            {isAlbum && year && (
              <>
                <span>{year}</span>
                <span style={{ color: "rgba(255,255,255,0.2)", margin: "0 10px", fontSize: "var(--t14)" }}>|</span>
              </>
            )}
            <span>{total || tracks.length} {t("songs")}</span>
            {totalDuration && (
              <>
                <span style={{ color: "rgba(255,255,255,0.2)", margin: "0 10px", fontSize: "var(--t14)" }}>|</span>
                <span>{totalDuration}</span>
              </>
            )}
            {searchVisible && trackSearch && (
              <>
                <span style={{ color: "rgba(255,255,255,0.2)", margin: "0 10px", fontSize: "var(--t14)" }}>|</span>
                <span>{visibleTracks.length} {t("xOfY")} {tracks.length}</span>
              </>
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, flexWrap: "wrap", rowGap: 10, maxWidth: "100%" }}>
            {headerActions(false)}
          </div>
      </div>

      {/* Loading progress */}
      {loading && !cached && (
        <div style={{ padding: "0 28px 12px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: "var(--t11)", color: "var(--text-muted)" }}>{t("fetchingSongs")}</span>
            <span style={{ fontSize: "var(--t11)", color: "var(--accent)", fontWeight: 500 }}>{progress}%</span>
          </div>
          <div style={{ height: 3, background: "var(--bg-elevated)", borderRadius: "var(--r-full)", overflow: "hidden" }}>
            <div style={{ height: "100%", borderRadius: "var(--r-full)", background: "linear-gradient(90deg,var(--accent),#c020e0)", width: `${progress}%`, transition: "width 0.4s ease" }} />
          </div>
        </div>
      )}

      {/* Column headers */}
      <div style={{
        display: "grid",
        gridTemplateColumns: onToggleSelect
          ? (isAlbum ? "28px minmax(0,2fr) minmax(0,1fr) 28px 52px" : "28px minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) 28px 52px")
          : (isAlbum ? "minmax(0,2fr) minmax(0,1fr) 28px 52px" : "minmax(0,2fr) minmax(0,1fr) minmax(0,1fr) 28px 52px"),
        gap: 8, padding: "8px 16px", margin: "0 12px",
        borderBottom: "0.5px solid var(--border)",
        fontSize: "var(--t11)", fontWeight: 600, color: "var(--text-muted)",
        textTransform: "uppercase", letterSpacing: "0.08em",
      }}>
        {onToggleSelect && (() => {
          const allSelected = visibleTracks.length > 0 && visibleTracks.every(tr => selectedTracks?.has(tr.videoId));
          return (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", cursor: "default" }}
              onClick={() => onSelectAll?.(visibleTracks, allSelected)}
              title={allSelected ? t("deselectAll") : t("selectAll")}
            >
              {allSelected
                ? <CheckCircle size={18} weight="fill" style={{ color: "var(--accent)" }} />
                : <div style={{ width: 16, height: 16, borderRadius: "50%", border: "1.5px solid var(--text-muted)", background: "var(--bg-elevated)" }} />
              }
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
        <div ref={listInnerRef} style={{ position: "relative", height: rowVirtualizer.getTotalSize() }}>
          {rowVirtualizer.getVirtualItems().map(vi => {
            const i = vi.index;
            const tr = visibleTracks[i];
            return (
              <div
                key={vi.key}
                data-index={i}
                ref={rowVirtualizer.measureElement}
                style={{ position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${vi.start - listScrollMargin}px)` }}
              >
                {tr ? (
                  <TableRow track={tr} index={i}
                    isPlaying={isPlaying && currentTrack?.videoId === tr.videoId}
                    onPlay={() => onPlay(tr, visibleTracks)}
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
