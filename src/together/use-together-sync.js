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
import { useTogether, getTogether, hostSet, expectedPos, serverNow, setDrift, getTune, setSync } from "./together.js";

const TICK = 100;            // ms
const RATE_EVERY = 500;      // ms: the speed is adjusted this often
const HORIZON = 10;          // s: a drift is meant to be gone in about this long. Shorter asks for
                             // audible speeds (3 s turned 24 ms into 8 per mille) for errors nobody hears
const SMOOTH = 0.3;          // the measured drift wobbles by about 10 ms; the speed follows its average
const DEADBAND = 0.01;       // s: closer than this plays at normal speed
const BASE_WINDOW = 10000;   // ms: the device's own speed error is measured over this long
const BASE_MAX = 0.02;
const START_DELAY = 1500;    // ms: a new song starts this long after the host has it, for everyone
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
  return st.pos + (st.playing ? Math.max(0, T - st.at) / 1000 : 0) + latency;
}

export function useTogetherSync({ audioRef, currentTrack, setIsPlaying, handlePlay }) {
  const t = useTogether();
  const active = t.status === "open" || t.status === "reconnecting";
  const lastTU = useRef({ pos: 0, at: 0 });
  const loaded = useRef(null);
  // The sync's own state, in a ref: the tick runs ten times a second and must not re-render.
  //   phase: "idle" | "loading" | "preparing" | "waiting" | "following" | "paused"
  const sync = useRef({ phase: "idle" });
  // Set before a song loads: the moment the player has it ready, it is paused, before more
  // than a few milliseconds of it are heard at the wrong time.
  const holdNextReady = useRef(false);
  const readies = useRef(0);
  const host = useRef({ videoId: null, startLocal: 0 });

  const phase = (p, extra = {}, why = "") => {
    sync.current = { ...sync.current, ...extra, phase: p };
    const d = getTogether().drift;
    const line = `${new Date().toTimeString().slice(0, 8)} ${p}${why ? ` (${why})` : ""}${d != null ? ` drift ${d}` : ""}`;
    setSync({ phase: p, ahead: Math.round(ahead * 100) / 100, log: [line, ...(getTogether().sync.log || [])].slice(0, 8) });
  };

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
          const startAt = serverNow() + START_DELAY;
          h.scheduled = true;
          h.startLocal = startAt - offset;
          hostSet(currentTrack, true, a.currentTime, startAt);
          invoke("audio_resume_at", { atMs: h.startLocal }).catch(() => {});
          setIsPlaying(true);
          return;
        }
        // Until the start has happened and settled, the host is where it said it would be.
        if (h.scheduled && Date.now() < h.startLocal + SETTLED) return;
        // Report when what the room believes is off from what the host hears: a pause, a seek,
        // a stall while buffering.
        const running = !a.paused && !a.isPreparing;
        const off = nowPos() - expectedPos(state);
        setDrift(Math.round(off * 1000));
        if (!state || state.track?.videoId !== currentTrack.videoId || state.playing !== running || Math.abs(off) * 1000 > tune.hostReport) {
          hostSet(currentTrack, running, nowPos());
        }
        return;
      }

      // ── Listener ──
      const s = sync.current;
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

  return t;
}
