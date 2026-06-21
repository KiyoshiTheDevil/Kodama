import { useState, useEffect, useRef } from "react";

function fmt(secs) {
  if (!secs) return "0:00";
  const m = Math.floor(secs / 60);
  const s = Math.floor(secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

const KIMUCO_URL = "http://127.0.0.1:8888/api/source/kiyoshi";

async function reportToKimuco(payload) {
  try {
    await fetch(KIMUCO_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch { /* kimuco not running — silently ignore */ }
}

export default function Player({ track, isPlaying, onTogglePlay, audioRef }) {
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const progressRef = useRef();

  // Report current state to Kimuco whenever track or playback changes
  useEffect(() => {
    const thumb = track?.thumbnails?.slice(-1)[0]?.url || track?.thumbnail || "";
    reportToKimuco({
      title:     track?.title || "",
      artist:    track?.artists?.[0]?.name || track?.artist || "",
      album:     track?.album?.name || "",
      cover:     thumb,
      progress,
      duration,
      isPlaying,
    });
  }, [track, isPlaying]);

  // Report progress every second while playing
  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => {
      const audio = audioRef.current;
      if (!audio) return;
      const thumb = track?.thumbnails?.slice(-1)[0]?.url || track?.thumbnail || "";
      reportToKimuco({
        title:     track?.title || "",
        artist:    track?.artists?.[0]?.name || track?.artist || "",
        album:     track?.album?.name || "",
        cover:     thumb,
        progress:  audio.currentTime,
        duration:  audio.duration || 0,
        isPlaying: true,
      });
    }, 1000);
    return () => clearInterval(id);
  }, [isPlaying, track]);

  useEffect(() => {
    const audio = audioRef.current;
    const onTime = () => setProgress(audio.currentTime);
    const onDur = () => setDuration(audio.duration);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("loadedmetadata", onDur);
    audio.volume = volume;
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("loadedmetadata", onDur);
    };
  }, []);

  const seek = (e) => {
    const rect = progressRef.current.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    audioRef.current.currentTime = ratio * duration;
  };

  const changeVolume = (e) => {
    const v = parseFloat(e.target.value);
    setVolume(v);
    audioRef.current.volume = v;
  };

  const pct = duration ? (progress / duration) * 100 : 0;

  const thumb = track?.thumbnails?.slice(-1)[0]?.url || track?.thumbnail;

  return (
    <div className="player">
      <div className="player-track">
        {thumb
          ? <img src={thumb} className="player-art" alt="" />
          : <div className="player-art player-art-empty" />
        }
        <div style={{overflow:"hidden"}}>
          <div className="player-title">{track?.title || "—"}</div>
          <div className="player-artist">{track?.artists?.[0]?.name || track?.artist || ""}</div>
        </div>
      </div>

      <div className="player-center">
        <div className="player-controls">
          <button className="ctrl" title="Shuffle">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M0 3.5A.5.5 0 0 1 .5 3H1c2.202 0 3.827 1.24 4.874 2.418.49.552.865 1.102 1.126 1.532.26-.43.636-.98 1.126-1.532C9.173 4.24 10.798 3 13 3v1c-1.798 0-3.173 1.01-4.126 2.082A9.624 9.624 0 0 0 7.556 8a9.624 9.624 0 0 0 1.317 1.918C9.828 10.99 11.204 12 13 12v1c-2.202 0-3.827-1.24-4.874-2.418A10.595 10.595 0 0 1 7 9.05c-.26.43-.636.98-1.126 1.532C4.827 11.76 3.202 13 1 13H.5a.5.5 0 0 1 0-1H1c1.798 0 3.173-1.01 4.126-2.082A9.624 9.624 0 0 0 6.443 8a9.624 9.624 0 0 0-1.317-1.918C4.172 5.01 2.796 4 1 4H.5a.5.5 0 0 1-.5-.5z"/></svg>
          </button>
          <button className="ctrl">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M.5 3.5A.5.5 0 0 0 0 4v8a.5.5 0 0 0 1 0V8.753l6.267 3.636c.54.313 1.233-.066 1.233-.697v-2.94l6.267 3.636c.54.314 1.233-.065 1.233-.696V4.308c0-.63-.693-1.01-1.233-.696L8.5 7.248v-2.94c0-.63-.692-1.01-1.233-.696L1 7.248V4a.5.5 0 0 0-.5-.5z"/></svg>
          </button>
          <button className="ctrl ctrl-play" onClick={onTogglePlay} disabled={!track}>
            {isPlaying
              ? <svg width="14" height="14" viewBox="0 0 16 16" fill="white"><rect x="2.5" y="2" width="3.5" height="12" rx="1"/><rect x="10" y="2" width="3.5" height="12" rx="1"/></svg>
              : <svg width="14" height="14" viewBox="0 0 16 16" fill="white"><polygon points="4,2 14,8 4,14"/></svg>
            }
          </button>
          <button className="ctrl">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M15.5 3.5a.5.5 0 0 1 0 1H1c-.51 0-1.1.001-1.5.5v1.5l7 9a1 1 0 0 0 1.586-.015l7-9V4.5c0-.499-.51-.5-1-.5H.5a.5.5 0 0 1 0-1H15z"/><path d="M15.5 3.5a.5.5 0 0 1 0 1H1c-.51 0-1.1.001-1.5.5-.4.499-.4 1.001 0 1.5l7 9a1 1 0 0 0 1.586-.015l7-9A.5.5 0 0 1 15 7H.5a.5.5 0 0 1 0-1h14.5L9.5 2l1-1 5.5 2.5z" style={{display:"none"}}/></svg>
          </button>
          <button className="ctrl" title="Repeat">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M11 5.466V4H5a5 5 0 0 0-3.584 8.46.5.5 0 1 1-.708.708A6 6 0 0 1 5 3h6V1.534a.25.25 0 0 1 .41-.192l2.36 1.966c.12.1.12.284 0 .384l-2.36 1.966a.25.25 0 0 1-.41-.192zm3.81.086a.5.5 0 0 1 .67.225A6 6 0 0 1 11 13h-1v1.466a.25.25 0 0 1-.41.192l-2.36-1.966a.25.25 0 0 1 0-.384l2.36-1.966a.25.25 0 0 1 .41.192V13h1a5 5 0 0 0 4.315-2.478.5.5 0 0 1 .225.67l-.225-.67z"/></svg>
          </button>
        </div>

        <div className="player-progress">
          <span className="p-time">{fmt(progress)}</span>
          <div className="p-bar" ref={progressRef} onClick={seek}>
            <div className="p-fill" style={{width:`${pct}%`}} />
          </div>
          <span className="p-time">{fmt(duration)}</span>
        </div>
      </div>

      <div className="player-right">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="var(--text-muted)">
          <path d="M11.536 14.01A8.473 8.473 0 0 0 14.026 8a8.473 8.473 0 0 0-2.49-6.01l-.708.707A7.476 7.476 0 0 1 13.025 8c0 2.071-.84 3.946-2.197 5.303l.708.707z"/>
          <path d="M10.121 12.596A6.48 6.48 0 0 0 12.025 8a6.48 6.48 0 0 0-1.904-4.596l-.707.707A5.483 5.483 0 0 1 11.025 8a5.483 5.483 0 0 1-1.61 3.89l.706.706z"/>
          <path d="M8.707 11.182A4.486 4.486 0 0 0 10.025 8a4.486 4.486 0 0 0-1.318-3.182L8 5.525A3.489 3.489 0 0 1 9.025 8 3.49 3.49 0 0 1 8 10.475l.707.707zM6.717 3.55A.5.5 0 0 1 7 4v8a.5.5 0 0 1-.812.39L3.825 10.5H1.5A.5.5 0 0 1 1 10V6a.5.5 0 0 1 .5-.5h2.325l2.363-1.89a.5.5 0 0 1 .529-.06z"/>
        </svg>
        <input type="range" min="0" max="1" step="0.01" value={volume} onChange={changeVolume} className="vol-slider" />
      </div>

      <style>{`
        .player {
          height: 68px; background: var(--bg-surface); border-top: 0.5px solid var(--border);
          display: flex; align-items: center; padding: 0 20px; gap: 16px; flex-shrink: 0;
        }
        .player-track { display: flex; align-items: center; gap: 10px; width: 200px; min-width: 0; }
        .player-art { width: 40px; height: 40px; border-radius: 6px; object-fit: cover; flex-shrink: 0; }
        .player-art-empty { background: var(--bg-elevated); }
        .player-title { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .player-artist { font-size: 11px; color: var(--text-secondary); white-space: nowrap; }
        .player-center { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 6px; }
        .player-controls { display: flex; align-items: center; gap: 14px; }
        .ctrl { background: none; border: none; cursor: default; color: var(--text-secondary); display: flex; align-items: center; padding: 4px; border-radius: 50%; transition: color 0.12s; }
        .ctrl:hover { color: var(--text-primary); }
        .ctrl:disabled { opacity: 0.3; cursor: default; }
        .ctrl-play { width: 34px; height: 34px; border-radius: 50%; background: var(--accent); color: white !important; justify-content: center; }
        .ctrl-play:hover { opacity: 0.85; }
        .player-progress { display: flex; align-items: center; gap: 8px; width: 100%; max-width: 400px; }
        .p-time { font-size: 10px; color: var(--text-muted); min-width: 28px; text-align: center; }
        .p-bar { flex: 1; height: 3px; background: var(--bg-elevated); border-radius: 2px; cursor: default; position: relative; }
        .p-fill { height: 100%; background: var(--accent); border-radius: 2px; transition: width 0.1s linear; }
        .player-right { display: flex; align-items: center; gap: 8px; width: 140px; justify-content: flex-end; }
        .vol-slider { width: 80px; accent-color: var(--accent); height: 3px; }
      `}</style>
    </div>
  );
}
