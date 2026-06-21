function fmt(secs) {
  if (!secs) return "";
  return `${Math.floor(secs/60)}:${Math.floor(secs%60).toString().padStart(2,"0")}`;
}

export default function TrackRow({ track, index, onPlay }) {
  const thumb = track.thumbnails?.slice(-1)[0]?.url;
  const artist = track.artists?.[0]?.name || track.artist || "";
  const dur = track.duration_seconds || track.duration;

  return (
    <div className="track-row" onDoubleClick={() => onPlay(track)}>
      <div className="track-num">
        <span className="track-idx">{index + 1}</span>
        <button className="ctrl track-play" onClick={() => onPlay(track)} style={{background:"none",border:"none",cursor:"default",color:"var(--text-primary)",padding:0}}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor"><polygon points="2,1 11,6 2,11"/></svg>
        </button>
      </div>
      {thumb
        ? <img src={thumb} className="track-thumb" alt="" />
        : <div className="track-thumb" style={{background:"var(--bg-elevated)"}} />
      }
      <div className="track-info">
        <div className="track-name" style={{ display: "flex", alignItems: "center", gap: 4 }}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", minWidth: 0 }}>{track.title}</span>
          {track.isExplicit && (
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", background: "var(--text-muted)", color: "var(--bg-primary)", borderRadius: 3, fontSize: 9, fontWeight: 700, padding: "1px 4px", letterSpacing: "0.05em", flexShrink: 0, lineHeight: 1.2, userSelect: "none" }}>E</span>
          )}
        </div>
        {artist && <div className="track-artist">{artist}</div>}
      </div>
      {dur && <div className="track-duration">{typeof dur === "number" ? fmt(dur) : dur}</div>}
      <style>{`
        .track-idx { display: block; }
        .track-play { display: none; }
        .track-row:hover .track-idx { display: none; }
        .track-row:hover .track-play { display: block; }
      `}</style>
    </div>
  );
}
