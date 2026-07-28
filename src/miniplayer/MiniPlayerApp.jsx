/**
 * Mini player — a square always-on-top window that *is* the cover art. Controls stay out of
 * the way until the pointer enters, then fade in over a darkened scrim.
 *
 * It owns no playback state: everything arrives over EV_NOW_PLAYING, and every button emits
 * a "media-control" command that the main window already knows how to execute (the same
 * channel the OS media keys use). See ./bridge.js.
 */
import React, { useCallback, useEffect, useState } from "react";
import { Button, SliderRoot, SliderTrack, SliderFill, SliderThumb } from "@heroui/react";
import { Play, Pause, SkipBack, SkipForward, MiniPlayerExit, X } from "../icons.jsx";
import { translate } from "../i18n.js";
import { thumbHi } from "../context.jsx";
import { EV_NOW_PLAYING, MINI_SIZE_KEY, sayHello, sendToMain, requestShowMain } from "./bridge.js";

const fmt = (s) => {
  if (!isFinite(s) || s < 0) s = 0;
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
};

const EMPTY = { title: "", artists: "", thumbnail: "", isPlaying: false, position: 0, duration: 0, at: 0, hasTrack: false };

export default function MiniPlayerApp() {
  const [np, setNp] = useState(EMPTY);
  const [, setTick] = useState(0);
  const [hover, setHover] = useState(false);
  const [seekDrag, setSeekDrag] = useState(null); // seconds while dragging, else null
  const lang = localStorage.getItem("kiyoshi-lang") || "de";
  const t = useCallback((k) => translate(lang, k), [lang]);

  // Own document, so the theme/accent that App() applies to the main window's <html> has to
  // be applied again here. Both live in localStorage, which the windows share (same origin).
  useEffect(() => {
    const accent = localStorage.getItem("kiyoshi-accent");
    if (accent) document.documentElement.style.setProperty("--accent", accent);
    document.documentElement.setAttribute("data-theme", localStorage.getItem("kiyoshi-theme") || "dark");
    if (localStorage.getItem("kiyoshi-high-contrast") === "true") {
      document.documentElement.setAttribute("data-highcontrast", "true");
    }
    document.body.style.background = "#000";
    document.body.style.overflow = "hidden";
  }, []);

  // Native window trimmings: hold the 1:1 ratio during the resize drag itself (a WM_SIZING
  // subclass on Windows, NSWindow's own aspect ratio on macOS), and strip the Windows 11
  // accent border that borderless windows get — same call the overlay editor makes.
  useEffect(() => {
    import("@tauri-apps/api/core").then(({ invoke }) => {
      invoke("lock_square_for", { label: "mini-player" }).catch(() => {});
      invoke("remove_window_border_for", { label: "mini-player" }).catch(() => {});
    }).catch(() => {});
  }, []);

  useEffect(() => {
    let unlisten;
    import("@tauri-apps/api/event").then(({ listen }) => {
      listen(EV_NOW_PLAYING, (e) => {
        if (e.payload) setNp({ ...EMPTY, ...e.payload });
      }).then((fn) => { unlisten = fn; });
    });
    sayHello(); // the main window only broadcasts on change — ask for the current state
    return () => { unlisten && unlisten(); };
  }, []);

  // Local clock between updates, so the bar moves smoothly without a message per frame.
  // Only needed while the controls are actually visible.
  useEffect(() => {
    if (!hover) return;
    const id = setInterval(() => setTick((n) => n + 1), 250);
    return () => clearInterval(id);
  }, [hover]);

  // Remember the size so the window reopens the way it was left. The squaring below is only
  // a fallback for platforms without the native lock above (Linux): where that lock works,
  // the incoming size is already square and this returns before touching anything.
  useEffect(() => {
    let unlisten, cancelled = false;
    let scale = 1, prev = null, correcting = false;
    (async () => {
      const { getCurrentWindow } = await import("@tauri-apps/api/window");
      const { LogicalSize } = await import("@tauri-apps/api/dpi");
      const w = getCurrentWindow();
      try { scale = await w.scaleFactor(); } catch {}
      if (cancelled) return;
      unlisten = await w.onResized(async ({ payload }) => {
        if (correcting) return;
        const { width: pw, height: ph } = payload;
        const target = prev && Math.abs(ph - prev.h) > Math.abs(pw - prev.w) ? ph : pw;
        prev = { w: target, h: target };
        const logical = Math.round(target / scale);
        try { localStorage.setItem(MINI_SIZE_KEY, String(logical)); } catch {}
        if (pw === ph) return;
        correcting = true;
        try { await w.setSize(new LogicalSize(logical, logical)); } catch {}
        setTimeout(() => { correcting = false; }, 60);
      });
    })();
    return () => { cancelled = true; unlisten && unlisten(); };
  }, []);

  const closeSelf = async () => {
    const { getCurrentWindow } = await import("@tauri-apps/api/window");
    await getCurrentWindow().close();
  };

  const elapsed = np.at && np.isPlaying ? (Date.now() - np.at) / 1000 : 0;
  const live = Math.max(0, Math.min(np.duration || 0, (np.position || 0) + elapsed));
  const shown = seekDrag !== null ? seekDrag : live;

  const commitSeek = (v) => {
    sendToMain("seek", { position: v });
    // Assume the seek lands and re-anchor locally, so the fill doesn't snap back during the
    // round trip. The next broadcast corrects it either way.
    setNp((s) => ({ ...s, position: v, at: Date.now() }));
    setSeekDrag(null);
  };

  // data-ambient: the whole window is cover art, which is exactly the case that attribute
  // exists for — it swaps the seek track to the translucent variant (see index.css).
  return (
    <div
      data-tauri-drag-region
      data-ambient="true"
      className="relative w-screen h-screen overflow-hidden select-none"
      style={{ background: np.thumbnail ? "#000" : "var(--placeholder-gradient)" }}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => { setHover(false); setSeekDrag(null); }}
    >
      {/* Cover fills the window. The broadcast carries the raw thumbnail — the small list
          variant — so it gets upgraded here: the window is square and can be scaled by DPI,
          which made the shipped size visibly soft. Same path Big Picture's cover uses. */}
      {np.thumbnail && (
        <img
          src={thumbHi(np.thumbnail, 800)} alt="" draggable={false}
          data-tauri-drag-region
          className="absolute inset-0 w-full h-full object-cover"
          style={{ transform: hover ? "scale(1.04)" : "scale(1)", transition: "transform 0.35s cubic-bezier(0.4,0,0.2,1)" }}
        />
      )}

      {/* Scrim + controls — only on hover */}
      <div
        data-tauri-drag-region
        className="absolute inset-0 flex flex-col justify-between p-3"
        style={{
          background: "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.35) 35%, rgba(0,0,0,0.78) 100%)",
          opacity: hover ? 1 : 0,
          pointerEvents: hover ? "auto" : "none",
          transition: "opacity 0.22s ease",
        }}
      >
        {/* Window buttons — ghost buttons like the player bar's toolbar, but keyed to white:
            they sit on cover art, where the app's secondary text colour has no contrast. */}
        <div data-tauri-drag-region className="flex items-center justify-end gap-0.5">
          <Button
            variant="ghost" isIconOnly aria-label={t("miniPlayerOpenMain")}
            onPress={async () => { await requestShowMain(); await closeSelf(); }}
            className="rounded-full text-white/70 hover:text-white"
          >
            <MiniPlayerExit size={14} />
          </Button>
          <Button
            variant="ghost" isIconOnly aria-label={t("miniPlayerClose")}
            onPress={closeSelf}
            className="rounded-full text-white/70 hover:text-white"
          >
            <X size={14} />
          </Button>
        </div>

        {/* Transport — same HeroUI buttons the player bar uses, so both read as one control
            set: ghost accent skips either side of a primary pill. Only the sizes are dialled
            back a little for the smaller surface. */}
        <div data-tauri-drag-region className="flex items-center justify-center gap-1">
          <Button
            variant="ghost" isIconOnly isDisabled={!np.hasTrack}
            onPress={() => sendToMain("previous")}
            aria-label={t("miniPlayerPrev")}
            className="rounded-xl text-accent shrink-0"
          >
            <SkipBack size={20} />
          </Button>
          <Button
            variant="primary" isDisabled={!np.hasTrack}
            onPress={() => sendToMain("toggle")}
            aria-label={t("miniPlayerPlayPause")}
            className="w-14 h-9 rounded-full shrink-0"
          >
            {np.isPlaying ? <Pause size={18} weight="fill" /> : <Play size={18} weight="fill" />}
          </Button>
          <Button
            variant="ghost" isIconOnly isDisabled={!np.hasTrack}
            onPress={() => sendToMain("next")}
            aria-label={t("miniPlayerNext")}
            className="rounded-xl text-accent shrink-0"
          >
            <SkipForward size={20} />
          </Button>
        </div>

        {/* Title + progress */}
        <div data-tauri-drag-region className="flex flex-col gap-1.5">
          <div data-tauri-drag-region>
            <div className="text-t12 font-medium text-white truncate" title={np.title}>
              {np.hasTrack ? np.title : t("miniPlayerIdle")}
            </div>
            <div className="text-t10 text-white/60 truncate" title={np.artists}>{np.artists}</div>
          </div>
          {/* Seek — the player bar's slider, class for class (see .player-seek in index.css),
              so both windows share the 8px track, the interpolated fill and the hover
              gradient. The seek-band wrapper is what that gradient keys its hover off. */}
          <div data-tauri-drag-region className="flex items-center gap-1.5">
            <span data-tauri-drag-region className="text-t10 text-white/50 tabular-nums shrink-0" style={{ minWidth: 26 }}>{fmt(shown)}</span>
            <div className="seek-band flex-1 flex items-center" style={{ height: 10 }}>
              <SliderRoot
                aria-label="Seek"
                value={np.hasTrack ? shown : 0}
                minValue={0}
                maxValue={np.duration || 1}
                step={0.25}
                isDisabled={!np.hasTrack}
                onChange={(v) => setSeekDrag(v)}
                onChangeEnd={commitSeek}
                className={`player-seek w-full${seekDrag !== null ? " seeking" : ""}`}
              >
                <SliderTrack>
                  <SliderFill />
                  <SliderThumb className="after:hidden! bg-transparent! shadow-none! w-0! min-w-0!" />
                </SliderTrack>
              </SliderRoot>
            </div>
            <span data-tauri-drag-region className="text-t10 text-white/50 tabular-nums shrink-0" style={{ minWidth: 26, textAlign: "right" }}>{fmt(np.duration)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
