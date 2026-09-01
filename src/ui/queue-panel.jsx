// Queue side panel: the up-next list, its rows, and the per-transition fade editor.
// QueueRow is only ever rendered by QueuePanel, so the two live together here.
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { createPortal } from "react-dom";
import { Button, CardRoot, ChipRoot, ChipLabel, ScrollShadowRoot } from "@heroui/react";
import { API, thumb, useLang, useAnimations, useZoom } from "../context.jsx";
import { ArrowClockwise, CaretLineUp, DotsThreeVertical, GripLines, Heart, Sliders, Trash } from "../icons.jsx";
import { ExplicitBadge } from "./rows.jsx";
import { Tooltip } from "./tooltip.jsx";
import { ContextMenu, CtxItem } from "./context-menu.jsx";
import { FadeEditorModal } from "../modals/fade-editor-modal.jsx";
import { dissolve } from "../effects/particle-burst.js";
import { usePlaybackPrefs } from "../preferences.jsx";

// Fixed geometry so the list can be virtualised: a queued playlist runs to thousands of rows,
// and rendering them all made scrolling and every interaction stutter well before that. The row
// is a 36px thumbnail with 6px of padding either side and a 2px top border.
const TAB_H = 32;
const TAB_GAP = 6;
// Round on the free ends, notched where a neighbour sits — the shape the lyrics chips and the
// overlay editor's header groups use. The pill radius is exactly half the height: any more and
// the browser scales all four corners down together, flattening the notch.
function tabCorners(left, right) {
  const l = left ? 6 : TAB_H / 2;
  const r = right ? 6 : TAB_H / 2;
  return `${l}px ${r}px ${r}px ${l}px`;
}

const QUEUE_ROW_H = 50;
const QUEUE_HEADER_H = 32;

// Plain button rather than HeroUI's, for the same reason the track rows use one: a queued
// playlist can be thousands of entries, and each react-aria button brings its own hooks,
// generated id and attribute set. aria-label carries the accessible name that isIconOnly
// would otherwise have demanded.
function QueueIconButton({ label, onClick, className = "", children }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={`w-8 h-8 rounded-full border-0 bg-transparent cursor-default inline-flex items-center justify-center transition-[background-color,color,transform] duration-150 hover:bg-hover active:scale-[0.90] ${className}`}
    >
      {children}
    </button>
  );
}

// labels defaults to {} so a call site that forgets to pass it loses the button's accessible
// name — which the console already warns about — instead of taking the whole app down.
function QueueRow({ track, globalIdx, isDraggable, dimmed, isActive, isBeingDragged, onPointerDown, onPlay, isLiked, onToggleLike, onOpenMenu, menuOpen, fadeSecs, labels = {} }) {
  const rowRef = useRef(null);
  return (
    <div
      ref={rowRef}
      data-queue-idx={globalIdx}
      onClick={onPlay}
      onContextMenu={isDraggable ? (e) => { e.preventDefault(); onOpenMenu({ x: e.clientX, y: e.clientY, globalIdx }); } : undefined}
      onPointerDown={isDraggable ? e => onPointerDown(e, globalIdx) : undefined}
      style={{ height: QUEUE_ROW_H }}
      className={`group/qrow flex items-center gap-2 pl-2.5 pr-3 rounded-[var(--r-md)] cursor-default select-none transition-[background-color,opacity] ${
        isActive ? "bg-accent-dim" : "bg-transparent hover:bg-[var(--fill-subtle)]"
      } ${isBeingDragged ? "opacity-30" : dimmed ? "opacity-45 hover:opacity-100" : ""}`}
    >
      {/* Drag handle (the whole row is draggable; this is just the affordance) */}
      <div className={`shrink-0 px-px py-0.5 touch-none transition-opacity ${isDraggable ? "cursor-grab opacity-40 group-hover/qrow:opacity-100" : "opacity-0"}`}>
        <GripLines size={13} className="block pointer-events-none text-muted" />
      </div>

      {/* Thumbnail */}
      <div className="w-9 h-9 shrink-0 overflow-hidden rounded-[var(--r-sm)] bg-surface-1">
        {track.thumbnail
          ? <img src={thumb(track.thumbnail)} alt="" className="w-full h-full object-cover" />
          : <div className="w-full h-full bg-[image:var(--placeholder-gradient)]" />}
      </div>

      {/* Title + artist */}
      <div className="flex-1 min-w-0">
        <div className={`flex items-center gap-1 overflow-hidden text-t12 font-medium ${isActive ? "text-accent" : "text-primary"}`}>
          <span className="truncate min-w-0">{track.title}</span>
          {track.isExplicit && <ExplicitBadge />}
        </div>
        <div className="text-t11 text-secondary truncate">{track.artists}</div>
      </div>

      {/* Custom-crossfade indicator (set via right-click) */}
      {fadeSecs != null && (
        <span title={`Crossfade: ${fadeSecs}s`}
          className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-semibold text-accent px-1.5 py-0.5 rounded-[var(--r-sm)] bg-accent-dim">
          <Sliders size={10} weight="bold" />{fadeSecs}s
        </span>
      )}

      {/* Duration */}
      {track.duration && (
        <div className="shrink-0 min-w-[28px] text-t11 text-muted text-right">{track.duration}</div>
      )}

      {/* Like button */}
      <span className="shrink-0 inline-flex" onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
        <QueueIconButton label={isLiked ? labels.unlike : labels.like} onClick={() => onToggleLike?.(track)}
          className={isLiked ? "text-accent" : "text-muted hover:text-secondary"}>
          <Heart size={14} weight={isLiked ? "fill" : "regular"} />
        </QueueIconButton>
      </span>

      {/* Row menu — remove and crossfade live here, so right-clicking the row opens the same
          list instead of jumping straight into the crossfade editor. */}
      {isDraggable && (
        <span className="shrink-0 inline-flex" onPointerDown={e => e.stopPropagation()} onClick={e => e.stopPropagation()}>
          <QueueIconButton label={labels.more} onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onOpenMenu({ x: r.right, y: r.bottom + 4, globalIdx }); }}
            className={`text-muted hover:text-secondary ${menuOpen ? "bg-hover text-primary" : ""}`}>
            <DotsThreeVertical size={15} weight="bold" />
          </QueueIconButton>
        </span>
      )}
    </div>
  );
}

export function QueuePanel({ queue, setQueue, currentTrack, setTrack, onClose, likedIds, onToggleLike, visible }) {
  // The panel stays mounted while closed — it slides rather than unmounts — but its list
  // was rendered all the same. With a large playlist queued that is thousands of rows,
  // rebuilt on every track change because currentTrack comes in as a prop: pressing next
  // blocked the main thread for nearly two seconds. Kept alive briefly past the close so
  // the slide-out animation still has something to show.
  const [mountList, setMountList] = useState(visible);
  useEffect(() => {
    if (visible) { setMountList(true); return; }
    const id = setTimeout(() => setMountList(false), 450);
    return () => clearTimeout(id);
  }, [visible]);
  // Per-transition fade editing reads and writes the global crossfade preferences.
  const { crossfade, crossfadeOverrides, setCrossfadeOverride, removeCrossfadeOverride } = usePlaybackPrefs();
  const t = useLang();
  const zoom = useZoom();
  // Built once here rather than a translation hook per row — a queued playlist can be
  // thousands of them.
  const rowLabels = useMemo(() => ({ like: t("like"), unlike: t("unlike"), remove: t("removeFromQueue"), more: t("rowMoreActions") }), [t]);
  const [panelTab, setPanelTab] = useState("queue");
  const [rowMenu, setRowMenu] = useState(null); // { x, y, globalIdx } — the per-track menu
  const [fadeEdit, setFadeEdit] = useState(null); // { from, to } — open the per-transition fade editor
  const fadeKey = (a, b) => `${a?.videoId}__${b?.videoId}`;
  const [songDesc, setSongDesc] = useState(null);    // null=loading, ""=none, str=text
  const [songDescId, setSongDescId] = useState(null);
  const [songDescError, setSongDescError] = useState(null);
  const [dragIdx, setDragIdx] = useState(null);
  const [dropOffset, setDropOffset] = useState(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [fabPos, setFabPos] = useState(null); // {left,width,bottom} for the portaled scroll-top pill
  const isDragging = useRef(false);
  const suppressClickRef = useRef(false);
  const listRef = useRef(null);
  const nowPlayingOffsetRef = useRef(0);

  // Fetch song description when switching to About tab or track changes
  const fetchSongDesc = useCallback((videoId, force = false) => {
    if (!videoId) return;
    if (!force && songDescId === videoId) return;
    setSongDesc(null);
    setSongDescError(null);
    setSongDescId(videoId);
    fetch(`${API}/song/credits/${videoId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setSongDescError(d.error);
        else setSongDesc(d.description || "");
      })
      .catch(() => setSongDesc(""));
  }, [songDescId]);

  useEffect(() => {
    if (panelTab !== "about" || !currentTrack?.videoId) return;
    fetchSongDesc(currentTrack.videoId);
  }, [panelTab, currentTrack?.videoId]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    // The pill is portaled to <body> (to escape the panel's overflow+radius clip, which
    // would kill its backdrop-filter), so we position it over the list's bottom edge.
    const updatePos = () => {
      const r = el.getBoundingClientRect();
      setFabPos({ left: r.left, width: r.width, bottom: window.innerHeight - r.bottom });
    };
    const onScroll = () => {
      setShowScrollTop(el.scrollTop > nowPlayingOffsetRef.current + QUEUE_HEADER_H + QUEUE_ROW_H);
      updatePos();
    };
    el.addEventListener("scroll", onScroll);
    window.addEventListener("resize", updatePos);
    return () => { el.removeEventListener("scroll", onScroll); window.removeEventListener("resize", updatePos); };
  }, []);

  const currentIdx = queue.findIndex(t => t.videoId === currentTrack?.videoId);

  // One flat list of section headings and rows, so the whole panel is a single virtualised
  // scroller instead of three mapped groups. Heights are fixed, so the offsets are exact and
  // can also be used for hit-testing the drag without touching the DOM.
  const { items, offsets, totalHeight, nowPlayingOffset } = useMemo(() => {
    const list = [];
    const push = (it) => list.push(it);
    if (currentIdx > 0) {
      push({ kind: "header", key: "h-played", section: "played", label: t("previouslyPlayed") });
      for (let i = 0; i < currentIdx; i++) push({ kind: "row", key: `p-${queue[i].videoId || i}`, section: "played", track: queue[i], globalIdx: i });
    }
    let nowOff = 0;
    if (currentTrack && currentIdx >= 0) {
      nowOff = -1; // resolved below, once the offsets exist
      push({ kind: "header", key: "h-now", section: "now", label: t("nowPlaying"), marksNowPlaying: true });
      push({ kind: "row", key: `n-${currentTrack.videoId}`, section: "now", track: currentTrack, globalIdx: currentIdx });
    }
    const upNextCount = queue.length - currentIdx - 1;
    if (upNextCount > 0) {
      push({ kind: "header", key: "h-next", section: "next", label: t("upNext"), count: upNextCount });
      for (let i = currentIdx + 1; i < queue.length; i++) push({ kind: "row", key: `u-${queue[i].videoId || i}`, section: "next", track: queue[i], globalIdx: i });
    }
    const offs = new Array(list.length + 1);
    let y = 0;
    for (let i = 0; i < list.length; i++) {
      offs[i] = y;
      if (list[i].marksNowPlaying) nowOff = y;
      y += list[i].kind === "header" ? QUEUE_HEADER_H : QUEUE_ROW_H;
    }
    offs[list.length] = y;
    return { items: list, offsets: offs, totalHeight: y, nowPlayingOffset: nowOff < 0 ? 0 : nowOff };
  }, [queue, currentIdx, currentTrack, t]);

  nowPlayingOffsetRef.current = nowPlayingOffset;

  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => listRef.current,
    estimateSize: (i) => (items[i]?.kind === "header" ? QUEUE_HEADER_H : QUEUE_ROW_H),
    // Identity by track rather than by position, so a list that shifts is understood as the
    // same items moved instead of every index having changed its contents.
    getItemKey: (i) => items[i]?.key ?? i,
    overscan: 8,
  });
  // Sizes are cached per index and estimateSize is not consulted again for an index it has
  // already measured. Playing a different track moves the "now playing" heading, so indices
  // swap between heading (32px) and row (50px) while keeping their cached height — which laid
  // rows on top of each other. Dropping the cache is what makes the estimate follow.
  //
  // Keyed on the layout rather than on the items array: a fresh array on every render would
  // make this fire on every render, and measure() causes a render of its own. That is exactly
  // how it first went wrong. Only the count and where the heading sits can change a size, so
  // that pair is the whole trigger.
  const layoutKey = `${items.length}:${currentIdx}`;
  useEffect(() => { rowVirtualizer.measure(); }, [layoutKey, rowVirtualizer]);

  const virtualItems = rowVirtualizer.getVirtualItems();

  // Open the per-transition fade editor for globalIdx → globalIdx+1.
  const openFadeEdit = (globalIdx) => {
    const from = queue[globalIdx], to = queue[globalIdx + 1];
    if (from && to) setFadeEdit({ from, to });
  };

  const removeTrack = useCallback((videoId) => {
    setQueue(q => q.filter(t => t.videoId !== videoId));
  }, [setQueue]);

  const anim = useAnimations();
  // The row may be scrolled out of the virtualiser by the time this runs, so the element is
  // looked up rather than held in a ref by the row itself.
  const removeWithEffect = useCallback((globalIdx, videoId) => {
    const el = listRef.current?.querySelector(`[data-queue-idx="${globalIdx}"]`);
    if (anim && el) dissolve(el, () => removeTrack(videoId));
    else removeTrack(videoId);
  }, [anim, removeTrack]);

  // The drop position is an index *between* tracks, not a track to swap with. Derived from the
  // pointer against the known item offsets, so it works for rows the virtualiser has not
  // mounted and can be drawn as a single line rather than an outline on a neighbour.
  const dropIdxRef = useRef(null);

  const insertionAt = useCallback((clientY) => {
    const el = listRef.current;
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    const localY = clientY - rect.top + el.scrollTop - 4; // 4px = the list's pt-1
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind !== "row") continue;
      const top = offsets[i];
      if (localY < top + QUEUE_ROW_H / 2) return { index: items[i].globalIdx, offset: top };
    }
    return { index: queue.length, offset: totalHeight };
  }, [items, offsets, totalHeight, queue.length]);

  const handlePointerDown = useCallback((e, globalIdx) => {
    if (e.button !== 0) return; // ignore right/middle click so the context menu (fade editor) fires
    e.preventDefault();
    isDragging.current = false;
    dropIdxRef.current = null;

    const startY = e.clientY;

    const onMove = (me) => {
      if (!isDragging.current) {
        if (Math.abs(me.clientY - startY) <= 4) return;
        isDragging.current = true;
        setDragIdx(globalIdx);
      }
      const hit = insertionAt(me.clientY);
      if (!hit) return;
      // Dropping either side of where it already sits changes nothing, so show no line.
      const isNoop = hit.index === globalIdx || hit.index === globalIdx + 1;
      dropIdxRef.current = isNoop ? null : hit.index;
      setDropOffset(isNoop ? null : hit.offset);
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      const target = dropIdxRef.current;
      const didDrag = isDragging.current;
      if (didDrag && target != null) {
        setQueue(q => {
          const next = [...q];
          const [moved] = next.splice(globalIdx, 1);
          // Compensate for the removed item: when dropping below the origin, every
          // index after `globalIdx` shifted up by one.
          next.splice(target > globalIdx ? target - 1 : target, 0, moved);
          return next;
        });
      }
      // Suppress the click that fires right after a drag so it doesn't also start playback.
      if (didDrag) { suppressClickRef.current = true; setTimeout(() => { suppressClickRef.current = false; }, 0); }
      isDragging.current = false;
      dropIdxRef.current = null;
      setDragIdx(null);
      setDropOffset(null);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [setQueue, insertionAt]);


  useEffect(() => { setRowMenu(null); }, [queue, panelTab, visible]);
  return (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <div className="px-3 pt-11 shrink-0">
        <div className="flex items-center gap-1.5 mb-2.5">
          <div className="flex flex-1 items-center" style={{ gap: TAB_GAP }}>
            {[["queue", t("queue")], ["about", t("aboutSong")]].map(([id, label], i, all) => (
              <button key={id} type="button" onClick={() => setPanelTab(id)}
                style={{ height: TAB_H, borderRadius: tabCorners(i > 0, i < all.length - 1) }}
                className={`flex-1 border-0 cursor-default select-none text-t12 font-semibold transition-[background-color,color] duration-150 ${
                  panelTab === id
                    ? "bg-accent text-[var(--accent-foreground)]"
                    : "bg-[var(--fill-subtle)] text-secondary hover:text-primary hover:bg-hover"
                }`}
              >{label}</button>
            ))}
          </div>
          {/* Clear queue icon button — always rendered to keep pill width stable */}
          <Tooltip text={t("clearQueue")}>
            <Button variant="ghost" size="sm" isIconOnly onPress={() => setQueue([])}
              style={{ height: TAB_H, width: TAB_H }}
              className={`shrink-0 rounded-full text-muted hover:text-[var(--status-danger)]! ${panelTab === "queue" ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
            ><Trash size={13} /></Button>
          </Tooltip>
        </div>
      </div>

      {/* About Song tab */}
      {panelTab === "about" && (
        <div className="scrollable flex-1 overflow-y-auto px-4 pt-4 pb-6">
          {currentTrack ? (
            <>
              {/* Song card */}
              <CardRoot className="flex items-center gap-3 mb-5 px-3.5 py-3">
                {currentTrack.thumbnail && (
                  <img src={currentTrack.thumbnail} alt="" className="w-[52px] h-[52px] rounded-[var(--r-md)] object-cover shrink-0" />
                )}
                <div className="min-w-0">
                  <div className="text-t13 font-semibold text-primary truncate">{currentTrack.title}</div>
                  <div className="text-t12 text-secondary mt-0.5 truncate">{currentTrack.artists}</div>
                  {currentTrack.album && <div className="text-t11 text-muted mt-0.5 truncate">{currentTrack.album}</div>}
                </div>
              </CardRoot>

              {/* Description */}
              {songDesc === null && !songDescError && (
                <div className="text-t12 text-muted">{t("loadingDots")}</div>
              )}
              {songDescError && (
                <div className="flex flex-col gap-2">
                  <div className="text-t12 text-muted">{t("noCredits")}</div>
                  <Button variant="secondary" size="sm" className="self-start gap-1.5 text-t11" onPress={() => { setSongDescId(null); fetchSongDesc(currentTrack?.videoId, true); }}
                  ><ArrowClockwise size={11} /> {t("retry") || "Erneut versuchen"}</Button>
                </div>
              )}
              {songDesc !== null && songDesc === "" && !songDescError && (
                <div className="text-t12 text-muted">{t("noCredits")}</div>
              )}
              {songDesc && (
                <p className="m-0 text-t12 leading-[1.7] text-secondary whitespace-pre-wrap">{songDesc}</p>
              )}
            </>
          ) : (
            <div className="text-t13 text-muted text-center mt-10">{t("selectSong")}</div>
          )}
        </div>
      )}

      {mountList && panelTab === "queue" && <ScrollShadowRoot ref={listRef} size={28} className="scrollable flex-1 overflow-y-auto px-2 pt-1 pb-4">
        {queue.length === 0 ? (
          <div className="p-6 text-t13 text-muted text-center">{t("emptyQueue")}</div>
        ) : (
          <div className="relative w-full" style={{ height: totalHeight }}>
            {virtualItems.map(v => {
              const it = items[v.index];
              const common = { position: "absolute", top: 0, left: 0, width: "100%", transform: `translateY(${v.start}px)` };
              if (it.kind === "header") {
                return (
                  <div key={it.key} style={{ ...common, height: QUEUE_HEADER_H }}
                    className="group/qsec flex items-end justify-between gap-1.5 px-1.5 pb-1">
                    <span className="flex items-center gap-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">{it.label}</span>
                      {it.count != null && <ChipRoot size="sm" variant="soft"><ChipLabel>{it.count}</ChipLabel></ChipRoot>}
                    </span>
                    {it.section === "played" && (
                      <Tooltip text={t("clearPlayed")}>
                        <Button variant="ghost" size="sm" isIconOnly onPress={() => setQueue(q => q.slice(currentIdx))}
                          className="shrink-0 h-6 min-w-6 rounded-[var(--r-sm)] text-muted opacity-0 group-hover/qsec:opacity-100 hover:text-[var(--status-danger)]!"
                        ><Trash size={11} /></Button>
                      </Tooltip>
                    )}
                  </div>
                );
              }
              const gIdx = it.globalIdx;
              const isNow = it.section === "now";
              return (
                <div key={it.key} style={common}>
                  <QueueRow labels={rowLabels} track={it.track} globalIdx={gIdx}
                    isDraggable={!isNow} dimmed={it.section !== "next"} isActive={isNow}
                    isBeingDragged={dragIdx === gIdx}
                    onPointerDown={handlePointerDown}
                    onPlay={() => { if (suppressClickRef.current) return; setTrack(it.track); }}
                    isLiked={likedIds?.has(it.track.videoId)} onToggleLike={onToggleLike}
                    onOpenMenu={setRowMenu} menuOpen={rowMenu?.globalIdx === gIdx}
                    fadeSecs={crossfadeOverrides[fadeKey(it.track, queue[gIdx + 1])]?.secs ?? null} />
                </div>
              );
            })}
            {/* Drop indicator: a line in the gap the track would land in, rather than an
                outline on a neighbouring row — that never said which side it meant. */}
            {dropOffset != null && (
              <div className="absolute left-1 right-1 h-0.5 -mt-px rounded-full bg-accent pointer-events-none z-10"
                style={{ top: dropOffset }} />
            )}
          </div>
        )}
      </ScrollShadowRoot>}

      {/* Scroll-to-top pill — portaled to <body> so it escapes the panel's overflow+radius
          clip (which otherwise disables backdrop-filter on descendants). */}
      {visible && panelTab === "queue" && showScrollTop && fabPos && createPortal(
        <div style={{ position: "fixed", left: fabPos.left, width: fabPos.width, bottom: fabPos.bottom + 16, display: "flex", justifyContent: "center", zIndex: 200, pointerEvents: "none" }}
          className="animate-[pillRiseIn_0.26s_cubic-bezier(0.22,1,0.36,1)]">
          <div className="relative pointer-events-auto rounded-full shadow-[0_6px_22px_rgba(0,0,0,0.45)]">
            {/* Dedicated frosted backdrop layer — a plain div (no transform/isolation/clip
                ancestors here), so backdrop-filter actually samples the list behind it. */}
            <div className="absolute inset-0 rounded-full bg-[rgba(255,255,255,0.13)] backdrop-blur-2xl" />
            <Button
              variant="ghost" size="sm"
              onPress={() => listRef.current?.scrollTo({ top: Math.max(0, nowPlayingOffsetRef.current - 4), behavior: "smooth" })}
              className="relative gap-2 h-9! px-4 rounded-full text-t13 font-semibold text-primary! border-none! bg-transparent! hover:bg-[rgba(255,255,255,0.09)]!"
            ><CaretLineUp size={15} weight="bold" className="text-accent" /> {t("scrollToTop")}</Button>
          </div>
        </div>,
        document.body
      )}

      {rowMenu && (
        <ContextMenu x={rowMenu.x} y={rowMenu.y} zoom={zoom} placement="bottom end" onClose={() => setRowMenu(null)}
          ariaLabel={queue[rowMenu.globalIdx]?.title || "Track"} minWidth={210}>
          {queue[rowMenu.globalIdx + 1]
            ? <CtxItem icon={<Sliders size={15} />} label={t("crossfade")} onSelect={() => openFadeEdit(rowMenu.globalIdx)} />
            : null}
          <CtxItem icon={<Trash size={15} />} label={t("removeFromQueue")} danger
            onSelect={() => { const i = rowMenu.globalIdx; removeWithEffect(i, queue[i]?.videoId); }} />
        </ContextMenu>
      )}

      {fadeEdit && (
        <FadeEditorModal
          from={fadeEdit.from}
          to={fadeEdit.to}
          globalDefault={crossfade}
          current={crossfadeOverrides[fadeKey(fadeEdit.from, fadeEdit.to)]?.secs ?? null}
          onSave={(secs) => setCrossfadeOverride(fadeEdit.from.videoId, fadeEdit.to.videoId, secs, fadeEdit.from.title, fadeEdit.to.title)}
          onClear={() => removeCrossfadeOverride(fadeKey(fadeEdit.from, fadeEdit.to))}
          onClose={() => setFadeEdit(null)}
        />
      )}
    </div>
  );
}
