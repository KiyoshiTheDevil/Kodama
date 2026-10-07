// ListenTogether: keeping this Kodama's player in step with the room.
//
// The host reports; everyone else follows. Positions come from the Rust player a few times a
// second, so between two reports the position is projected forward from when the last one came.
//
// Getting somewhere and starting there are kept apart. Getting to a position (loading a song,
// seeking) is slow and takes as long as it takes: the player decodes, buffers, waits on the
// network. Starting is a switch, and the player can flip it at a set moment to the millisecond
// (audio_resume_at). So a listener who is far off pauses, seeks to where the room will be a
// little later, waits until the player says it is ready there, and starts exactly when the room
// arrives. Small differences after that are caught up by playing a few per mille faster or
// slower, which nobody hears; jumps, which everybody hears, are left for large ones.
import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { API } from "../context.jsx";
import { useTogetherValue, getTogether, hostSet, hostQueue, sendReady, expectedPos, serverNow, setDrift, getTune, setSync } from "./together.js";

const TICK = 100;            // ms
const RATE_EVERY = 500;      // ms: the speed is adjusted this often
const HORIZON = 10;          // s: a drift is meant to be gone in about this long. Shorter asks for
                             // audible speeds (3 s turned 24 ms into 8 per mille) for errors nobody hears
const SMOOTH = 0.3;          // the measured drift wobbles by about 10 ms; the speed follows its average
const DEADBAND = 0.01;       // s: closer than this plays at normal speed
const BASE_WINDOW = 10000;   // ms: the device's own speed error is measured over this long
const BASE_MAX = 0.01;
const HOST_WINDOW = 20000;   // ms: the host measures its own speed over this long
const HOST_RATE_REPORT = 0.001; // the host reports again when its measured speed moved this much
const START_DELAY = 1500;    // ms: a new song starts this long after the host has it, for everyone
const WAIT_ALL_MAX = 8000;   // ms: "wait for everyone" waits at most this long for the slowest
const PREPARE_TIMEOUT = 10000;
const LOAD_TIMEOUT = 20000;
const SETTLED = 300;         // ms after a start before the drift is trusted again

// The player's speed, sent only when it changes. 1.0 whenever this Kodama is not following.
let rateNow = 1;
// What this device needs to play at to keep time at all: a sound card (a virtual machine's
// especially) can run a few per mille slow or fast. Measured while following, kept for the
// session; the catch-up limit applies on top of it, since this part changes no pitch that
// anyone hears - it only undoes the device's own error.
//
// Measured, not integrated from the corrections: how fast the drift changed, minus how much
// of that the speed asked for, is what the device did on its own. An integrator would also
// learn every catch-up and overshoot.
let baseRate = 0;
let history = [];            // { at, drift, asked }: `asked` sums (speed - 1) over time, in s
let asked = 0, lastRateTick = 0, smoothed = null;
function resetHistory() { history = []; lastRateTick = 0; smoothed = null; }
let roomKey = "";            // the room state the history was measured against

// Host: its own speed against the room's clock, measured from its position over time.
let hostHist = [];           // { srv, pos }
let hostRate = 1;
function setRate(r) {
  const v = Math.round(r * 10000) / 10000;
  if (v === rateNow) return;
  rateNow = v;
  setSync({ rate: v, base: baseRate });
  invoke("audio_set_rate", { rate: v }).catch(() => {});
}

// How far ahead of the room a listener prepares, in s: a little more than the last preparation
// took, so it is ready in time without standing silent for long.
let ahead = 1.5;

// Where the room stands at server time `T` (ms), plus this device's audio delay.
function roomPosAt(st, T, latency) {
  return st.pos + (st.playing ? (st.rate || 1) * Math.max(0, T - st.at) / 1000 : 0) + latency;
}

const WARM_AHEAD = 2;        // songs of the room's queue each listener gets ready ahead of time

export function useTogetherSync({ audioRef, currentTrack, setIsPlaying, handlePlay, queue }) {
  // Only what this hook acts on; everything else is read with getTogether() inside the tick.
  const active = useTogetherValue((x) => x.status === "open" || x.status === "reconnecting");
  const isHost = useTogetherValue((x) => x.isHost);
  const warmKey = useTogetherValue((x) => (active && !x.isHost ? x.queue.slice(0, WARM_AHEAD).map((q) => q.videoId).join(",") : ""));
  const t = { isHost };
  const lastTU = useRef({ pos: 0, at: 0 });
  const noteRef = useRef(null);
  const lastRoom = useRef(null);
  const loaded = useRef(null);
  // The sync's own state, in a ref: the tick runs ten times a second and must not re-render.
  //   phase: "idle" | "loading" | "preparing" | "waiting" | "following" | "paused"
  const sync = useRef({ phase: "idle" });
  // Set before a song loads: the moment the player has it ready, it is paused, before more
  // than a few milliseconds of it are heard at the wrong time.
  const holdNextReady = useRef(false);
  const readies = useRef(0);
  const host = useRef({ videoId: null, startLocal: 0 });

  const note = (text) => {
    const line = `${new Date().toTimeString().slice(0, 8)} ${text}`;
    setSync({ log: [line, ...(getTogether().sync.log || [])].slice(0, 300) });
  };
  noteRef.current = note;
  const phase = (p, extra = {}, why = "") => {
    sync.current = { ...sync.current, ...extra, phase: p };
    const d = getTogether().drift;
    setSync({ phase: p, ahead: Math.round(ahead * 100) / 100 });
    note(`${p}${why ? ` (${why})` : ""}${d != null ? ` drift ${d}` : ""}`);
  };

  // The player's position now, projected from its last report.
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    const onTU = () => {
      // Rust's reading time when it has one: event delivery (late when the page is busy) then
      // no longer counts as the player standing.
      const prev = lastTU.current, now = a.positionAt || Date.now(), pos = a.currentTime;
      // While following: the song should move as fast as time does. Less is the player standing
      // (waiting for data), more is a jump. Both are logged, they are what a re-sync follows.
      if (sync.current.phase === "following" && prev.at && !a.paused) {
        const lag = (now - prev.at) / 1000 - (pos - prev.pos);
        if (lag > 0.12) noteRef.current?.(`stall ${Math.round(lag * 1000)} ms`);
        else if (lag < -0.12) noteRef.current?.(`player jumped +${Math.round(-lag * 1000)} ms`);
      }
      lastTU.current = { pos, at: now };
    };
    a.addEventListener?.("timeupdate", onTU);
    return () => a.removeEventListener?.("timeupdate", onTU);
  }, [audioRef]);
  const nowPos = () => {
    const a = audioRef.current;
    if (!a) return 0;
    if (a.paused) return a.currentTime;
    // From the player's own reading time, at the speed it plays at now.
    const at = a.positionAt;
    if (at) return a.currentTime + rateNow * (Date.now() - at) / 1000;
    const { pos, at: tu } = lastTU.current;
    return !tu ? a.currentTime : pos + (Date.now() - tu) / 1000;
  };

  // The player's word that a new source stands ready (after a load or a seek), and how late
  // the last set start came.
  useEffect(() => {
    if (!active) return;
    const offs = [];
    listen("audio-ready", () => {
      readies.current += 1;
      if (holdNextReady.current) {
        holdNextReady.current = false;
        audioRef.current?.pause();
        host.current.heldAt = Date.now();
      }
    }).then((u) => offs.push(u));
    listen("audio-resumed-at", ({ payload }) => setSync({ late: Math.round(payload?.lateMs ?? 0) })).then((u) => offs.push(u));
    return () => offs.forEach((u) => u());
  }, [active, audioRef]);

  // Host: a new song is announced paused at 0 at once, so everyone starts loading it. Once the
  // host has it too, a start a moment later is announced, for everyone including the host.
  useEffect(() => {
    if (!active || !t.isHost) return;
    hostSet(currentTrack || null, false, 0);
    host.current = { videoId: currentTrack?.videoId || null, startLocal: 0, scheduled: false };
    if (currentTrack) holdNextReady.current = true;
  }, [active, t.isHost, currentTrack?.videoId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Host: what plays after this song, from the host's own queue.
  useEffect(() => {
    if (!active || !t.isHost) return;
    const q = queue || [];
    const i = currentTrack ? q.findIndex((x) => x.videoId === currentTrack.videoId) : -1;
    hostQueue(i >= 0 ? q.slice(i + 1, i + 21) : []);
  }, [active, t.isHost, currentTrack?.videoId, queue]); // eslint-disable-line react-hooks/exhaustive-deps

  // Listener: get the next songs ready, as Kodama does for its own queue. Resolving a song's
  // stream address is most of a load (2-4 s); done ahead, a song change starts in moments.
  useEffect(() => {
    if (!warmKey) return;
    let cancelled = false;
    (async () => {
      for (const id of warmKey.split(",")) {
        if (cancelled) return;
        try { await fetch(`${API}/audio-stream/${id}/warm`); } catch { /* it loads the slow way then */ }
      }
    })();
    return () => { cancelled = true; };
  }, [warmKey]);

  useEffect(() => {
    if (!active) return;
    let lastRate = 0;
    const id = setInterval(() => {
      const a = audioRef.current;
      const { isHost, state, offset } = getTogether();
      const tune = getTune();
      const latency = tune.latency / 1000;
      if (!a) return;

      if (isHost) {
        setRate(1);
        if (!currentTrack) return;
        const h = host.current;
        // Held for a song that turned out to be running already (the room was opened mid-song,
        // or a crossfade brought it in): nothing to hold, it is reported as it plays.
        if (holdNextReady.current && !a.paused && !a.isPreparing) holdNextReady.current = false;
        // The song is loaded and held: start it for everyone a moment from now.
        if (h.videoId === currentTrack.videoId && !h.scheduled && !a.isPreparing && a.paused && !holdNextReady.current) {
          // Wait for everyone: until each listener has the song loaded, or the slowest has had
          // long enough. Someone whose line or computer is slow should not hold the room forever.
          const { config, members } = getTogether();
          const waiting = config.waitAll && members.some((m) => !m.host && m.ready !== currentTrack.videoId);
          if (waiting && Date.now() - (h.heldAt || 0) < WAIT_ALL_MAX) return;
          const startAt = serverNow() + START_DELAY;
          h.scheduled = true;
          h.startLocal = startAt - offset;
          hostSet(currentTrack, true, a.currentTime, startAt, hostRate);
          hostHist = [];
          invoke("audio_resume_at", { atMs: h.startLocal }).catch(() => {});
          setIsPlaying(true);
          return;
        }
        // Until the start has happened and settled, the host is where it said it would be.
        if (h.scheduled && Date.now() < h.startLocal + SETTLED) return;
        // Report when what the room believes is off from what the host hears: a pause, a seek,
        // a stall while buffering.
        const running = !a.paused && !a.isPreparing;
        const pos = nowPos();
        // The host's own speed: how far its song moved against how far the room's clock did.
        // A seek, a pause or a stall breaks the line, and the measuring starts over.
        if (running) {
          const srv = serverNow();
          const last = hostHist[hostHist.length - 1];
          if (last && Math.abs((pos - last.pos) - (srv - last.srv) / 1000) > 0.25) hostHist = [];
          hostHist.push({ srv, pos });
          while (hostHist.length > 2 && srv - hostHist[1].srv >= HOST_WINDOW) hostHist.shift();
          const o = hostHist[0];
          if (srv - o.srv >= HOST_WINDOW * 0.5) {
            const r = (pos - o.pos) / ((srv - o.srv) / 1000);
            hostRate = Math.min(1.02, Math.max(0.98, hostRate + (r - hostRate) * 0.02));
          }
        } else hostHist = [];
        const off = pos - expectedPos(state);
        setDrift(Math.round(off * 1000));
        if (!state || state.track?.videoId !== currentTrack.videoId || state.playing !== running || Math.abs(off) * 1000 > tune.hostReport
          || (running && Math.abs(hostRate - (state.rate || 1)) > HOST_RATE_REPORT)) {
          hostSet(currentTrack, running, pos, undefined, hostRate);
        }
        return;
      }

      // ── Listener ──
      const s = sync.current;
      const prevRoom = lastRoom.current;
      if (state && prevRoom !== state) {
        if (prevRoom?.track && state.track?.videoId === prevRoom.track.videoId && prevRoom.playing && state.playing) {
          const T = serverNow();
          const jump = roomPosAt(state, T, 0) - roomPosAt(prevRoom, T, 0);
          if (Math.abs(jump) > 0.03) note(`room jumped ${jump > 0 ? "+" : ""}${Math.round(jump * 1000)} ms (host speed ${(((state.rate || 1) - 1) * 1000).toFixed(1)} ‰)`);
        }
        lastRoom.current = state;
      }
      if (!state?.track) { setRate(1); if (s.phase !== "idle") phase("idle"); return; }

      // The room plays another song: load it, held.
      if (state.track.videoId !== currentTrack?.videoId) {
        setRate(1); resetHistory();
        // Loaded once already, yet something else plays (the song before ended and was started
        // again on top of the load): load it again, though not while a load still runs.
        const stale = loaded.current === state.track.videoId && !a.isPreparing && Date.now() - (s.since || 0) > 3000;
        if (loaded.current !== state.track.videoId || stale) {
          loaded.current = state.track.videoId;
          holdNextReady.current = true;
          phase("loading", { since: Date.now() });
          handlePlay(state.track, [state.track]);
        }
        return;
      }
      // Loading takes as long as it takes: fetching the stream's address alone is 2-4 s, with
      // nothing that says so on the player. Only a load that never reports back is given up.
      if (s.phase === "loading" && (a.isPreparing || holdNextReady.current)) {
        if (Date.now() - s.since > LOAD_TIMEOUT) holdNextReady.current = false;
        else return;
      }

      // A room standing still: stand at its place.
      if (!state.playing) {
        setRate(1); resetHistory();
        if (!a.paused) { a.pause(); setIsPlaying(false); }
        if (Math.abs(a.currentTime - state.pos) > 0.05 && !a.isPreparing) a.currentTime = state.pos;
        // Loaded and standing where the room stands: tell the host (for "wait for everyone").
        else if (!a.isPreparing && !holdNextReady.current) sendReady(state.track.videoId);
        if (s.phase !== "paused") phase("paused");
        return;
      }

      // Get ready where the room will be `ahead` from now (or where it starts, if later), then
      // start right then.
      const prepare = (why) => {
        setRate(1); resetHistory();
        const T = Math.max(serverNow() + ahead * 1000, state.at);
        const P = roomPosAt(state, T, latency);
        if (!a.paused) a.pause();
        holdNextReady.current = false;
        phase("preparing", { T, P, since: Date.now(), readies: readies.current }, why);
        a.currentTime = Math.max(0, P);
      };

      if (s.phase === "preparing") {
        // The room moved on in a way the prepared place no longer fits (the host jumped).
        const moved = Math.abs(roomPosAt(state, s.T, latency) - s.P);
        if (moved * 1000 > tune.seekAbove) { prepare(`room moved ${Math.round(moved * 1000)} ms`); return; }
        if (readies.current === s.readies) {
          if (Date.now() - s.since > PREPARE_TIMEOUT) prepare("no ready");
          return;
        }
        const took = (Date.now() - s.since) / 1000;
        const left = s.T - serverNow();
        if (left < 30) {
          // Ready too late for the moment it aimed at: aim further ahead.
          ahead = Math.min(4, took * 1.3 + 0.3);
          prepare(`ready ${Math.round(-left)} ms late`);
          return;
        }
        // A little more than this took, for next time.
        ahead = Math.min(6, Math.max(0.6, ahead * 0.7 + (took * 1.3 + 0.3) * 0.3));
        invoke("audio_resume_at", { atMs: s.T - offset }).catch(() => {});
        phase("waiting", {}, `ready in ${Math.round(took * 1000)} ms`);
        return;
      }
      if (s.phase === "waiting") {
        const moved = Math.abs(roomPosAt(state, s.T, latency) - s.P);
        if (moved * 1000 > tune.seekAbove) { prepare(`room moved ${Math.round(moved * 1000)} ms`); return; }
        if (serverNow() < s.T + SETTLED) return;
        setIsPlaying(true);
        phase("following");
        return;
      }

      // Following (or anything else that ends up here): close enough is caught up by speed,
      // too far is prepared for anew.
      const want = expectedPos(state) + latency;
      // At the end of the song: the room is about to move on to the next. Nothing to catch up
      // with until then, and nothing past the end to seek to.
      const length = a.duration > 0 ? a.duration : state.track.duration;
      if (length > 0 && want > length - 0.5) {
        setRate(1);
        if (s.phase !== "ending") phase("ending");
        return;
      }
      const drift = nowPos() - want;
      setDrift(Math.round(drift * 1000));
      if (a.paused || a.isPreparing || Math.abs(drift) * 1000 > tune.seekAbove) {
        prepare(a.paused ? "player paused" : a.isPreparing ? "player loading" : `drift ${Math.round(drift * 1000)} ms`);
        return;
      }
      if (s.phase !== "following") phase("following");

      const now = Date.now();
      if (now - lastRate < RATE_EVERY) return;
      if (lastRateTick) asked += (rateNow - 1) * (now - lastRateTick) / 1000;
      lastRate = lastRateTick = now;
      // Every new word from the host moves the room's line; what the drift did across that is
      // the host's doing, not this device's. Measure afresh.
      const key = `${state.at}:${state.pos}:${state.rate}`;
      if (key !== roomKey) { roomKey = key; history = []; }
      history.push({ at: now, drift, asked });
      while (history.length > 1 && now - history[1].at >= BASE_WINDOW) history.shift();
      const o = history[0];
      if (now - o.at >= BASE_WINDOW) {
        const dt = (now - o.at) / 1000;
        const own = (drift - o.drift) / dt - (asked - o.asked) / dt;
        baseRate = Math.max(-BASE_MAX, Math.min(BASE_MAX, baseRate + (-own - baseRate) * 0.1));
      }
      smoothed = smoothed == null ? drift : smoothed + (drift - smoothed) * SMOOTH;
      const max = tune.maxRate / 1000;
      const p = Math.abs(smoothed) < DEADBAND ? 0 : Math.max(-max, Math.min(max, -smoothed / HORIZON));
      setRate(1 + baseRate + p);
    }, TICK);
    return () => { clearInterval(id); setRate(1); };
  }, [active, currentTrack, audioRef, handlePlay, setIsPlaying]); // eslint-disable-line react-hooks/exhaustive-deps

}
