import {
  Button,
  cn,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownPopover,
  DropdownSection,
  DropdownTrigger,
  SliderFill,
  SliderRoot,
  SliderThumb,
  SliderTrack,
  Spinner,
} from "@heroui/react";

import {
  ArrowsIn,
  ArrowsOut,
  CaretUp,
  ChatText,
  Check,
  Heart,
  Moon,
  Pause,
  Play,
  Queue,
  Repeat,
  RepeatOnce,
  Shuffle,
  SkipBack,
  SkipForward,
  SpeakerHigh,
  SpeakerLow,
  SpeakerX,
  X,
} from "../../icons.jsx";
import { thumb } from "../../shared/api/thumbnails.js";
import { translate } from "../../i18n.js";
import { Tooltip } from "../../ui/tooltip.jsx";
import { ArtistLinks, ExplicitBadge } from "../../ui/rows.jsx";
import { hiResThumb } from "./cover-art.js";
import { PlayerActionsMenu } from "./player-actions-menu.jsx";

export function PlayerControls(props) {
  const {
    anim,
    audioRef,
    buildShareLink,
    cachedSongIds,
    currentLyricsSource,
    cycleRepeat,
    downloadingIds,
    duration,
    expanded,
    failedLyricsProviders,
    fetchMoreBrowseIds,
    fetchedBrowseIds,
    fmt,
    formatSleepRemaining,
    fullscreen,
    getAdjacentTrack,
    isCustomLyrics,
    isLiked,
    isPlaying,
    language,
    likePulsing,
    loading,
    lyricsProviders,
    lyricsTranslationLang,
    nextBouncing,
    onAddToPlaylist,
    onDownloadSong,
    onExpandToggle,
    onExportSong,
    onImportLyrics,
    onOpenAlbum,
    onOpenArtist,
    onRefetchLyrics,
    onRemoveCustomLyrics,
    onSetLyricsTranslationLang,
    onSwitchLyricsProvider,
    onToggleFullscreen,
    onToggleLyrics,
    onToggleLyricsTranslation,
    onToggleQueue,
    prevBouncing,
    prevVolumeRef,
    progress,
    queueOpen,
    repeat,
    seekDrag,
    setNextBouncing,
    setPrevBouncing,
    setSeekDrag,
    setShuffle,
    setSleepTimerEnd,
    setTrack,
    setVolume,
    showLyrics,
    showLyricsTranslation,
    shuffle,
    sleepRemaining,
    sleepTimerEnd,
    t,
    toggleLike,
    togglePlay,
    track,
    volCurve,
    volume,
  } = props;

  const ctrlBtn = (onClick, active, children, tooltip) => {
    const btn = (
      <Button
        variant="ghost"
        isIconOnly
        onPress={onClick}
        className={cn("rounded-full", active ? "text-accent" : "text-secondary hover:text-primary")}
        style={{ contain: "layout style" }}
      >
        {children}
      </Button>
    );
    return tooltip ? <Tooltip text={tooltip}>{btn}</Tooltip> : btn;
  };

  return (
    <div
      data-testid="player"
      data-track-id={track?.videoId || undefined}
      style={{
        background: fullscreen ? "rgba(13,13,13,0.6)" : "transparent",
        backdropFilter: fullscreen ? "blur(20px)" : "none",
        flexShrink: 0,
        borderRadius: 0,
        position: "relative",
        zIndex: 50,
        display: "flex",
        flexDirection: "column",
        overflow: "visible",
      }}
    >
      {/* Seek slider — HeroUI Slider, sits between the content view and the player controls */}
      <div
        className={cn("seek-band", fullscreen && "seek-fullscreen")}
        style={{
          height: 10,
          display: "flex",
          alignItems: "center",
          padding: fullscreen ? "0" : "0 16px",
        }}
      >
        <SliderRoot
          aria-label="Seek"
          value={track ? (seekDrag !== null ? seekDrag : progress) : 0}
          minValue={0}
          maxValue={duration || 1}
          step={0.25}
          isDisabled={!track}
          onChange={(v) => setSeekDrag(v)}
          onChangeEnd={(v) => {
            const a = audioRef.current;
            if (a && duration) a.currentTime = v;
            setSeekDrag(null);
          }}
          className={cn("player-seek w-full", seekDrag !== null && "seeking")}
        >
          <SliderTrack>
            <SliderFill />
            <SliderThumb className="after:hidden! bg-transparent! shadow-none! w-0! min-w-0!" />
          </SliderTrack>
        </SliderRoot>
      </div>
      <div
        style={{
          height: 88,
          display: "flex",
          alignItems: "center",
          padding: fullscreen ? "0 20px 0 16px" : "0 20px 0 0",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10, width: 340, minWidth: 0 }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: "var(--r-xl)",
              flexShrink: 0,
              overflow: "hidden",
              background: "var(--bg-elevated)",
              animation: anim && track ? "coverPop 0.5s cubic-bezier(0.34,1.56,0.64,1)" : "none",
            }}
          >
            {track?.thumbnail ? (
              <img
                src={thumb(hiResThumb(track.thumbnail))}
                alt=""
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            ) : (
              <div
                style={{
                  width: "100%",
                  height: "100%",
                  background: track ? "linear-gradient(135deg,#2a1535,#1a0a25)" : "transparent",
                }}
              />
            )}
          </div>
          <div style={{ overflow: "hidden" }}>
            <div
              style={{
                fontSize: "var(--t13)",
                fontWeight: 500,
                display: "flex",
                alignItems: "center",
                gap: 4,
                overflow: "hidden",
              }}
            >
              {loading ? (
                <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <Spinner size="sm" />
                  <span
                    style={{
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      minWidth: 0,
                    }}
                  >
                    {t("loading")}
                  </span>
                </span>
              ) : (
                <span
                  style={{
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    minWidth: 0,
                  }}
                >
                  {track?.title}
                </span>
              )}
              {track?.isExplicit && <ExplicitBadge />}
            </div>
            <div
              style={{
                fontSize: "var(--t11)",
                color: "var(--text-secondary)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              <ArtistLinks
                track={track}
                onOpenArtist={onOpenArtist}
                onBeforeNavigate={() => {
                  if (expanded) onExpandToggle();
                }}
              />
            </div>
            <div style={{ fontSize: "var(--t10)", color: "var(--text-muted)", marginTop: 2 }}>
              {track ? `${fmt(progress)} / ${fmt(duration)}` : ""}
            </div>
          </div>
          {/* Like button */}
          <Tooltip text={isLiked ? t("unlike") : t("like")}>
            <Button
              variant="ghost"
              isIconOnly
              onPress={track ? toggleLike : undefined}
              className={cn(isLiked ? "text-accent" : "text-muted hover:text-secondary")}
              style={{
                visibility: track ? "visible" : "hidden",
                contain: "layout style",
                borderRadius: "9999px",
                width: 36,
                height: 36,
                minWidth: 36,
                padding: 0,
              }}
            >
              <Heart
                size={16}
                weight={isLiked ? "fill" : "regular"}
                style={
                  likePulsing
                    ? { animation: "heartPop 0.45s cubic-bezier(0.34,1.56,0.64,1) forwards" }
                    : undefined
                }
              />
            </Button>
          </Tooltip>
        </div>

        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 4,
          }}
        >
          {ctrlBtn(() => setShuffle((s) => !s), shuffle, <Shuffle size={16} />, t("shuffle"))}
          <Tooltip text={t("scPrev")}>
            <Button
              variant="ghost"
              isIconOnly
              isDisabled={!track}
              onPress={() => {
                if (anim) {
                  setPrevBouncing(true);
                  setTimeout(() => setPrevBouncing(false), 400);
                }
                const audio = audioRef.current;
                if (audio && audio.currentTime >= 4) {
                  audio.currentTime = 0;
                } else {
                  const tk = getAdjacentTrack("prev");
                  if (tk) setTrack(tk);
                }
              }}
              className="rounded-xl text-accent shrink-0"
              style={{ contain: "layout style" }}
            >
              <SkipBack
                size={22}
                style={
                  prevBouncing
                    ? { animation: "skipLeft 0.38s cubic-bezier(0.34,1.56,0.64,1) forwards" }
                    : undefined
                }
              />
            </Button>
          </Tooltip>
          <Button
            variant="primary"
            isDisabled={!track}
            onPress={track ? togglePlay : undefined}
            className="w-16 h-10 rounded-full shrink-0"
            style={{ contain: "layout style" }}
          >
            {isPlaying ? <Pause size={20} weight="fill" /> : <Play size={20} weight="fill" />}
          </Button>
          <Tooltip text={t("scNext")}>
            <Button
              variant="ghost"
              isIconOnly
              isDisabled={!track}
              onPress={() => {
                if (anim) {
                  setNextBouncing(true);
                  setTimeout(() => setNextBouncing(false), 400);
                }
                const tk = getAdjacentTrack("next");
                if (tk) setTrack(tk);
              }}
              className="rounded-xl text-accent shrink-0"
              style={{ contain: "layout style" }}
            >
              <SkipForward
                size={22}
                style={
                  nextBouncing
                    ? { animation: "skipRight 0.38s cubic-bezier(0.34,1.56,0.64,1) forwards" }
                    : undefined
                }
              />
            </Button>
          </Tooltip>
          {ctrlBtn(
            cycleRepeat,
            repeat !== "none",
            repeat === "one" ? <RepeatOnce size={16} /> : <Repeat size={16} />,
            repeat === "one" ? t("repeatOne") : repeat === "all" ? t("repeatAll") : t("repeat")
          )}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 2,
            width: 320,
            justifyContent: "flex-end",
            lineHeight: 0,
          }}
        >
          {/* Volume icon + slider */}
          <div data-volume-area style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Tooltip text={volume === 0 ? t("unmute") : t("mute")}>
              <Button
                variant="ghost"
                isIconOnly
                onPress={() => {
                  const a = audioRef.current;
                  if (!a) return;
                  const newVol = volume > 0 ? 0 : prevVolumeRef.current;
                  a.volume = volCurve(newVol);
                }}
                className={cn(
                  "rounded-full",
                  volume === 0
                    ? "text-muted hover:text-primary"
                    : "text-secondary hover:text-primary"
                )}
                style={{ contain: "layout style" }}
              >
                {volume === 0 ? (
                  <SpeakerX size={15} />
                ) : volume < 0.5 ? (
                  <SpeakerLow size={15} />
                ) : (
                  <SpeakerHigh size={15} />
                )}
              </Button>
            </Tooltip>
            {/* Volume slider */}
            <div
              className="vol-band"
              style={{
                width: 70,
                height: 16,
                display: "flex",
                alignItems: "center",
                flexShrink: 0,
              }}
            >
              <SliderRoot
                aria-label="Volume"
                value={volume}
                minValue={0}
                maxValue={1}
                step={0.01}
                onChange={(v) => {
                  setVolume(v);
                  if (audioRef.current) audioRef.current.volume = volCurve(v);
                }}
                onChangeEnd={(v) => {
                  localStorage.setItem("kiyoshi-volume", v);
                }}
                className="player-vol w-full"
              >
                <SliderTrack>
                  <SliderFill />
                  <SliderThumb className="after:hidden! bg-transparent! shadow-none! w-0! min-w-0!" />
                </SliderTrack>
              </SliderRoot>
            </div>
          </div>
          {/* Sleep Timer — HeroUI Dropdown */}
          <Dropdown>
            <DropdownTrigger
              title={
                sleepRemaining !== null
                  ? `${translate(language, "sleepTimer")}: ${formatSleepRemaining(sleepRemaining)}`
                  : translate(language, "sleepTimer")
              }
              className={cn(
                "shrink-0 w-9 h-9 rounded-full flex items-center justify-center relative transition-colors duration-150 hover:bg-hover",
                sleepRemaining !== null ? "text-accent" : "text-secondary hover:text-primary"
              )}
              style={{ contain: "layout style" }}
            >
              <Moon size={15} weight={sleepRemaining !== null ? "fill" : "regular"} />
              {sleepRemaining !== null && (
                <span
                  style={{
                    position: "absolute",
                    top: 0,
                    right: -2,
                    fontSize: 8,
                    fontWeight: 700,
                    lineHeight: 1,
                    color: "var(--accent)",
                    pointerEvents: "none",
                  }}
                >
                  ●
                </span>
              )}
            </DropdownTrigger>
            <DropdownPopover
              placement="top end"
              className="data-[entering]:animate-in data-[entering]:fade-in-0 data-[entering]:zoom-in-95 data-[entering]:slide-in-from-bottom-2 data-[entering]:duration-200 data-[exiting]:animate-out data-[exiting]:fade-out-0 data-[exiting]:zoom-out-95 data-[exiting]:duration-150"
            >
              <div className="px-3 pt-2.5 pb-1 text-t11 font-bold text-muted uppercase tracking-wider">
                {translate(language, "sleepTimer")}
              </div>
              <DropdownMenu
                aria-label={translate(language, "sleepTimer")}
                className="min-w-44"
                onAction={(key) => {
                  if (key === "off") setSleepTimerEnd(null);
                  else setSleepTimerEnd(Date.now() + Number(key) * 60 * 1000);
                }}
              >
                <DropdownSection>
                  {[5, 10, 15, 20, 30, 45, 60].map((min) => (
                    <DropdownItem
                      key={min}
                      id={String(min)}
                      textValue={`${min} ${translate(language, "minutes")}`}
                    >
                      {min} {translate(language, "minutes")}
                      {sleepTimerEnd &&
                        Math.abs((sleepTimerEnd - Date.now()) / 60000 - min) < 1 && (
                          <Check size={12} className="ml-auto text-accent" />
                        )}
                    </DropdownItem>
                  ))}
                </DropdownSection>
                {sleepRemaining !== null ? (
                  <DropdownSection className="w-full border-t border-border mt-1 pt-1">
                    <DropdownItem
                      id="off"
                      textValue={translate(language, "cancelSleepTimer")}
                      className="text-[#f44336]"
                    >
                      <X size={13} />
                      {translate(language, "cancelSleepTimer")}
                      <span className="ml-auto text-t12 font-semibold text-accent">
                        {formatSleepRemaining(sleepRemaining)}
                      </span>
                    </DropdownItem>
                  </DropdownSection>
                ) : null}
              </DropdownMenu>
            </DropdownPopover>
          </Dropdown>

          {/* Song, lyrics, provider, download, and sharing actions */}
          {track && (
            <PlayerActionsMenu
              {...{
                buildShareLink,
                cachedSongIds,
                currentLyricsSource,
                downloadingIds,
                expanded,
                failedLyricsProviders,
                fetchMoreBrowseIds,
                fetchedBrowseIds,
                isCustomLyrics,
                isLiked,
                language,
                lyricsProviders,
                lyricsTranslationLang,
                onAddToPlaylist,
                onDownloadSong,
                onExpandToggle,
                onExportSong,
                onImportLyrics,
                onOpenAlbum,
                onOpenArtist,
                onRefetchLyrics,
                onRemoveCustomLyrics,
                onSetLyricsTranslationLang,
                onSwitchLyricsProvider,
                onToggleLyricsTranslation,
                showLyricsTranslation,
                t,
                toggleLike,
                track,
              }}
            />
          )}
          {/* Queue toggle */}
          <Tooltip text={t("queueTooltip")}>
            <Button
              variant="ghost"
              isIconOnly
              onPress={onToggleQueue}
              className={cn(
                "rounded-full",
                queueOpen ? "text-accent" : "text-secondary hover:text-primary"
              )}
              style={{ contain: "layout style" }}
            >
              <Queue size={16} />
            </Button>
          </Tooltip>
          {/* Lyrics toggle */}
          <Tooltip text={t("lyricsTooltip")}>
            <Button
              variant="ghost"
              isIconOnly
              onPress={onToggleLyrics}
              className={cn(
                "rounded-full",
                expanded && showLyrics ? "text-accent" : "text-secondary hover:text-primary"
              )}
              style={{ contain: "layout style" }}
            >
              <ChatText size={16} />
            </Button>
          </Tooltip>
          {/* Expand toggle — hidden in fullscreen (overlay is always open there) */}
          {!fullscreen && (
            <Button
              variant="ghost"
              isIconOnly
              onPress={onExpandToggle}
              className={cn(
                "rounded-full",
                expanded ? "text-accent" : "text-secondary hover:text-primary"
              )}
              style={{ contain: "layout style" }}
            >
              <CaretUp
                size={16}
                style={{
                  transform: expanded ? "rotate(180deg)" : "none",
                  transition: "transform 0.3s cubic-bezier(0.4,0,0.2,1)",
                }}
              />
            </Button>
          )}
          {/* Fullscreen toggle */}
          <Tooltip text={t("fullscreenTooltip")}>
            <Button
              variant="ghost"
              isIconOnly
              onPress={onToggleFullscreen}
              className={cn(
                "rounded-full",
                fullscreen ? "text-accent" : "text-secondary hover:text-primary"
              )}
              style={{ contain: "layout style" }}
            >
              {fullscreen ? <ArrowsIn size={18} /> : <ArrowsOut size={18} />}
            </Button>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
