import { useState, useEffect } from "react";
import TrackRow from "../components/TrackRow";
import { API } from "../api";

export default function LikedSongsView({ onPlay }) {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    API.getLikedSongs()
      .then(data => setTracks(data.tracks || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:24}}>
        <div style={{width:56,height:56,borderRadius:10,background:"linear-gradient(135deg,#e040fb,#ff4da6)",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <svg width="24" height="24" viewBox="0 0 16 16" fill="white"><path d="M8 1.314C12.438-3.248 23.534 4.735 8 15-7.534 4.736 3.562-3.248 8 1.314z"/></svg>
        </div>
        <div>
          <div className="section-title" style={{margin:0}}>Liked Songs</div>
          <div style={{fontSize:12,color:"var(--text-secondary)",marginTop:2}}>{tracks.length} Tracks</div>
        </div>
      </div>

      {loading && <div style={{color:"var(--text-muted)"}}>Lädt...</div>}

      {!loading && !tracks.length && (
        <div style={{color:"var(--text-muted)"}}>Keine Liked Songs gefunden.</div>
      )}

      {!loading && tracks.length > 0 && (
        <div className="track-list">
          {tracks.map((t, i) => <TrackRow key={t.videoId || i} track={t} index={i} onPlay={onPlay} />)}
        </div>
      )}
    </div>
  );
}
