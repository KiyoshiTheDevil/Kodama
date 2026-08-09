// The track-table view stack: a selection-action button, the shared table row, and the
// PlaylistLayout (used by playlist / album / liked / downloads / history). Extracted from App.jsx.
import React, { useState, useEffect, useMemo, useRef, useLayoutEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Button } from "@heroui/react";
import { thumb, hiResThumb, useLang, useAnimations, useTrackNumbers } from "../context.jsx";
import { useAccentColor } from "../ui/use-accent-color.js";
import { Tooltip } from "../ui/tooltip.jsx";
import { ExplicitBadge, ArtistLinks, SkeletonRow } from "../ui/rows.jsx";
import { parseDurationToSeconds } from "../lyrics/parse.js";
import { ArrowClockwise, ArrowLeft, Check, CheckCircle, Clock, ClockCounterClockwise, Crown, DotsThreeVertical, DownloadSimple, Heart, MagnifyingGlass, Minus, Pause, Play, Shuffle, Sort, SortDown, SortUp, Trash } from "../icons.jsx";

// Collapsing-header geometry. CARD_H is the height the pinned card reserves in the flow;
// the poster is pulled up under it by exactly that much, so the header's total height is
// POSTER_H at every scroll position. Keeping it constant is what stops the virtualised
// list from jumping — the page is the scroll container, so a shrinking header would move
// every row's offset mid-scroll.
// The pinned bar is a floating card, inset from the edges rather than a full-width slab.
// BAND_TOP keeps it clear of TitleBar (fixed at y=4..36) and of the ScrollShadow, which fades
// the container's first 28px.
// Finds the ancestor that actually scrolls, by asking the layout rather than by looking for a
// marker class. This used to be `closest(".scrollable")` — but `.scrollable` only styles
// scrollbars (index.css) and is scattered over a dozen unrelated elements, so it is a guess,
// not an answer. When the guess misses, the virtualiser gets no scroll element at all: its
// offset stays 0, it forever renders the first handful of rows at the top of the list, and the
// remaining (estimated) height below them shows up as a growing empty area as you scroll past.
function findScrollParent(el) {
  for (let n = el.parentElement; n; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === "auto" || oy === "scroll") && n.scrollHeight > n.clientHeight) return n;
  }
  return null;
}

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

// Row height. The virtualiser estimates with this too — if the two drift apart the
// scroll position jumps around while rows are measured.
export const TRACK_ROW_H = 64;

// Column track shared by the rows and the header, so the two can't drift apart.
// Title | actions | artist | (album) | download | duration | (select)
//
// The duration column stays narrow because its header is a clock icon rather than the word
// "DURATION", which was wide enough to make the column read as misaligned with its values.
export function trackGridCols(isAlbum, withSelect) {
  return [
    "minmax(0,2fr)", "76px", "minmax(0,1fr)",
    ...(isAlbum ? [] : ["minmax(0,1fr)"]),
    "28px", "56px",
    ...(withSelect ? ["36px"] : []),
  ].join(" ");
}

// Selection box, shared by the header (tri-state) and the rows. A square rather than a
// circle — it reads as "select", not as a radio choice.
export function SelectBox({ state }) {
  const on = state === "all" || state === "some";
  const size = 17; // one size everywhere — header and rows differing read as a mistake
  return (
    <div style={{
      width: size, height: size, borderRadius: "var(--r-sm)",
      display: "flex", alignItems: "center", justifyContent: "center",
      // Unchecked stays hollow. A filled surface made it a dark chip sitting on the ambient
      // backdrop rather than an outline waiting to be ticked.
      background: on ? "var(--accent)" : "transparent",
      border: on ? "1.5px solid var(--accent)" : "1.5px solid rgba(255,255,255,0.45)",
      color: "var(--accent-foreground)",
      boxSizing: "border-box",
      transition: "background 0.15s, border-color 0.15s",
    }}>
      {state === "all" && <Check size={11} weight="bold" />}
      {state === "some" && <Minus size={11} weight="bold" />}
    </div>
  );
}

// Row actions use a plain button rather than HeroUI's. A track list mounts and unmounts these
// by the thousand while scrolling, and each react-aria button brings its own hooks, generated
// ids and attribute set. Measured against a large playlist: rows carrying two of them held on
// to roughly 570 MB after scrolling, where the same rows without them returned to their
// baseline. Appearance is unchanged — ghost, round, hover fill.
function RowIconButton({ title, onClick, className = "", children }) {
  return (
    <Tooltip text={title}>
      <button
        type="button"
        // The tooltip is a portal, not an accessible name — an icon-only button without this
        // reaches a screen reader as nothing at all. HeroUI's Button warned about exactly that;
        // dropping it for a plain element means carrying the label ourselves.
        aria-label={title}
        onClick={onClick}
        // Pressed state. Deliberately stronger than HeroUI's scale(.97): at 32px that amount is
        // barely perceptible, and these buttons are small targets. A CSS rule suffices here —
        // unlike the header buttons, nothing writes to this element's inline style.
        className={`shrink-0 w-8 h-8 rounded-full border-0 bg-transparent flex items-center justify-center cursor-default transition-[background-color,opacity,transform] duration-150 hover:bg-hover active:scale-[0.90] ${className}`}
      >
        {children}
      </button>
    </Tooltip>
  );
}

export function TableRow({ track, index, isPlaying, onPlay, onOpenArtist, onOpenAlbum, isAlbum, onContextMenu, isCached, isDownloading, onDownload, isPremiumOnly, selected = false, onToggleSelect, isLiked = false, onToggleLike, menuOpen = false }) {
  const anim = useAnimations();
  const t = useLang();
  const showNum = useTrackNumbers();

  const gridCols = trackGridCols(isAlbum, !!onToggleSelect);
  // The row actions are invisible until the row is hovered, yet they were still built for
  // every row that scrolled past. Now they only exist when they can actually be seen —
  // hovered, menu open, or a liked heart, which is a state worth reading at a glance.
  const [hovered, setHovered] = useState(false);
  const showActions = hovered || menuOpen;

  const row = (
    <div
      data-track-id={track.videoId}
      onClick={isPremiumOnly ? undefined : () => onPlay(track)}
      onContextMenu={(!isPremiumOnly && onContextMenu) ? (e) => { e.preventDefault(); onContextMenu(e, track); } : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ gridTemplateColumns: gridCols, minHeight: TRACK_ROW_H }}
      className={`group grid items-center gap-2 px-4 py-1 rounded-2xl cursor-default transition-colors ${
        selected
          ? "bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]"
          : isPlaying
            ? "bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]"
            : "hover:bg-hover"
      } ${isPremiumOnly ? "opacity-40" : ""}`}
    >
      {/* Title */}
      <div className="flex items-center gap-3 min-w-0">
        {showNum && <span className={`w-6 text-right shrink-0 text-t12 tabular-nums ${isPlaying ? "text-accent" : "text-muted"}`}>{index + 1}</span>}
        <div className="relative w-12 h-12 shrink-0 overflow-hidden rounded-lg bg-elevated">
          {track.thumbnail
            ? <img src={thumb(hiResThumb(track.thumbnail, 120))} alt="" className="w-full h-full object-cover" />
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
      {/* Row actions, sitting right after the title. The heart stays visible only when the
          track is actually liked — that's a state worth reading at a glance. The empty heart
          and the menu are mere affordances, so they wait for hover instead of turning a long
          list into a field of grey icons. */}
      <div className="flex items-center shrink-0" onClick={e => e.stopPropagation()}>
        {onToggleLike && (isLiked || showActions) && (
          <RowIconButton
            title={isLiked ? t("unlike") : t("like")}
            onClick={() => onToggleLike(track)}
            className={isLiked ? "text-accent" : "text-muted"}
          >
            <Heart size={15} weight={isLiked ? "fill" : "regular"} />
          </RowIconButton>
        )}
        {onContextMenu && showActions && (
          <RowIconButton
            title={t("rowMoreActions")}
            onClick={(e) => {
              // Anchored under the button rather than at the pointer — it reads better here,
              // and it keeps the menu in the same place however the button was triggered.
              const r = e.currentTarget.getBoundingClientRect();
              onContextMenu({ clientX: r.left, clientY: r.bottom + 4 }, track);
            }}
            className="text-muted"
          >
            <DotsThreeVertical size={15} />
          </RowIconButton>
        )}
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
      {/* Duration — centred, so the times sit directly under the clock in the header rather
          than being pushed to the column edge while the narrow icon floats above their end. */}
      <div className="text-t12 text-muted text-center tabular-nums">
        {track.duration || "—"}
      </div>
      {/* Selection — last column, so the title side stays undisturbed */}
      {onToggleSelect && (
        <div
          onClick={e => { e.stopPropagation(); onToggleSelect(); }}
          className={`flex items-center justify-center shrink-0 cursor-default transition-opacity ${selected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
        >
          <SelectBox state={selected ? "all" : "none"} />
        </div>
      )}
    </div>
  );

  return isPremiumOnly
    ? <Tooltip text={t("premiumOnly")}>{row}</Tooltip>
    : row;
}

// ─── Shared playlist/collection layout ────────────────────────────────────
export function PlaylistLayout({ title, thumbnail, tracks, total, loading, progress, cached, onPlay, currentTrack, isPlaying, onBack, isLiked, onOpenArtist, onOpenAlbum, isAlbum, albumArtists, albumArtistBrowseId, year, onRefresh, onTrackContextMenu, cachedSongIds, downloadingIds, premiumSongIds, onDownloadSong, onDownloadAll, onRemoveAll, hideExplicit, onToggleLike, likedIds, selectedTracks, onToggleSelect, onSelectAll, extraActions, typeLabel, contextMenuTrackId }) {
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

  // Column sorting. Deliberately not persisted — it's a way of looking at the collection,
  // not a property of it — so it resets whenever a different one is opened. Clicking a
  // column cycles ascending → descending → off; the third state matters for albums, where
  // the stored order IS the running order and there'd otherwise be no way back to it.
  const [sort, setSort] = useState({ key: null, dir: "asc" });
  useEffect(() => { setSort({ key: null, dir: "asc" }); }, [title]);

  const collator = useMemo(() => {
    // Locale-aware so umlauts land where a German reader expects them ("Ärzte" under A).
    const opts = { sensitivity: "base", numeric: true };
    try { return new Intl.Collator(localStorage.getItem("kiyoshi-lang") || undefined, opts); }
    catch { return new Intl.Collator(undefined, opts); }
  }, []);

  const visibleTracks = useMemo(() => {
    const q = trackSearch.trim().toLowerCase();
    const out = tracks.filter(tr => {
      if (hideExplicit && tr.isExplicit) return false;
      if (q) {
        return (tr.title || "").toLowerCase().includes(q) || (tr.artists || "").toLowerCase().includes(q);
      }
      return true;
    });
    if (!sort.key) return out;

    const dir = sort.dir === "asc" ? 1 : -1;
    const text = (tr, key) => {
      const v = tr[key];
      if (Array.isArray(v)) return v.map(a => (a && a.name) || a).filter(Boolean).join(", ");
      return String(v || "");
    };
    // Sort a copy: `tracks` is the caller's array and the parent still indexes into it.
    return [...out].sort((a, b) => {
      if (sort.key === "duration") {
        return ((parseDurationToSeconds(a.duration) || 0) - (parseDurationToSeconds(b.duration) || 0)) * dir;
      }
      return collator.compare(text(a, sort.key), text(b, sort.key)) * dir;
    });
  }, [tracks, trackSearch, hideExplicit, sort, collator]);

  const totalDuration = formatTotalDuration(tracks);
  const skeletonCount = total ? Math.max(0, total - tracks.length) : 0;

  // ── List virtualization ─────────────────────────────────────────────────────
  // Only the visible rows are mounted (constant DOM regardless of list length).
  // The whole page scrolls (the list is NOT the scroll container), so we virtualize
  // against the nearest `.scrollable` ancestor and offset by the list's position in it.
  const listInnerRef = useRef(null);
  const [scrollEl, setScrollEl] = useState(null);
  const [listScrollMargin, setListScrollMargin] = useState(0);
  const [measureTick, bumpMeasure] = useState(0);

  useEffect(() => {
    const onResize = () => bumpMeasure(n => n + 1);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Re-measures the list's offset inside the scroll container. This used to run after EVERY
  // render with no dependency list, and it sets state — so each pass could schedule another,
  // which React reports as a "nested-update" commit. Measured: opening a collection produced
  // commits of 600ms+ and blocked the main thread for nearly two seconds, with two forced
  // layouts (getBoundingClientRect) per pass on top.
  //
  // The offset only moves when the header's height changes — which happens as the track count
  // and metadata stream in — or on resize, so those are the dependencies. Scrolling does not
  // change it, and scrolling was what made this run dozens of times a second.
  useLayoutEffect(() => {
    const inner = listInnerRef.current;
    if (!inner) return;
    // Keep the container we already have while it is still valid — resolving it walks the
    // ancestors with getComputedStyle, and this effect runs on every render (i.e. every
    // scroll frame), so doing that unconditionally would cost a style recalc per frame.
    const sc = (scrollEl && scrollEl.isConnected && scrollEl.contains(inner))
      ? scrollEl
      : findScrollParent(inner);
    if (sc !== scrollEl) setScrollEl(sc);
    if (!sc) return;
    const top = Math.max(0, Math.round(inner.getBoundingClientRect().top - sc.getBoundingClientRect().top + sc.scrollTop));
    setListScrollMargin(prev => (prev === top ? prev : top));
  }, [scrollEl, tracks.length, total, title, measureTick]);

  const skelN = trackSearch ? 0 : skeletonCount;
  const rowCount = visibleTracks.length + skelN;
  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollEl,
    estimateSize: () => TRACK_ROW_H,
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

  // A column header that sorts. Cycles asc → desc → off; the arrow only appears on the
  // column actually in effect, so the header stays quiet when nothing is sorted.
  const sortableHead = (key, label, align = "left", tip = null) => {
    const active = sort.key === key;
    const cell = (
      <div
        onClick={() => setSort(s =>
          s.key !== key ? { key, dir: "asc" }
          : s.dir === "asc" ? { key, dir: "desc" }
          : { key: null, dir: "asc" }
        )}
        className="group"
        style={{
          display: "flex", alignItems: "center", gap: 5, cursor: "default", userSelect: "none",
          justifyContent: align === "right" ? "flex-end" : align === "center" ? "center" : "flex-start",
          color: active ? "var(--accent)" : "inherit",
          transition: "color 0.15s",
        }}
        onMouseEnter={e => { if (!active) e.currentTarget.style.color = "var(--text-secondary)"; }}
        onMouseLeave={e => { if (!active) e.currentTarget.style.color = "inherit"; }}
      >
        <span style={{ display: "flex", alignItems: "center" }}>{label}</span>
        {active
          ? (sort.dir === "asc" ? <SortUp size={11} /> : <SortDown size={11} />)
          : <Sort size={11} className="opacity-0 group-hover:opacity-100 transition-opacity" />}
      </div>
    );
    return tip ? <Tooltip text={tip}>{cell}</Tooltip> : cell;
  };

  const roundBtn = (px) => ({
    background: "rgba(0,0,0,0.3)", border: "none",
    borderRadius: "var(--r-2xl)", width: px, height: px, display: "flex", alignItems: "center",
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
    // One height for every control in the row. The icon buttons used to be 44 against the
    // pills' 48, which read as a 2px gap above and below them.
    const px = compact ? 34 : 48;
    const pillH = px;
    const fs = compact ? "var(--t13)" : "var(--t14)";
    const pill = {
      borderRadius: "var(--r-2xl)", height: pillH, display: "flex", alignItems: "center",
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
          onClick={() => visibleTracks.length && onPlay(visibleTracks[0], visibleTracks)}
          style={{ ...pill, padding: compact ? "0 16px" : "0 26px", background: "var(--accent)", border: "none", color: "var(--accent-foreground)" }}
          onMouseEnter={e => { e.currentTarget.style.background = "color-mix(in srgb, var(--accent) 86%, #fff)"; }}
          onMouseLeave={e => { e.currentTarget.style.background = "var(--accent)"; e.currentTarget.style.transform = ""; }}
        >
          <Play size={compact ? 13 : 15} weight="fill" style={{ color: "var(--accent-foreground)" }} />
          {t("playAll")}
        </button>

        <Tooltip text={t("shuffle")}><button
          {...press}
          onClick={() => { if (!visibleTracks.length) return; const sh = [...visibleTracks].sort(() => Math.random() - 0.5); onPlay(sh[0], sh); }}
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
                borderRadius: "var(--r-2xl)", padding: "0 16px",
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
          // Same 16px as the rows below, so the pinned card reads as part of the same list
          // rather than as a differently-shaped panel sitting on top of it.
          // Inset far enough that the shadow fades out before the content card's edge.
          // That card clips with overflow:hidden, so a shadow still carrying weight when it
          // gets there is cut off mid-falloff and draws a hard seam against the sidebar.
          margin: "0 24px",
          borderRadius: "var(--r-2xl)",
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

          {/* The shadow sits on the wrapper, not on the text: the text element needs
              overflow:hidden for its ellipsis, and that clipped the shadow's 20px blur into a
              visible rectangle around the title. drop-shadow on an unclipped parent works off
              the already-clipped glyphs and spills outside freely. Its blur reads about twice
              as strong as text-shadow's, hence the smaller number. */}
          <div style={{ maxWidth: "100%", filter: "drop-shadow(0 2px 10px rgba(0,0,0,0.55))" }}>
            {/* line-height has to leave room for descenders: at 1.15 the line box is shorter
                than the font's own ascender-to-descender span, and overflow:hidden then cuts
                the tail off a "g". The margins give back what the taller line box adds. */}
            <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.32, margin: "2px 0 4px", color: "#fff", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {title}
            </div>
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
        gridTemplateColumns: trackGridCols(isAlbum, !!onToggleSelect),
        gap: 8, padding: "8px 16px", margin: "0 12px",
        borderBottom: "0.5px solid var(--border)",
        fontSize: "var(--t11)", fontWeight: 600, color: "var(--text-muted)",
        textTransform: "uppercase", letterSpacing: "0.08em",
      }}>
        {sortableHead("title", t("colTitle"))}
        <div></div>
        {sortableHead("artists", t("colArtist"))}
        {!isAlbum && sortableHead("album", t("colAlbum"))}
        <div></div>
        {/* A clock instead of the word: "DURATION" was far wider than the times below it, so
            even though both were right-aligned the label started much further left and the
            column read as misaligned. An icon of roughly value width settles it. */}
        {sortableHead("duration", <Clock size={13} />, "center", t("colDuration"))}
        {onToggleSelect && (() => {
          const picked = visibleTracks.filter(tr => selectedTracks?.has(tr.videoId)).length;
          const state = picked === 0 ? "none" : picked === visibleTracks.length ? "all" : "some";
          return (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", cursor: "default" }}
              onClick={() => onSelectAll?.(visibleTracks, state === "all")}
              title={state === "all" ? t("deselectAll") : t("selectAll")}
            >
              <SelectBox state={state} />
            </div>
          );
        })()}
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
                // Fixed height, deliberately NOT dynamically measured. Every row is exactly
                // TRACK_ROW_H (48px cover, single truncated line), so measureElement could only
                // ever feed back rounding noise — and any drift it records is permanent, since
                // the size cache survives scrolling. With a fixed size the list's total height
                // is always count * TRACK_ROW_H, which is what the scroll maths assumes.
                style={{ position: "absolute", top: 0, left: 0, width: "100%", height: TRACK_ROW_H, transform: `translateY(${vi.start - listScrollMargin}px)` }}
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
                    isLiked={likedIds?.has(tr.videoId)}
                    onToggleLike={onToggleLike}
                    menuOpen={!!contextMenuTrackId && contextMenuTrackId === tr.videoId}
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
