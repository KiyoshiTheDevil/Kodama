// ListenTogether: keeping this Kodama's player in step with the room.
//
// The host reports; everyone else follows. Positions come from the Rust player a few times a
// second, so between two reports the position is projected forward from when the last one came.
import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTogether, getTogether, hostSet, expectedPos, setDrift, getTune, setLead, setRateShown } from "./together.js";

const SEEK_GAP = 2000;       // ms: at most one correcting seek this often, so a slow stream cannot loop
const SETTLE = 1200;         // ms: a seek is judged this long after it, once the player runs again
const HORIZON = 3;           // s: a drift is meant to be gone in about this long
const DEADBAND = 0.01;       // s: closer than this plays at normal speed

// The player's speed, sent only when it changes. 1.0 whenever this Kodama is not following.
let rateNow = 1;
function setRate(r) {
  const v = Math.round(r * 10000) / 10000;
  if (v === rateNow) return;
  rateNow = v;
  setRateShown(v);
  invoke("audio_set_rate", { rate: v }).catch(() => {});
}

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

  // The last correcting seek, until it has been judged: where it landed teaches the lead.
  const judging = useRef(null);

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      const a = audioRef.current;
      const { isHost, state, lead } = getTogether();
      const tune = getTune();
      if (!a) return;

      if (isHost) {
        setRate(1);
        // Report when what the room believes is off from what the host hears: playback
        // starting after loading, a pause, a seek, a stall while buffering.
        if (!currentTrack) return;
        const running = !a.paused && !a.isPreparing;
        const off = nowPos() - expectedPos(state);
        setDrift(Math.round(off * 1000));
        if (!state || state.track?.videoId !== currentTrack.videoId || state.playing !== running || Math.abs(off) * 1000 > tune.hostReport) {
          hostSet(currentTrack, running, nowPos());
        }
        return;
      }

      // Listener.
      if (!state?.track || state.track.videoId !== currentTrack?.videoId) {
        setRate(1);
        if (state?.track && loaded.current !== state.track.videoId) { loaded.current = state.track.videoId; handlePlay(state.track, [state.track]); }
        return;
      }
      if (a.isPreparing) { setRate(1); return; }
      if (state.playing) {
        if (a.paused) { a.play(); setIsPlaying(true); }
      } else if (!a.paused) { a.pause(); setIsPlaying(false); }
      // A playing room is met a little ahead by a device whose sound comes out late.
      const want = expectedPos(state) + (state.playing ? tune.latency / 1000 : 0);
      const drift = nowPos() - want;
      setDrift(Math.round(drift * 1000));

      const j = judging.current;
      if (j) {
        if (Date.now() - j.at < SETTLE || a.paused || !state.playing) return;
        // Landed `drift` off: aim that much further ahead (or less) next time.
        judging.current = null;
        if (j.playing) setLead(Math.min(2, Math.max(0, lead - drift)));
      }
      if (Math.abs(drift) * 1000 > tune.seekAbove || (!state.playing && Math.abs(drift) > 0.05)) {
        // Far off (joining, the host jumped), or paused somewhere else: a jump.
        setRate(1);
        if (Date.now() - lastSeek.current > SEEK_GAP) {
          lastSeek.current = Date.now();
          judging.current = { at: Date.now(), playing: state.playing };
          a.currentTime = Math.max(0, want + (state.playing ? lead : 0));
        }
        return;
      }
      // Close: catch up by speed. Behind (drift < 0) plays faster.
      const max = tune.maxRate / 1000;
      setRate(!state.playing || Math.abs(drift) < DEADBAND ? 1 : 1 + Math.max(-max, Math.min(max, -drift / HORIZON)));
    }, 500);
    return () => { clearInterval(id); setRate(1); };
  }, [active, currentTrack, audioRef, handlePlay, setIsPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

  return t;
}
