import { useEffect, useRef } from "react";
import { matchesShortcut, serializeShortcut } from "../../shared/lib/shortcuts.js";

// Stepped values for the zoom slider (mirrors the copy in App.jsx, which owns the persisted state).
const ZOOM_STEPS = [0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5];

// Global keyboard-shortcut handler for the app shell — playback, seek, volume/mute, zoom,
// fullscreen, lyrics, feedback (F8), plus shortcut-recording and layout-label capture.
// Extracted verbatim from AppShell.jsx (Step 14); every piece of state it drives is passed
// in via the options object, and it owns the mute-restore volume ref itself.
export function useAppShortcuts({
  recordingShortcutRef,
  customShortcutsRef,
  audioRef,
  queueRef,
  setCustomShortcuts,
  setShortcutLabels,
  setRecordingShortcut,
  setIsPlaying,
  setCurrentTrack,
  setFullscreen,
  setOverlayOpen,
  setQueueOpen,
  setSplitView,
  setShowLyricsManual,
  setUiZoom,
  openFeedback,
  currentTrack,
  overlayOpen,
  splitView,
  isPlaying,
}) {
  const mutePrevVolumeRef = useRef(0.5);
  useEffect(() => {
    const onKey = (e) => {
      const tgt = e.target;
      if (
        tgt.tagName === "INPUT" ||
        tgt.tagName === "TEXTAREA" ||
        tgt.isContentEditable ||
        (tgt.closest && tgt.closest('[role="menu"],[role="dialog"],[role="menuitem"]'))
      )
        return;
      const isModifier = ["Control", "Shift", "Alt", "Meta"].includes(e.key);

      // Recording mode — capture next non-modifier key (with any active modifiers)
      if (recordingShortcutRef.current) {
        if (!isModifier) {
          e.preventDefault();
          if (e.code !== "Escape") {
            const actionId = recordingShortcutRef.current;
            const shortcut = serializeShortcut(e);
            setCustomShortcuts((prev) => {
              const next = { ...prev, [actionId]: shortcut };
              localStorage.setItem("kiyoshi-shortcuts", JSON.stringify(next));
              return next;
            });
            setShortcutLabels((prev) => {
              if (prev[e.code] === e.key) return prev;
              const next = { ...prev, [e.code]: e.key };
              localStorage.setItem("kiyoshi-shortcut-labels", JSON.stringify(next));
              return next;
            });
          }
          setRecordingShortcut(null);
        }
        return;
      }

      // Capture layout-aware display labels on every keypress
      if (!isModifier && e.code) {
        setShortcutLabels((prev) => {
          if (prev[e.code] === e.key) return prev;
          const next = { ...prev, [e.code]: e.key };
          localStorage.setItem("kiyoshi-shortcut-labels", JSON.stringify(next));
          return next;
        });
      }

      // While the overlay editor is open, playback shortcuts must not fire.
      if (document.querySelector("[data-overlay-editor]")) return;
      // Same for Big Picture mode.
      if (document.querySelector("[data-bigpicture]")) return;

      const sc = customShortcutsRef.current;

      if (matchesShortcut(sc.playPause, e)) {
        e.preventDefault();
        if (audioRef.current) {
          if (audioRef.current.paused) {
            audioRef.current.play();
            setIsPlaying(true);
          } else {
            audioRef.current.pause();
            setIsPlaying(false);
          }
        }
      } else if (matchesShortcut(sc.nextTrack, e)) {
        e.preventDefault();
        const q = queueRef.current;
        setCurrentTrack((t) => {
          if (!t) return t;
          const idx = q.findIndex((x) => x.videoId === t.videoId);
          return idx < q.length - 1 ? q[idx + 1] : t;
        });
      } else if (matchesShortcut(sc.prevTrack, e)) {
        e.preventDefault();
        const q = queueRef.current;
        setCurrentTrack((t) => {
          if (!t) return t;
          const idx = q.findIndex((x) => x.videoId === t.videoId);
          return idx > 0 ? q[idx - 1] : t;
        });
      } else if (matchesShortcut(sc.volUp, e)) {
        e.preventDefault();
        if (audioRef.current) {
          const dv = Math.min(1, Math.sqrt(audioRef.current.volume) + 0.02);
          audioRef.current.volume = dv * dv;
        }
      } else if (matchesShortcut(sc.volDown, e)) {
        e.preventDefault();
        if (audioRef.current) {
          const dv = Math.max(0, Math.sqrt(audioRef.current.volume) - 0.02);
          audioRef.current.volume = dv * dv;
        }
      } else if (matchesShortcut(sc.fullscreen, e)) {
        setFullscreen((f) => {
          const next = !f;
          import("@tauri-apps/api/core").then(({ invoke }) =>
            invoke("set_fullscreen", { fullscreen: next }).catch(() => {})
          );
          if (next) setOverlayOpen(true);
          return next;
        });
      } else if (e.code === "Escape") {
        setOverlayOpen(false);
        setQueueOpen(false);
      } else if (e.code === "F8") {
        e.preventDefault();
        openFeedback();
      } else if (matchesShortcut(sc.mute, e)) {
        e.preventDefault();
        if (audioRef.current) {
          if (audioRef.current.volume > 0) {
            mutePrevVolumeRef.current = audioRef.current.volume;
            audioRef.current.volume = 0;
          } else {
            audioRef.current.volume = mutePrevVolumeRef.current || 0.5;
          }
        }
      } else if (matchesShortcut(sc.lyrics, e)) {
        e.preventDefault();
        if (!currentTrack) return;
        if (overlayOpen) {
          if (splitView) {
            setSplitView(false);
            setShowLyricsManual(true);
          } else setShowLyricsManual((l) => !l);
        } else {
          setOverlayOpen(true);
        }
      } else if (matchesShortcut(sc.seekBack, e)) {
        e.preventDefault();
        if (audioRef.current)
          audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime - 5);
      } else if (matchesShortcut(sc.seekForward, e)) {
        e.preventDefault();
        if (audioRef.current)
          audioRef.current.currentTime = Math.min(
            audioRef.current.duration || 0,
            audioRef.current.currentTime + 5
          );
      } else if (matchesShortcut(sc.zoomIn, e) || (e.ctrlKey && e.code === "NumpadAdd")) {
        e.preventDefault();
        setUiZoom((z) => {
          const idx = ZOOM_STEPS.indexOf(z);
          const next = ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, idx >= 0 ? idx + 1 : 2)];
          return next;
        });
      } else if (matchesShortcut(sc.zoomOut, e) || (e.ctrlKey && e.code === "NumpadSubtract")) {
        e.preventDefault();
        setUiZoom((z) => {
          const idx = ZOOM_STEPS.indexOf(z);
          const next = ZOOM_STEPS[Math.max(0, idx >= 0 ? idx - 1 : 2)];
          return next;
        });
      }
    };
    // capture:true so we intercept before the WebView can handle Ctrl+= etc.
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, [isPlaying, audioRef, overlayOpen, currentTrack, setUiZoom, splitView, openFeedback]); // eslint-disable-line react-hooks/exhaustive-deps
}
