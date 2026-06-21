import { useState } from "react";

const GENRES = ["Alle", "Podcasts", "Workout", "Relax", "Energize", "Party", "Feel good", "Traurig", "Romantisch", "Focus", "Schlafen"];

export default function GenreBar() {
  const [active, setActive] = useState("Alle");
  return (
    <div className="genre-bar">
      {GENRES.map(g => (
        <button key={g} className={`genre-pill ${active === g ? "genre-active" : ""}`} onClick={() => setActive(g)}>
          {g}
        </button>
      ))}
      <style>{`
        .genre-bar {
          display: flex; gap: 6px; padding: 12px 20px;
          overflow-x: auto; scrollbar-width: none; flex-shrink: 0;
          border-bottom: 0.5px solid var(--border);
        }
        .genre-bar::-webkit-scrollbar { display: none; }
        .genre-pill {
          background: var(--bg-elevated); border: 0.5px solid var(--border);
          border-radius: 20px; padding: 5px 13px; font-size: 12px; color: var(--text-secondary);
          cursor: default; white-space: nowrap; flex-shrink: 0; font-family: inherit;
          transition: all 0.12s;
        }
        .genre-pill:hover { background: var(--bg-hover); color: var(--text-primary); }
        .genre-active { background: var(--accent-dim) !important; border-color: var(--accent) !important; color: var(--accent) !important; }
      `}</style>
    </div>
  );
}
