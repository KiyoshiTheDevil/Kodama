// A phone turned sideways with the video open: the video fills the screen, and a tap brings up
// its controls the way video apps do. Dimmed, the song and the lyrics switches at the top,
// previous / play / next in the middle, the position at the bottom. Gone again after a few
// seconds of playing. The desktop's fullscreen player bar took a third of the height there and
// covered the captions.
import { useEffect, useRef, useState } from "react";
import { CaretDown, ClosedCaptioning, Pause, Play, SkipBack, SkipForward } from "../icons.jsx";
import { sendPlayerCommand } from "../now-playing.js";
import { haptic } from "../haptics.js";

const HIDE_AFTER_MS = 3000;
const fmt = (s) => {
  if (!s || isNaN(s)) return "0:00";
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
};

export function MobileVideoChrome({ track, isPlaying, audioRef, showLyrics, onToggleLyrics, onLyricsOptions, onCollapse, onVisibleChange, labels }) {
  const [visible, setVisible] = useState(true);
  const hideTimer = useRef(null);
  const [time, setTime] = useState({ cur: 0, dur: 0 });
  const barRef = useRef(null);
  const seeking = useRef(false);

  // Shown, then hidden after a while, but only while the song plays: paused, they stay.
  const arm = () => {
    clearTimeout(hideTimer.current);
    if (isPlaying) hideTimer.current = setTimeout(() => setVisible(false), HIDE_AFTER_MS);
  };
  useEffect(() => {
    if (visible) arm(); else clearTimeout(hideTimer.current);
    return () => clearTimeout(hideTimer.current);
  }, [visible, isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { onVisibleChange?.(visible); }, [visible, onVisibleChange]);

  useEffect(() => {
    if (!visible) return;
    const tick = () => {
      const a = audioRef.current;
      if (a && !seeking.current) setTime({ cur: a.currentTime || 0, dur: Number.isFinite(a.duration) ? a.duration : 0 });
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [visible, audioRef]);

  // A press on a control keeps them up a while longer instead of letting the tap through.
  const press = (fn, kind = "tap") => (e) => { e.stopPropagation(); haptic(kind); fn(); arm(); };

  const seekTo = (clientX) => {
    const bar = barRef.current, a = audioRef.current;
    if (!bar || !a || !time.dur) return;
    const r = bar.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    setTime((t) => ({ ...t, cur: f * t.dur }));
    return f * time.dur;
  };
  const onBarDown = (e) => {
    e.stopPropagation();
    seeking.current = true;
    clearTimeout(hideTimer.current);
    seekTo(e.clientX);
    const move = (me) => seekTo(me.clientX);
    const up = (ue) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      const pos = seekTo(ue.clientX);
      if (pos != null && audioRef.current) audioRef.current.currentTime = pos;
      seeking.current = false;
      haptic("gesture-end");
      arm();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const pct = time.dur ? (time.cur / time.dur) * 100 : 0;
  const icon = "inline-flex items-center justify-center rounded-[var(--r-full)] text-white";

  return (
    <div onClick={() => setVisible((v) => !v)}
      style={{ position: "absolute", inset: 0, zIndex: 70, color: "#fff", WebkitTapHighlightColor: "transparent" }}>
      <div style={{
        position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)",
        opacity: visible ? 1 : 0, transition: "opacity 0.25s ease",
        pointerEvents: visible ? "auto" : "none",
      }}>
        {/* Top: down to the portrait player, the song, the lyrics switches. */}
        <div style={{ position: "absolute", top: 12, left: 16, right: 16, display: "flex", alignItems: "center", gap: 12 }}>
          <button type="button" aria-label={labels.collapse} onClick={press(onCollapse)} className={icon} style={{ width: 40, height: 40, background: "transparent", border: 0 }}>
            <CaretDown size={20} />
          </button>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: "var(--t14)", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{track?.title}</div>
            <div style={{ fontSize: "var(--t12)", opacity: 0.7, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{track?.artists}</div>
          </div>
          <button type="button" aria-label={labels.lyrics} aria-pressed={showLyrics} onClick={press(onToggleLyrics, showLyrics ? "toggle-off" : "toggle-on")}
            className={icon} style={{ width: 40, height: 40, background: "transparent", border: 0, opacity: showLyrics ? 1 : 0.6 }}>
            <ClosedCaptioning size={18} weight={showLyrics ? "fill" : "regular"} />
          </button>
          {showLyrics && (
            <button type="button" aria-label={labels.lyricsOptions} onClick={press(onLyricsOptions)}
              className={icon} style={{ width: 40, height: 40, background: "transparent", border: 0, fontWeight: 700, fontSize: "var(--t14)", fontFamily: "var(--font)" }}>
              Aa
            </button>
          )}
        </div>

        {/* Middle: previous, play/pause, next. */}
        {/* A little above the middle: three caption lines (text, romaji, translation) reached
            up to the play button otherwise. */}
        <div style={{ position: "absolute", top: "46%", left: "50%", transform: "translate(-50%, -50%)", display: "flex", alignItems: "center", gap: 48 }}>
          <button type="button" aria-label={labels.prev} onClick={press(() => sendPlayerCommand("prev"))} className={icon} style={{ width: 52, height: 52, background: "transparent", border: 0 }}>
            <SkipBack size={26} weight="fill" />
          </button>
          <button type="button" aria-label={labels.playPause} onClick={press(() => sendPlayerCommand("playpause"))}
            className={icon} style={{ width: 68, height: 68, border: 0, background: "var(--accent)", color: "var(--accent-foreground)" }}>
            {isPlaying ? <Pause size={28} weight="fill" /> : <Play size={28} weight="fill" />}
          </button>
          <button type="button" aria-label={labels.next} onClick={press(() => sendPlayerCommand("next"))} className={icon} style={{ width: 52, height: 52, background: "transparent", border: 0 }}>
            <SkipForward size={26} weight="fill" />
          </button>
        </div>

        {/* Bottom: the position, draggable. */}
        <div style={{ position: "absolute", left: 20, right: 20, bottom: 14, display: "flex", alignItems: "center", gap: 12, fontSize: "var(--t12)", fontVariantNumeric: "tabular-nums" }}>
          <span>{fmt(time.cur)}</span>
          <div ref={barRef} onPointerDown={onBarDown} onClick={(e) => e.stopPropagation()}
            style={{ flex: 1, height: 28, display: "flex", alignItems: "center", touchAction: "none" }}>
            <div style={{ position: "relative", width: "100%", height: 4, borderRadius: 2, background: "rgba(255,255,255,0.3)" }}>
              <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`, borderRadius: 2, background: "var(--accent)" }} />
              <div style={{ position: "absolute", top: "50%", left: `${pct}%`, width: 14, height: 14, borderRadius: "50%", background: "var(--accent)", transform: "translate(-50%, -50%)" }} />
            </div>
          </div>
          <span>{fmt(time.dur)}</span>
        </div>
      </div>
    </div>
  );
}
