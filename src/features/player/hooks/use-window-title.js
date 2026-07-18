import { useEffect } from "react";

// Keeps the native window/taskbar title in sync with playback (Step 11d). Composed by
// usePlayerController, which owns the track/playing state this reads. When paused for >30s it
// reverts to "Kodama".
export function useWindowTitle(currentTrack, isPlaying) {
  useEffect(() => {
    const setWinTitle = (t) => {
      document.title = t;
      import("@tauri-apps/api/webviewWindow")
        .then(({ getCurrentWebviewWindow }) => getCurrentWebviewWindow().setTitle(t))
        .catch(() => {});
    };

    if (!currentTrack) {
      setWinTitle("Kodama");
      return;
    }

    const trackTitle = `${currentTrack.title} – ${currentTrack.artists}`;

    if (isPlaying) {
      setWinTitle(trackTitle);
    } else {
      // Paused: keep the track title but reset after 30 s of inactivity
      const timer = setTimeout(() => setWinTitle("Kodama"), 30_000);
      return () => clearTimeout(timer);
    }
  }, [currentTrack, isPlaying]);
}
