// ListenTogether: keeping this Kodama's player in step with the room.
//
// The host reports; everyone else follows. Positions come from the Rust player a few times a
// second, so between two reports the position is projected forward from when the last one came.
import { useEffect, useRef } from "react";
import { useTogether, getTogether, hostSet, expectedPos, setDrift } from "./together.js";

const TOLERANCE = 0.4;       // s: closer than this is left alone, a seek would be audible for less
const SEEK_GAP = 2500;       // ms: at most one correcting seek this often, so a slow stream cannot loop
const SEEK_LEAD = 0.08;      // s: a seek lands a little late; aim slightly ahead
const HOST_REPORT = 0.5;     // s: the host reports again when it is this far off what it last said

export function useTogetherSync({ audioRef, currentTrack, setIsPlaying, handlePlay }) {
  const t = useTogether();
  const active = t.status === "open" || t.status === "reconnecting";
  const lastTU = useRef({ pos: 0, at: 0 });
  const lastSeek = useRef(0);
  const loaded = useRef(null);

  // The player's position now, projected from its last report.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTU = () => { lastTU.current = { pos: a.currentTime, at: performance.now() }; };
    a.addEventListener?.("timeupdate", onTU);
    return () => a.removeEventListener?.("timeupdate", onTU);
  }, [audioRef]);
  const nowPos = () => {
    const a = audioRef.current;
    if (!a) return 0;
    const { pos, at } = lastTU.current;
    return a.paused || !at ? a.currentTime : pos + (performance.now() - at) / 1000;
  };

  // Host: a new song is announced paused at 0 at once, so everyone starts loading it; once the
  // host's own audio runs, the drift check below announces the real position.
  useEffect(() => {
    if (!active || !t.isHost) return;
    hostSet(currentTrack || null, false, 0);
  }, [active, t.isHost, currentTrack?.videoId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      const a = audioRef.current;
      const { isHost, state } = getTogether();
      if (!a) return;

      if (isHost) {
        // Report when what the room believes is off from what the host hears: playback
        // starting after loading, a pause, a seek, a stall while buffering.
        if (!currentTrack) return;
        const running = !a.paused && !a.isPreparing;
        const off = Math.abs(expectedPos(state) - nowPos());
        if (!state || state.track?.videoId !== currentTrack.videoId || state.playing !== running || off > HOST_REPORT) {
          hostSet(currentTrack, running, nowPos());
        }
        return;
      }

      // Listener.
      if (!state?.track) return;
      if (state.track.videoId !== currentTrack?.videoId) {
        if (loaded.current !== state.track.videoId) { loaded.current = state.track.videoId; handlePlay(state.track, [state.track]); }
        return;
      }
      if (a.isPreparing) return;
      const want = expectedPos(state);
      if (state.playing) {
        if (a.paused) { a.play(); setIsPlaying(true); }
      } else if (!a.paused) { a.pause(); setIsPlaying(false); }
      const drift = nowPos() - want;
      setDrift(Math.round(drift * 1000));
      if (Math.abs(drift) > TOLERANCE && Date.now() - lastSeek.current > SEEK_GAP) {
        lastSeek.current = Date.now();
        a.currentTime = Math.max(0, want + (state.playing ? SEEK_LEAD : 0));
      }
    }, 500);
    return () => clearInterval(id);
  }, [active, currentTrack, audioRef, handlePlay, setIsPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  return t;
}
