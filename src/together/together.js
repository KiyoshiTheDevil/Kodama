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
  queue: [],              // what the host plays after this song
  offset: 0, rtt: null,   // server clock = Date.now() + offset
  drift: null,            // listener: how far off the last check was, in ms (for the debug view)
  error: null,
  tune: null,
  sync: { phase: "idle", ahead: 1.5, late: null, rate: 1, base: 0, log: [] },
};
const subs = new Set();
const set = (patch) => { snap = { ...snap, ...patch }; subs.forEach((f) => f()); };
const subscribe = (cb) => { subs.add(cb); return () => subs.delete(cb); };
export const useTogether = () => useSyncExternalStore(subscribe, () => snap);
export const getTogether = () => snap;
/** A listener in a room: the room decides what plays next, not this Kodama's queue. */
export const isRoomListener = () => (snap.status === "open" || snap.status === "reconnecting") && !snap.isHost;
export const setDrift = (ms) => { if (snap.drift !== ms) set({ drift: ms }); };

// Sync tuning, adjustable in the Debug tab while the feel is being worked out. All in ms.
//   seekAbove: a listener further off than this jumps; closer, it catches up by playing faster
//     or slower (a jump rebuilds the player and is heard as a short gap)
//   maxRate: at most this much faster or slower, in per mille (10 = 1 %, about 17 cents)
//   hostReport: the host reports again when it is this far off what it last said
//   latency: this device's audio comes out this much late (Bluetooth, a VM); played ahead by it
const TUNE_KEY = "kodama-together-tune-v2";
export const TUNE_DEFAULTS = { seekAbove: 300, maxRate: 5, hostReport: 150, latency: 0 };
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
// What the sync is doing, for the debug view: phase, how far ahead it prepares, how late the
// last start came, the speed and the device's own speed error.
export function setSync(patch) {
  const next = { ...snap.sync, ...patch };
  if (Object.keys(patch).some((k) => snap.sync[k] !== next[k])) set({ sync: next });
}

export const serverNow = () => Date.now() + snap.offset;
/** Where the room is right now, in seconds. */
export function expectedPos(st = snap.state) {
  if (!st) return 0;
  return st.playing ? st.pos + Math.max(0, serverNow() - st.at) / 1000 : st.pos;
}

const hostKey = (room) => `kodama-together-host:${room}`;

// This Kodama, as the room tells it apart from a second one with the same name: a reconnect
// replaces its old connection instead of standing next to it.
const device = (() => {
  try {
    let d = localStorage.getItem("kodama-together-device");
    if (!d) { d = crypto.randomUUID(); localStorage.setItem("kodama-together-device", d); }
    return d;
  } catch { return crypto.randomUUID(); }
})();

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
    send({ t: "hello", name: wantName, hostToken: token, device });
    // A short burst to get a good clock reading quickly, then one now and then.
    clearInterval(pingTimer); burst = 0;
    pingTimer = setInterval(() => { ping(); if (++burst === 6) { clearInterval(pingTimer); pingTimer = setInterval(ping, 5000); } }, 250);
  };
  sock.onmessage = (e) => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (m.t === "pong") onPong(m);
    else if (m.t === "welcome") set({ status: "open", you: m.you, isHost: !!m.you?.host, state: m.state, members: m.members || [], queue: m.queue || [] });
    else if (m.t === "queue") set({ queue: m.list || [] });
    else if (m.t === "state") set({ state: { track: m.track, playing: m.playing, pos: m.pos, at: m.at } });
    else if (m.t === "members") set({ members: m.list || [] });
    else if (m.t === "error") set({ error: m.reason });
  };
  sock.onclose = (ev) => {
    if (ws !== sock) return;           // replaced on purpose
    clearInterval(pingTimer);
    if (!wantRoom) { set({ status: "closed" }); return; }
    // Replaced by a newer connection of this same Kodama: that one carries on, this one stops.
    if (ev.code === 4000) { wantRoom = null; set({ status: "closed", error: "replaced" }); return; }
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
  set({ status: "idle", room: null, isHost: false, members: [], state: null, queue: [], drift: null, error: null });
}

const roomTrack = (track) => track ? {
  videoId: track.videoId, title: track.title || "", thumbnail: track.thumbnail || "",
  artists: Array.isArray(track.artists) ? track.artists.map((a) => a?.name || a).join(", ") : (track.artists || ""),
  duration: Number(track.duration) || 0,
} : null;

/** Host only: what plays after this song, so listeners can get it ready ahead of time. */
let lastQueue = "";
export function hostQueue(tracks) {
  if (!snap.isHost) return;
  const list = tracks.slice(0, 20).map(roomTrack);
  const key = JSON.stringify(list);
  if (key === lastQueue && ws && ws.readyState === 1) return;
  lastQueue = key;
  set({ queue: list });
  send({ t: "queue", list });
}

/** Host only: the playback state everyone should follow. With `startAt` (server ms), playback
 *  starts then, for the host and everyone else alike. */
export function hostSet(track, playing, pos, startAt) {
  if (!snap.isHost) return;
  const t = roomTrack(track);
  // Kept locally at once, so the host's own drift check measures against what it just said.
  set({ state: { track: t, playing: !!playing && !!t, pos, at: startAt ?? serverNow() } });
  send({ t: "set", track: t, playing, pos, startAt });
}

export const inviteLink = (room) => `https://kodama.kiyoshi.dev/together/?${room}`;
