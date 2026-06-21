import { useState, useEffect } from "react";
import MusicCard from "../components/MusicCard";
import { API } from "../api";

const GRADIENTS = [
  "linear-gradient(135deg,#6020c0,#e040fb)",
  "linear-gradient(135deg,#c02060,#ff4da6)",
  "linear-gradient(135deg,#005580,#00b4d8)",
  "linear-gradient(135deg,#402000,#ff8c00)",
  "linear-gradient(135deg,#1a4020,#4caf50)",
];

export default function HomeView({ onPlay, onOpenPlaylist, onOpenAlbum, onOpenArtist }) {
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    API.getHome()
      .then(setSections)
      .catch(() => setSections([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{color:"var(--text-muted)",paddingTop:40,textAlign:"center"}}>Lädt...</div>;

  if (!sections.length) return <div style={{color:"var(--text-muted)",paddingTop:40,textAlign:"center"}}>Keine Inhalte gefunden.</div>;

  return (
    <div>
      {sections.map((section, si) => (
        <div key={si} className="section-block">
          <div className="section-title">{section.title}</div>
          <div className="cards-row">
            {section.contents?.map((item, i) => {
              const thumb = item.thumbnails?.slice(-1)[0]?.url;
              const sub = item.artists?.[0]?.name || item.subtitle || item.description || "";

              const isSong     = !!item.videoId;
              const isPlaylist = !!item.playlistId;
              const isArtist   = !!item.browseId && !item.videoId && !item.playlistId && !item.artists?.length;
              const isAlbum    = !!item.browseId && !item.videoId && !item.playlistId && !isArtist;

              const handleClick = () => {
                if (isSong)     onPlay(item);
                else if (isPlaylist) onOpenPlaylist?.(item);
                else if (isAlbum)    onOpenAlbum?.(item);
                else if (isArtist)   onOpenArtist?.(item);
              };

              return (
                <MusicCard
                  key={i}
                  title={item.title}
                  subtitle={sub}
                  thumbnail={thumb}
                  gradient={!thumb ? GRADIENTS[(si * 5 + i) % GRADIENTS.length] : null}
                  onPlay={handleClick}
                  showPlayOverlay={!isArtist}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
