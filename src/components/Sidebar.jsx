import { useState, useEffect } from "react";
import { API } from "../api";

const NavItem = ({ icon, label, active, onClick }) => (
  <div className={`nav-item ${active ? "nav-active" : ""}`} onClick={onClick}>
    {icon}
    <span>{label}</span>
  </div>
);

export default function Sidebar({ view, setView }) {
  const [playlists, setPlaylists] = useState([]);

  useEffect(() => {
    API.getPlaylists().then(setPlaylists).catch(() => {});
  }, []);

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
          <circle cx="16" cy="16" r="16" fill="url(#lg)"/>
          <polygon points="12,9 24,16 12,23" fill="white"/>
          <defs>
            <linearGradient id="lg" x1="0" y1="0" x2="32" y2="32">
              <stop stopColor="#e040fb"/><stop offset="1" stopColor="#ff4da6"/>
            </linearGradient>
          </defs>
        </svg>
        <span>Music</span>
      </div>

      <div className="sidebar-search">
        <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor">
          <path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/>
        </svg>
        Suchen
      </div>

      <nav className="sidebar-nav">
        <NavItem
          icon={<svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><path d="M8 3.293l6 6V13.5a.5.5 0 0 1-.5.5h-4v-3H6.5v3h-4a.5.5 0 0 1-.5-.5V9.293l6-6zm5-.793L9.5 6.5V2H8.5L8 1.5 2 7.5V14a1 1 0 0 0 1 1h3.5v-3h3v3H13a1 1 0 0 0 1-1V7.5L8 1.5z"/></svg>}
          label="Home" active={view === "home"} onClick={() => setView("home")}
        />
        <NavItem
          icon={<svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><path d="M1 2.828c.885-.37 2.154-.769 3.388-.893 1.33-.134 2.458.063 3.112.752v9.746c-.935-.53-2.12-.603-3.213-.493-1.18.12-2.37.461-3.287.811V2.828zm7.5-.141c.654-.689 1.782-.886 3.112-.752 1.234.124 2.503.523 3.388.893v9.923c-.918-.35-2.107-.692-3.287-.81-1.094-.111-2.278-.039-3.213.492V2.687zM8 1.783C7.015.936 5.587.81 4.287.94c-1.514.153-3.042.672-3.994 1.105A.5.5 0 0 0 0 2.5v11a.5.5 0 0 0 .707.455c.882-.4 2.303-.881 3.68-1.02 1.409-.142 2.59.087 3.223.877a.5.5 0 0 0 .78 0c.633-.79 1.814-1.019 3.222-.877 1.378.139 2.8.62 3.681 1.02A.5.5 0 0 0 16 13.5v-11a.5.5 0 0 0-.293-.455c-.952-.433-2.48-.952-3.994-1.105C10.413.809 8.985.936 8 1.783z"/></svg>}
          label="Bibliothek" active={view === "library"} onClick={() => setView("library")}
        />
        <NavItem
          icon={<svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor"><path d="M8 1.314C12.438-3.248 23.534 4.735 8 15-7.534 4.736 3.562-3.248 8 1.314z"/></svg>}
          label="Liked Songs" active={view === "liked"} onClick={() => setView("liked")}
        />
      </nav>

      {playlists.length > 0 && (
        <>
          <div className="sidebar-section-label">Playlists</div>
          <div className="sidebar-playlists">
            {playlists.map(p => (
              <div key={p.playlistId} className="sidebar-playlist-item" onClick={() => setView(`playlist:${p.playlistId}`)}>
                <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" style={{opacity:0.5,flexShrink:0}}>
                  <path d="M9.828 3h3.982a2 2 0 0 1 1.992 2.181l-.637 7A2 2 0 0 1 13.174 14H2.825a2 2 0 0 1-1.991-1.819l-.637-7a1.99 1.99 0 0 1 .342-1.31L.5 3a2 2 0 0 1 2-2h3.672a2 2 0 0 1 1.414.586l.828.828A2 2 0 0 0 9.828 3z"/>
                </svg>
                <span>{p.title}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="sidebar-user">
        <div className="sidebar-avatar">K</div>
        <div>
          <div style={{fontSize:12,fontWeight:500}}>Kiyoshi</div>
          <div style={{fontSize:10,color:"var(--text-muted)"}}>@kiyoshi_the_devil</div>
        </div>
      </div>

      <style>{`
        .sidebar {
          width: 220px; background: var(--bg-surface); display: flex; flex-direction: column;
          padding: 16px 0; border-right: 0.5px solid var(--border); flex-shrink: 0;
        }
        .sidebar-logo {
          display: flex; align-items: center; gap: 9px; padding: 0 16px 18px;
          font-size: 16px; font-weight: 600; color: var(--text-primary);
        }
        .sidebar-search {
          margin: 0 12px 14px; background: var(--bg-elevated); border: 0.5px solid var(--border);
          border-radius: 20px; padding: 7px 12px; display: flex; align-items: center; gap: 8px;
          color: var(--text-muted); font-size: 12px; cursor: default;
        }
        .sidebar-nav { padding: 0 8px; }
        .nav-item {
          display: flex; align-items: center; gap: 10px; padding: 7px 10px;
          border-radius: var(--radius); cursor: default; color: var(--text-secondary);
          font-size: 13px; transition: all 0.12s;
        }
        .nav-item:hover { background: var(--bg-elevated); color: var(--text-primary); }
        .nav-active { background: var(--accent-dim) !important; color: var(--accent) !important; }
        .sidebar-section-label {
          font-size: 10px; color: var(--text-muted); text-transform: uppercase;
          letter-spacing: 0.08em; padding: 12px 18px 4px; margin-top: 4px;
        }
        .sidebar-playlists { padding: 0 8px; flex: 1; overflow-y: auto; }
        .sidebar-playlist-item {
          display: flex; align-items: center; gap: 8px; padding: 6px 10px;
          border-radius: var(--radius); cursor: default; color: var(--text-secondary);
          font-size: 12px; transition: all 0.12s; white-space: nowrap; overflow: hidden;
        }
        .sidebar-playlist-item span { overflow: hidden; text-overflow: ellipsis; }
        .sidebar-playlist-item:hover { background: var(--bg-elevated); color: var(--text-primary); }
        .sidebar-user {
          margin-top: auto; padding: 12px 16px 0; border-top: 0.5px solid var(--border);
          display: flex; align-items: center; gap: 9px;
        }
        .sidebar-avatar {
          width: 28px; height: 28px; border-radius: 50%; background: var(--accent);
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 600; color: white; flex-shrink: 0;
        }
      `}</style>
    </aside>
  );
}
