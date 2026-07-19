// Big Picture — full-screen lyrics. Reuses the desktop's real LyricsOverlay engine (word-sync,
// glow, translations, romaji) 1:1, just with a larger font for lean-back viewing. It reads the
// live playback time straight from the global <audio> element, so it stays in sync without any
// extra bridging; the current track comes from the player bridge.
import { LyricsOverlay } from "@/features/lyrics/LyricsOverlay.jsx";
import { useNowPlaying, getAudio } from "@/features/player/player-bridge.js";

// LyricsOverlay expects a ref whose .current is the playback clock. That's the IpcAudio shim the
// Player registered on the bridge (currentTime/paused + timeupdate events), not a DOM element.
const audioRef = {
  get current() {
    return getAudio();
  },
};

export function Lyrics() {
  const np = useNowPlaying();
  if (!np.track) {
    return (
      <div
        style={{
          minHeight: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "radial-gradient(120% 90% at 50% 0%, #241033, #08080c 55%)",
        }}
      >
        <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 22 }}>
          Kein Titel aktiv · B / Esc zurück
        </div>
      </div>
    );
  }
  return (
    <div
      style={{
        position: "relative",
        minHeight: "100%",
        background: "radial-gradient(120% 90% at 50% 0%, #241033, #08080c 55%)",
      }}
    >
      <LyricsOverlay track={np.track} audioRef={audioRef} fontSize={48} onClose={() => {}} />
    </div>
  );
}
