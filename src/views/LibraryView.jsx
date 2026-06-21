import { useState, useEffect } from "react";
import MusicCard from "../components/MusicCard";
import TrackRow from "../components/TrackRow";
import { API } from "../api";

const GRADIENTS = [
  "linear-gradient(135deg,#6020c0,#e040fb)",
  "linear-gradient(135deg,#c02060,#ff4da6)",
  "linear-gradient(135deg,#005580,#00b4d8)",
  "linear-gradient(135deg,#402000,#ff8c00)",
  "linear-gradient(135deg,#1a4020,#4caf50)",
  "linear-gradient(135deg,#301040,#9c27b0)",
];

export default function LibraryView({ onPlay }) {
  const [playlists, setPlaylists] = useState([]);
  const [openPlaylist, setOpenPlaylist] = useState(null);
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    API.getPlaylists().then(setPlaylists).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const openPL = async (pl) => {
    setOpenPlaylist(pl);
    setTracks([]);
    const data = await API.getPlaylist(pl.playlistId);
    setTracks(data.tracks || []);
  };

  if (loading) return <div style={{color:"var(--text-muted)",paddingTop:40,textAlign:"center"}}>Lädt...</div>;

  if (openPlaylist) {
    return (
      <div>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24}}>
          <button onClick={() => setOpenPlaylist(null)} style={{background:"none",border:"none",cursor:"default",color:"var(--text-secondary)",display:"flex",alignItems:"center",gap:6,fontSize:13,padding:0}}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"><path d="M15 8a.5.5 0 0 0-.5-.5H2.707l3.147-3.146a.5.5 0 1 0-.708-.708l-4 4a.5.5 0 0 0 0 .708l4 4a.5.5 0 0 0 .708-.708L2.707 8.5H14.5A.5.5 0 0 0 15 8z"/></svg>
            Zurück
          </button>
          <div className="section-title" style={{margin:0}}>{openPlaylist.title}</div>
        </div>
        {!tracks.length
          ? <div style={{color:"var(--text-muted)"}}>Lädt Tracks...</div>
          : <div className="track-list">
              {tracks.map((t, i) => <TrackRow key={t.videoId || i} track={t} index={i} onPlay={onPlay} />)}
            </div>
        }
      </div>
    );
  }

  return (
    <div>
      <div className="section-title">Bibliothek</div>
      <div className="cards-row" style={{flexWrap:"wrap", overflow:"visible"}}>
        {playlists.map((pl, i) => {
          const thumb = pl.thumbnails?.slice(-1)[0]?.url;
          return (
            <MusicCard
              key={pl.playlistId}
              title={pl.title}
              subtitle={`${pl.count || ""} Tracks`}
              thumbnail={thumb}
              gradient={!thumb ? GRADIENTS[i % GRADIENTS.length] : null}
              onPlay={() => openPL(pl)}
            />
          );
        })}
      </div>
    </div>
  );
}
