// Video-sync mode: shows the official-video release, muted, while its OWN audio track plays
// through the normal Rust pipeline in place of the song's (App.jsx swaps the source on the
// audio/video switch) — so volume, visualizer, Discord RPC etc. all stay on the one audio path
// that already exists, nothing plays through the WebView's own audio output. The backend
// resolves the counterpart video and computes a fixed offset via audio cross-correlation
// (python-backend/server.py's /video-sync/* routes); App.jsx applies that offset ONCE, as the
// seek target for the swap, so playback lands on the corresponding moment in the other version.
// This module just fetches that data once per track and keeps the <video> element's own position
// corrected against ordinary clock drift against whatever audio is currently loaded.
import { useEffect, useRef, useState } from "react";
import { API } from "./context.jsx";

// Real-world calibration (2026-07-18): a confirmed correct match ("Nachos") scored 10.5, a
// second plausible one scored 5.2 — but a confidence of 3.38 turned out to be a false positive
// (matched a completely unrelated video). 3 was far too permissive; 7 sits with real margin
// above the observed false positive while still under the strongest confirmed match.
const CONFIDENCE_THRESHOLD = 7; // below this the computed offset is untrustworthy — skip video mode
const DRIFT_CORRECTION_S = 0.35; // only re-seek the video once it has drifted this far from target

// maxHeight: null/0 = best available; otherwise caps resolution (e.g. for a weak/metered connection).
export function useVideoSync(videoId, enabled, maxHeight) {
  const [state, setState] = useState({ videoUrl: null, offsetSeconds: 0, counterpartVideoId: null, ready: false });

  useEffect(() => {
    setState({ videoUrl: null, offsetSeconds: 0, counterpartVideoId: null, ready: false });
    if (!enabled || !videoId) return;
    let cancelled = false;
    fetch(`${API}/video-sync/offset/${videoId}`)
      .then(r => r.json())
      .then(d => {
        if (cancelled || !d.available || !d.counterpartVideoId || !(d.confidence >= CONFIDENCE_THRESHOLD)) return;
        const q = maxHeight ? `?maxHeight=${maxHeight}` : "";
        return fetch(`${API}/video-sync/stream/${d.counterpartVideoId}${q}`)
          .then(r => r.json())
          .then(sd => {
            if (cancelled || !sd.url) return;
            setState({ videoUrl: sd.url, offsetSeconds: d.offsetSeconds, counterpartVideoId: d.counterpartVideoId, ready: true });
          });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [videoId, enabled, maxHeight]);

  return state;
}

export function VideoSyncVideo({ src, offsetSeconds, audioRef, isPlaying, style }) {
  const videoRef = useRef(null);
  // Snapshot the audio clock the same way the lyrics rAF loop does (App.jsx), so the correction
  // loop below can interpolate the current audio position at 60fps between IpcAudio's own events.
  const snapRef = useRef({ ct: 0, pt: 0, playing: false });

  useEffect(() => {
    const audio = audioRef?.current;
    if (!audio) return;
    const snap = () => { snapRef.current = { ct: audio.currentTime, pt: performance.now(), playing: !audio.paused }; };
    audio.addEventListener("timeupdate", snap);
    audio.addEventListener("play", snap);
    audio.addEventListener("pause", snap);
    audio.addEventListener("seeked", snap);
    snap();
    return () => {
      audio.removeEventListener("timeupdate", snap);
      audio.removeEventListener("play", snap);
      audio.removeEventListener("pause", snap);
      audio.removeEventListener("seeked", snap);
    };
  }, [audioRef]);

  // Correct the video's position against the interpolated audio clock; only re-seek past the
  // drift threshold so ordinary playback doesn't stutter from constant sub-frame seeks.
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const v = videoRef.current;
      if (v && v.duration) {
        const { ct, pt, playing } = snapRef.current;
        const audioT = playing ? ct + (performance.now() - pt) / 1000 : ct;
        const target = Math.max(0, Math.min(v.duration, audioT + offsetSeconds));
        if (Math.abs(v.currentTime - target) > DRIFT_CORRECTION_S) v.currentTime = target;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [offsetSeconds]);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isPlaying) v.play().catch(() => {});
    else v.pause();
  }, [isPlaying, src]);

  return (
    <video
      ref={videoRef}
      src={src}
      muted
      playsInline
      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", ...style }}
    />
  );
}

// Dedicated video pane — parallel to CoverView / LyricsOverlay, not squeezed into the small
// cover-art box (a muted video that size would be pointless). Fills the full width of this pane
// (not the whole app window — this only ever occupies the cover-pane's share of the layout,
// same as CoverView/LyricsOverlay). No title/artist overlay — that's already shown by the rest
// of the player chrome and would just clutter the picture. Only ever mounted once a synced video
// is actually ready (gated by the audio/video switch in the player bar), so it doesn't need its
// own loading/unavailable state.
export function VideoSyncView({ videoSync, audioRef, isPlaying, fullscreen = false }) {
  return (
    <div style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", background: "#000", borderRadius: fullscreen ? 0 : 16 }}>
      {videoSync.ready && (
        // offsetSeconds is 0 here, not videoSync.offsetSeconds — App.jsx's audio-switching effect
        // already applies that offset ONCE, as the seek target when swapping the Rust audio source
        // over to this same counterpart video's own audio track. From that point on, video and
        // audio share one timeline (same source), so the only remaining drift to correct for is
        // ordinary clock drift between the two independent decoders, not a content offset.
        <VideoSyncVideo src={videoSync.videoUrl} offsetSeconds={0} audioRef={audioRef} isPlaying={isPlaying} style={{ objectFit: "contain" }} />
      )}
    </div>
  );
}
