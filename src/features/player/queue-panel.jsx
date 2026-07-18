import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Button,
  CardRoot,
  ChipLabel,
  ChipRoot,
  ScrollShadowRoot,
  ToggleButton,
  ToggleButtonGroupRoot,
} from "@heroui/react";

import { ArrowClockwise, CaretLineUp, GripLines, Heart, Sliders, Trash } from "../../icons.jsx";
import { API } from "../../shared/api/client.js";
import { thumb } from "../../shared/api/thumbnails.js";
import { Tooltip } from "../../ui/tooltip.jsx";
import { ExplicitBadge } from "../../ui/rows.jsx";
import { dissolve } from "../../effects/particle-burst.js";
import { useAnimations, useLang } from "../../context.jsx";
import { FadeEditorModal } from "./fade-editor-modal.jsx";
import { usePlayerState, usePlayerActions } from "./player-context.jsx";

function QueueRow({
  track,
  globalIdx,
  isDraggable,
  dimmed,
  isActive,
  dragOver,
  onPointerDown,
  onPlay,
  onRemove,
  isLiked,
  onToggleLike,
  onEditFade,
  fadeSecs,
}) {
  const isDragOver = dragOver === globalIdx;
  const anim = useAnimations();
  const rowRef = useRef(null);
  return (
    <div
      ref={rowRef}
      data-queue-idx={globalIdx}
      onClick={onPlay}
      onContextMenu={
        onEditFade
          ? (e) => {
              e.preventDefault();
              onEditFade();
            }
          : undefined
      }
      onPointerDown={isDraggable ? (e) => onPointerDown(e, globalIdx) : undefined}
      className={`group/qrow flex items-center gap-2 pl-2.5 pr-3 py-1.5 rounded-[var(--r-md)] cursor-default select-none border-t-2 transition-[background-color,border-color,opacity] ${
        isDragOver
          ? "bg-[rgba(224,64,251,0.12)] border-t-accent"
          : isActive
            ? "bg-accent-dim border-t-transparent"
            : "bg-transparent border-t-transparent hover:bg-[var(--fill-subtle)]"
      } ${dimmed ? "opacity-45 hover:opacity-100" : ""}`}
    >
      {/* Drag handle (the whole row is draggable; this is just the affordance) */}
      <div
        className={`shrink-0 px-px py-0.5 touch-none transition-opacity ${isDraggable ? "cursor-grab opacity-40 group-hover/qrow:opacity-100" : "opacity-0"}`}
      >
        <GripLines size={13} className="block pointer-events-none text-muted" />
      </div>

      {/* Thumbnail */}
      <div className="w-9 h-9 shrink-0 overflow-hidden rounded-[var(--r-sm)] bg-surface-1">
        {track.thumbnail ? (
          <img src={thumb(track.thumbnail)} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-[linear-gradient(135deg,#2a1535,#1a0a25)]" />
        )}
      </div>

      {/* Title + artist */}
      <div className="flex-1 min-w-0">
        <div
          className={`flex items-center gap-1 overflow-hidden text-t12 font-medium ${isActive ? "text-accent" : "text-primary"}`}
        >
          <span className="truncate min-w-0">{track.title}</span>
          {track.isExplicit && <ExplicitBadge />}
        </div>
        <div className="text-t11 text-secondary truncate">{track.artists}</div>
      </div>

      {/* Custom-crossfade indicator (set via right-click) */}
      {fadeSecs != null && (
        <span
          title={`Crossfade: ${fadeSecs}s`}
          className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-semibold text-accent px-1.5 py-0.5 rounded-[var(--r-sm)] bg-accent-dim"
        >
          <Sliders size={10} weight="bold" />
          {fadeSecs}s
        </span>
      )}

      {/* Duration */}
      {track.duration && (
        <div className="shrink-0 min-w-[28px] text-t11 text-muted text-right">{track.duration}</div>
      )}

      {/* Like button */}
      <span
        className="shrink-0 inline-flex"
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          variant="ghost"
          size="sm"
          isIconOnly
          onPress={() => onToggleLike?.(track)}
          className={`h-7 min-w-7 rounded-[var(--r-sm)] ${isLiked ? "text-accent" : "text-muted hover:text-secondary"}`}
        >
          <Heart size={14} weight={isLiked ? "fill" : "regular"} />
        </Button>
      </span>

      {/* Remove button */}
      {isDraggable && (
        <span
          className="shrink-0 inline-flex"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            variant="ghost"
            size="sm"
            isIconOnly
            onPress={() => {
              if (anim) dissolve(rowRef.current, () => onRemove(track.videoId));
              else onRemove(track.videoId);
            }}
            className="h-7 min-w-7 rounded-[var(--r-sm)] text-muted hover:text-[#ff7070]!"
          >
            <Trash size={13} />
          </Button>
        </span>
      )}
    </div>
  );
}

export function QueuePanel({
  onClose,
  likedIds,
  onToggleLike,
  visible,
}) {
  // Core playback + crossfade config come from PlayerContext (Step 11) rather than props.
  const { track: currentTrack, queue, crossfade = 0, crossfadeOverrides = {} } = usePlayerState();
  const { setQueue, setTrack, setCrossfadeOverride, removeCrossfadeOverride } = usePlayerActions();
  const t = useLang();
  const [panelTab, setPanelTab] = useState("queue");
  const [fadeEdit, setFadeEdit] = useState(null); // { from, to } — open the per-transition fade editor
  const fadeKey = (a, b) => `${a?.videoId}__${b?.videoId}`;
  const [songDesc, setSongDesc] = useState(null); // null=loading, ""=none, str=text
  const [songDescId, setSongDescId] = useState(null);
  const [songDescError, setSongDescError] = useState(null);
  const [dragIdx, setDragIdx] = useState(null);
  const [dragOver, setDragOver] = useState(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [fabPos, setFabPos] = useState(null); // {left,width,bottom} for the portaled scroll-top pill
  const isDragging = useRef(false);
  const suppressClickRef = useRef(false);
  const listRef = useRef(null);
  const nowPlayingRef = useRef(null);

  // Fetch song description when switching to About tab or track changes
  const fetchSongDesc = useCallback(
    (videoId, force = false) => {
      if (!videoId) return;
      if (!force && songDescId === videoId) return;
      setSongDesc(null);
      setSongDescError(null);
      setSongDescId(videoId);
      fetch(`${API}/song/credits/${videoId}`)
        .then((r) => r.json())
        .then((d) => {
          if (d.error) setSongDescError(d.error);
          else setSongDesc(d.description || "");
        })
        .catch(() => setSongDesc(""));
    },
    [songDescId]
  );

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
      const target = nowPlayingRef.current;
      if (target) {
        const containerRect = el.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const targetScrollPos = el.scrollTop + targetRect.top - containerRect.top;
        setShowScrollTop(el.scrollTop > targetScrollPos + target.clientHeight);
      } else {
        setShowScrollTop(el.scrollTop > 180);
      }
      updatePos();
    };
    el.addEventListener("scroll", onScroll);
    window.addEventListener("resize", updatePos);
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", updatePos);
    };
  }, []);

  const currentIdx = queue.findIndex((t) => t.videoId === currentTrack?.videoId);
  const upNext = queue.slice(currentIdx + 1);
  const played = queue.slice(0, currentIdx);

  // Open the per-transition fade editor for globalIdx → globalIdx+1.
  const openFadeEdit = (globalIdx) => {
    const from = queue[globalIdx],
      to = queue[globalIdx + 1];
    if (from && to) setFadeEdit({ from, to });
  };

  const removeTrack = useCallback(
    (videoId) => {
      setQueue((q) => q.filter((t) => t.videoId !== videoId));
    },
    [setQueue]
  );

  const dragOverRef = useRef(null);

  const handlePointerDown = useCallback(
    (e, globalIdx) => {
      if (e.button !== 0) return; // ignore right/middle click so the context menu (fade editor) fires
      e.preventDefault();
      isDragging.current = false;
      dragOverRef.current = null;

      const startY = e.clientY;

      const onMove = (me) => {
        if (Math.abs(me.clientY - startY) > 4) isDragging.current = true;
        if (!isDragging.current || !listRef.current) return;
        const rows = listRef.current.querySelectorAll("[data-queue-idx]");
        let closest = null;
        let closestDist = Infinity;
        rows.forEach((row) => {
          const rect = row.getBoundingClientRect();
          const mid = rect.top + rect.height / 2;
          const dist = Math.abs(me.clientY - mid);
          if (dist < closestDist) {
            closestDist = dist;
            closest = row;
          }
        });
        if (closest) {
          const idx = parseInt(closest.dataset.queueIdx);
          dragOverRef.current = idx;
          setDragOver(idx);
        }
      };

      const onUp = () => {
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        const target = dragOverRef.current;
        const didDrag = isDragging.current;
        if (didDrag && target !== null && target !== globalIdx) {
          setQueue((q) => {
            const next = [...q];
            const [moved] = next.splice(globalIdx, 1);
            // Compensate for the removed item: when dropping below the origin, every
            // index at/after `globalIdx` shifted up by one, so the visual slot is target-1.
            const targetIdx = target > globalIdx ? target - 1 : target;
            next.splice(targetIdx, 0, moved);
            return next;
          });
        }
        // Suppress the click that fires right after a drag so it doesn't also start playback.
        if (didDrag) {
          suppressClickRef.current = true;
          setTimeout(() => {
            suppressClickRef.current = false;
          }, 0);
        }
        isDragging.current = false;
        dragOverRef.current = null;
        setDragIdx(null);
        setDragOver(null);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [setQueue]
  );

  const handleDragStart = useCallback((i) => {}, []);
  const handleDragOver = useCallback((i) => {}, []);
  const handleDrop = useCallback((i) => {}, []);
  const handleDragEnd = useCallback(() => {}, []);

  return (
    <div className="flex flex-col h-full relative">
      {/* Header */}
      <div className="px-3 pt-11 shrink-0">
        <div className="flex items-center gap-1.5 mb-2.5">
          {/* HeroUI segmented tabs */}
          <ToggleButtonGroupRoot
            selectionMode="single"
            disallowEmptySelection
            selectedKeys={[panelTab]}
            onSelectionChange={(keys) => {
              const v = [...keys][0];
              if (v) setPanelTab(v);
            }}
            size="sm"
            fullWidth
            className="flex-1"
          >
            <ToggleButton id="queue" className="flex-1">
              {t("queue")}
            </ToggleButton>
            <ToggleButton id="about" className="flex-1">
              {t("aboutSong")}
            </ToggleButton>
          </ToggleButtonGroupRoot>
          {/* Clear queue icon button — always rendered to keep pill width stable */}
          <Tooltip text={t("clearQueue")}>
            <Button
              variant="ghost"
              size="sm"
              isIconOnly
              onPress={() => setQueue([])}
              className={`shrink-0 rounded-[var(--r-md)] text-muted hover:text-[#ff7070]! ${panelTab === "queue" ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
            >
              <Trash size={13} />
            </Button>
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
                  <img
                    src={currentTrack.thumbnail}
                    alt=""
                    className="w-[52px] h-[52px] rounded-[var(--r-md)] object-cover shrink-0"
                  />
                )}
                <div className="min-w-0">
                  <div className="text-t13 font-semibold text-primary truncate">
                    {currentTrack.title}
                  </div>
                  <div className="text-t12 text-secondary mt-0.5 truncate">
                    {currentTrack.artists}
                  </div>
                  {currentTrack.album && (
                    <div className="text-t11 text-muted mt-0.5 truncate">{currentTrack.album}</div>
                  )}
                </div>
              </CardRoot>

              {/* Description */}
              {songDesc === null && !songDescError && (
                <div className="text-t12 text-muted">{t("loadingDots")}</div>
              )}
              {songDescError && (
                <div className="flex flex-col gap-2">
                  <div className="text-t12 text-muted">{t("noCredits")}</div>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="self-start gap-1.5 text-t11"
                    onPress={() => {
                      setSongDescId(null);
                      fetchSongDesc(currentTrack?.videoId, true);
                    }}
                  >
                    <ArrowClockwise size={11} /> {t("retry") || "Erneut versuchen"}
                  </Button>
                </div>
              )}
              {songDesc !== null && songDesc === "" && !songDescError && (
                <div className="text-t12 text-muted">{t("noCredits")}</div>
              )}
              {songDesc && (
                <p className="m-0 text-t12 leading-[1.7] text-secondary whitespace-pre-wrap">
                  {songDesc}
                </p>
              )}
            </>
          ) : (
            <div className="text-t13 text-muted text-center mt-10">{t("selectSong")}</div>
          )}
        </div>
      )}

      {panelTab === "queue" && (
        <ScrollShadowRoot
          ref={listRef}
          size={28}
          className="scrollable flex-1 overflow-y-auto px-2 pt-1 pb-4"
        >
          {/* Previously played */}
          {played.length > 0 && (
            <>
              <div className="group/qsec flex items-center justify-between px-1.5 pt-2.5 pb-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                  {t("previouslyPlayed")}
                </span>
                <Tooltip text={t("clearPlayed")}>
                  <Button
                    variant="ghost"
                    size="sm"
                    isIconOnly
                    onPress={() => setQueue((q) => q.slice(currentIdx))}
                    className="shrink-0 h-6 min-w-6 rounded-[var(--r-sm)] text-muted opacity-0 group-hover/qsec:opacity-100 hover:text-[#ff7070]!"
                  >
                    <Trash size={11} />
                  </Button>
                </Tooltip>
              </div>
              {played.map((qt, i) => (
                <QueueRow
                  key={qt.videoId || i}
                  track={qt}
                  globalIdx={i}
                  isDraggable={true}
                  dimmed={true}
                  isActive={false}
                  dragOver={dragOver}
                  onPointerDown={handlePointerDown}
                  onPlay={() => {
                    if (suppressClickRef.current) return;
                    setTrack(qt);
                  }}
                  onRemove={removeTrack}
                  isLiked={likedIds?.has(qt.videoId)}
                  onToggleLike={onToggleLike}
                />
              ))}
            </>
          )}

          {/* Now playing */}
          {currentTrack && (
            <>
              <div
                ref={nowPlayingRef}
                className="px-1.5 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted"
              >
                {t("nowPlaying")}
              </div>
              <QueueRow
                track={currentTrack}
                globalIdx={currentIdx}
                isDraggable={false}
                dimmed={true}
                isActive={true}
                dragOver={dragOver}
                onPointerDown={handlePointerDown}
                onPlay={() => setTrack(currentTrack)}
                onRemove={removeTrack}
                isLiked={likedIds?.has(currentTrack.videoId)}
                onToggleLike={onToggleLike}
                onEditFade={queue[currentIdx + 1] ? () => openFadeEdit(currentIdx) : undefined}
                fadeSecs={
                  crossfadeOverrides[fadeKey(currentTrack, queue[currentIdx + 1])]?.secs ?? null
                }
              />
            </>
          )}

          {/* Up next */}
          {upNext.length > 0 && (
            <>
              <div className="flex items-center gap-1.5 px-1.5 pt-2.5 pb-1">
                <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted">
                  {t("upNext")}
                </span>
                <ChipRoot size="sm" variant="soft">
                  <ChipLabel>{upNext.length}</ChipLabel>
                </ChipRoot>
              </div>
              {upNext.map((qt, i) => {
                const gIdx = currentIdx + 1 + i;
                return (
                  <QueueRow
                    key={qt.videoId || i}
                    track={qt}
                    globalIdx={gIdx}
                    isDraggable={true}
                    isActive={false}
                    dragOver={dragOver}
                    onPointerDown={handlePointerDown}
                    onPlay={() => {
                      if (suppressClickRef.current) return;
                      setTrack(qt);
                    }}
                    onRemove={removeTrack}
                    isLiked={likedIds?.has(qt.videoId)}
                    onToggleLike={onToggleLike}
                    onEditFade={queue[gIdx + 1] ? () => openFadeEdit(gIdx) : undefined}
                    fadeSecs={crossfadeOverrides[fadeKey(qt, queue[gIdx + 1])]?.secs ?? null}
                  />
                );
              })}
            </>
          )}

          {queue.length === 0 && (
            <div className="p-6 text-t13 text-muted text-center">{t("emptyQueue")}</div>
          )}
        </ScrollShadowRoot>
      )}

      {/* Scroll-to-top pill — portaled to <body> so it escapes the panel's overflow+radius
          clip (which otherwise disables backdrop-filter on descendants). */}
      {visible &&
        panelTab === "queue" &&
        showScrollTop &&
        fabPos &&
        createPortal(
          <div
            style={{
              position: "fixed",
              left: fabPos.left,
              width: fabPos.width,
              bottom: fabPos.bottom + 16,
              display: "flex",
              justifyContent: "center",
              zIndex: 200,
              pointerEvents: "none",
            }}
            className="animate-[pillRiseIn_0.26s_cubic-bezier(0.22,1,0.36,1)]"
          >
            <div className="relative pointer-events-auto rounded-full shadow-[0_6px_22px_rgba(0,0,0,0.45)]">
              {/* Dedicated frosted backdrop layer — a plain div (no transform/isolation/clip
                ancestors here), so backdrop-filter actually samples the list behind it. */}
              <div className="absolute inset-0 rounded-full bg-[rgba(255,255,255,0.13)] backdrop-blur-2xl" />
              <Button
                variant="ghost"
                size="sm"
                onPress={() => {
                  const target = nowPlayingRef.current;
                  const container = listRef.current;
                  if (target && container) {
                    const containerRect = container.getBoundingClientRect();
                    const targetRect = target.getBoundingClientRect();
                    const scrollOffset =
                      container.scrollTop + targetRect.top - containerRect.top - 8;
                    container.scrollTo({ top: scrollOffset, behavior: "smooth" });
                  } else {
                    listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                  }
                }}
                className="relative gap-2 h-9! px-4 rounded-full text-t13 font-semibold text-primary! border-none! bg-transparent! hover:bg-[rgba(255,255,255,0.09)]!"
              >
                <CaretLineUp size={15} weight="bold" className="text-accent" /> {t("scrollToTop")}
              </Button>
            </div>
          </div>,
          document.body
        )}

      {fadeEdit && (
        <FadeEditorModal
          from={fadeEdit.from}
          to={fadeEdit.to}
          globalDefault={crossfade}
          current={crossfadeOverrides[fadeKey(fadeEdit.from, fadeEdit.to)]?.secs ?? null}
          onSave={(secs) =>
            setCrossfadeOverride?.(
              fadeEdit.from.videoId,
              fadeEdit.to.videoId,
              secs,
              fadeEdit.from.title,
              fadeEdit.to.title
            )
          }
          onClear={() => removeCrossfadeOverride?.(fadeKey(fadeEdit.from, fadeEdit.to))}
          onClose={() => setFadeEdit(null)}
        />
      )}
    </div>
  );
}


