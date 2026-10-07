// ListenTogether: the connection to a room, and the room's clock.
//
// The room (together/worker.js) only says "this song, at this position, as of this server time".
// Everything here is about knowing what time it is on the server: a few pings, the one with the
// shortest round trip wins, and its midpoint gives the offset between this clock and the room's.
import { useSyncExternalStore } from "react";

// The deployed room server. A local `wrangler dev` (http://localhost:8787) can be set in the Debug tab.
const DEFAULT_URL = "https://kodama-together.kiyoshidesign.workers.dev";
export const togetherUrl = () => {
  try { return localStorage.getItem("kodama-together-url") || DEFAULT_URL; } catch { return DEFAULT_URL; }
};

let snap = {
  status: "idle",         // idle | connecting | open | reconnecting | closed
  room: null, isHost: false, you: null,
  members: [], state: null,
  offset: 0, rtt: null,   // server clock = Date.now() + offset
  drift: null,            // listener: how far off the last check was, in ms (for the debug view)
  error: null,
  tune: null, lead: 0.15, rate: 1, baseRate: 0,
};
const subs = new Set();
const set = (patch) => { snap = { ...snap, ...patch }; subs.forEach((f) => f()); };
const subscribe = (cb) => { subs.add(cb); return () => subs.delete(cb); };
export const useTogether = () => useSyncExternalStore(subscribe, () => snap);
export const getTogether = () => snap;
export const setDrift = (ms) => { if (snap.drift !== ms) set({ drift: ms }); };

// Sync tuning, adjustable in the Debug tab while the feel is being worked out. All in ms.
//   seekAbove: a listener further off than this jumps; closer, it catches up by playing faster
//     or slower (a jump rebuilds the player and is heard as a short gap)
//   maxRate: at most this much faster or slower, in per mille (10 = 1 %, about 17 cents)
//   hostReport: the host reports again when it is this far off what it last said
//   latency: this device's audio comes out this much late (Bluetooth, a VM); played ahead by it
const TUNE_KEY = "kodama-together-tune-v2";
export const TUNE_DEFAULTS = { seekAbove: 300, maxRate: 10, hostReport: 150, latency: 0 };
let tune = TUNE_DEFAULTS;
try { tune = { ...TUNE_DEFAULTS, ...JSON.parse(localStorage.getItem(TUNE_KEY) || "{}") }; } catch { /* defaults */ }
// 1000 was the first default, too far to catch up by speed after a song change.
if (tune.seekAbove === 1000) tune = { ...tune, seekAbove: TUNE_DEFAULTS.seekAbove };
snap.tune = tune;
export const getTune = () => tune;
export function setTune(patch) {
  tune = { ...tune, ...patch };
  try { localStorage.setItem(TUNE_KEY, JSON.stringify(tune)); } catch { /* this session only */ }
  set({ tune });
}
// How far ahead a correcting seek aims, in s. Learnt: a seek into a stream lands late by however
// long the player needs to get going again there, which differs per machine and connection.
export const setLead = (s) => { if (snap.lead !== s) set({ lead: s }); };
export const setRateShown = (r, base) => { if (snap.rate !== r || snap.baseRate !== base) set({ rate: r, baseRate: base }); };

export const serverNow = () => Date.now() + snap.offset;
/** Where the room is right now, in seconds. */
export function expectedPos(st = snap.state) {
  if (!st) return 0;
  return st.playing ? st.pos + Math.max(0, serverNow() - st.at) / 1000 : st.pos;
}

const hostKey = (room) => `kodama-together-host:${room}`;

/** A new room on the server. Its host token stays on this device; whoever holds it is host. */
export async function createRoom() {
  const r = await fetch(togetherUrl() + "/rooms", { method: "POST" });
  if (!r.ok) throw new Error(`room server answered ${r.status}`);
  const { room, hostToken } = await r.json();
  try { localStorage.setItem(hostKey(room), hostToken); } catch { /* without it there is no host after a restart */ }
  return room;
}

let ws = null, wantRoom = null, wantName = "", retries = 0, pingTimer = 0, burst = 0;
let samples = [];

function send(msg) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(msg)); }

function ping() { send({ t: "ping", c: Date.now() }); }
function onPong(m) {
  const now = Date.now(), rtt = now - m.c;
  // Only recent readings count: a clock that runs a little fast or slow (a virtual machine's
  // often does) moves the offset over time, and an old reading with a short round trip would
  // otherwise keep winning.
  samples = [...samples, { rtt, offset: m.s - (m.c + rtt / 2), at: now }].filter((x) => now - x.at < 30000).slice(-8);
  const best = samples.reduce((a, b) => (b.rtt < a.rtt ? b : a));
  set({ offset: best.offset, rtt: best.rtt });
}

/** Join a room by its code, under a display name. Reconnects on its own until left. */
export function join(room, name) {
  leave();
  wantRoom = room; wantName = name || "Kodama"; retries = 0; samples = [];
  set({ status: "connecting", room, error: null, members: [], state: null, isHost: false, drift: null });
  open();
}

function open() {
  const url = togetherUrl().replace(/^http/, "ws") + `/rooms/${encodeURIComponent(wantRoom)}/ws`;
  const sock = new WebSocket(url);
  ws = sock;
  sock.onopen = () => {
    retries = 0;
    let token = null;
    try { token = localStorage.getItem(hostKey(wantRoom)); } catch { /* not host then */ }
    send({ t: "hello", name: wantName, hostToken: token });
    // A short burst to get a good clock reading quickly, then one now and then.
    clearInterval(pingTimer); burst = 0;
    pingTimer = setInterval(() => { ping(); if (++burst === 6) { clearInterval(pingTimer); pingTimer = setInterval(ping, 5000); } }, 250);
  };
  sock.onmessage = (e) => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (m.t === "pong") onPong(m);
    else if (m.t === "welcome") set({ status: "open", you: m.you, isHost: !!m.you?.host, state: m.state, members: m.members || [] });
    else if (m.t === "state") set({ state: { track: m.track, playing: m.playing, pos: m.pos, at: m.at } });
    else if (m.t === "members") set({ members: m.list || [] });
    else if (m.t === "error") set({ error: m.reason });
  };
  sock.onclose = (ev) => {
    if (ws !== sock) return;           // replaced on purpose
    clearInterval(pingTimer);
    if (!wantRoom) { set({ status: "closed" }); return; }
    // A room that does not exist does not come back by retrying.
    if (ev.code === 1006 && snap.status === "connecting" && retries >= 2) { set({ status: "closed", error: "unreachable" }); return; }
    retries++;
    set({ status: "reconnecting" });
    setTimeout(() => { if (wantRoom && ws === sock) open(); }, Math.min(10000, 1000 * retries));
  };
}

export function leave() {
  wantRoom = null;
  clearInterval(pingTimer);
  const s = ws; ws = null;
  if (s) { try { s.close(); } catch { /* already */ } }
  set({ status: "idle", room: null, isHost: false, members: [], state: null, drift: null, error: null });
}

/** Host only: the playback state everyone should follow. */
export function hostSet(track, playing, pos) {
  if (!snap.isHost) return;
  const t = track ? {
    videoId: track.videoId, title: track.title || "", thumbnail: track.thumbnail || "",
    artists: Array.isArray(track.artists) ? track.artists.map((a) => a?.name || a).join(", ") : (track.artists || ""),
    duration: Number(track.duration) || 0,
  } : null;
  // Kept locally at once, so the host's own drift check measures against what it just said.
  set({ state: { track: t, playing: !!playing && !!t, pos, at: serverNow() } });
  send({ t: "set", track: t, playing, pos });
}

export const inviteLink = (room) => `https://kodama.kiyoshi.dev/together/?${room}`;
