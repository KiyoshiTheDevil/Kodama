export default function MusicCard({ title, subtitle, thumbnail, gradient, onPlay, showPlayOverlay = true }) {
  return (
    <div className="card" onClick={onPlay}>
      <div className="card-thumb" style={gradient ? {background: gradient} : {}}>
        {thumbnail && <img src={thumbnail} alt={title} />}
        {!thumbnail && <div style={{width:"100%",height:"100%"}} />}
        {showPlayOverlay && (
          <div className="play-overlay">
            <button className="play-overlay-btn">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="white">
                <polygon points="3,1 12,7 3,13"/>
              </svg>
            </button>
          </div>
        )}
      </div>
      <div className="card-title">{title}</div>
      {subtitle && <div className="card-sub">{subtitle}</div>}
    </div>
  );
}
