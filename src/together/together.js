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
  config: { control: "host", waitAll: false, name: "" },
  showAvatar: true,
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
/** One value out of the room's state, re-rendering only when it changes. For App.jsx, which
 *  must not re-render with every drift reading (ten a second) - it is the whole app. */
export const useTogetherValue = (pick) => useSyncExternalStore(subscribe, () => pick(snap));
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
  return st.playing ? st.pos + (st.rate || 1) * Math.max(0, serverNow() - st.at) / 1000 : st.pos;
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

const addSubs = new Set();
/** Host: a member asks for a song ({ track, mode: "next" | "end", from, fromId }). */
export const onRoomAdd = (fn) => { addSubs.add(fn); return () => addSubs.delete(fn); };
const removeSubs = new Set();
/** Host: a song leaves the queue ({ videoId, by }: by is the member who added it, or null when
 *  the host removes it itself). */
export const onRoomRemove = (fn) => { removeSubs.add(fn); return () => removeSubs.delete(fn); };

// Who this Kodama is in a room, with the account's profile picture (which can be switched off).
const AVATAR_KEY = "kodama-together-show-avatar";
let identity = { name: "Kodama", avatar: "" };
export function setIdentity(name, avatar) { identity = { name: (name || "").trim() || "Kodama", avatar: avatar || "" }; }
// On unless switched off.
export const showsAvatar = () => { try { return localStorage.getItem(AVATAR_KEY) !== "0"; } catch { return true; } };
snap.showAvatar = showsAvatar();
const sharedAvatar = () => (showsAvatar() ? identity.avatar : "");
// The "Listen along" button on the Discord status: on unless switched off.
const DISCORD_KEY = "kodama-together-discord";
export const showsDiscord = () => { try { return localStorage.getItem(DISCORD_KEY) !== "0"; } catch { return true; } };
snap.showDiscord = showsDiscord();
export function setShowDiscord(on) {
  try { localStorage.setItem(DISCORD_KEY, on ? "1" : "0"); } catch { /* this session only */ }
  set({ showDiscord: !!on });
}

export function setShowAvatar(on) {
  try { localStorage.setItem(AVATAR_KEY, on ? "1" : "0"); } catch { /* this session only */ }
  set({ showAvatar: !!on });
  send({ t: "profile", avatar: sharedAvatar() });
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
  wantRoom = room; wantName = name || identity.name; retries = 0; samples = [];
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
    send({ t: "hello", name: wantName, hostToken: token, device, avatar: sharedAvatar() });
    // A short burst to get a good clock reading quickly, then one now and then.
    clearInterval(pingTimer); burst = 0;
    pingTimer = setInterval(() => { ping(); if (++burst === 6) { clearInterval(pingTimer); pingTimer = setInterval(ping, 5000); } }, 250);
  };
  sock.onmessage = (e) => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    if (m.t === "pong") onPong(m);
    else if (m.t === "welcome") set({ status: "open", you: m.you, isHost: !!m.you?.host, state: m.state, members: m.members || [], queue: m.queue || [], config: m.config || snap.config });
    else if (m.t === "config") set({ config: { control: m.control, waitAll: !!m.waitAll, name: m.name || "" } });
    else if (m.t === "add") addSubs.forEach((f) => f(m));
    else if (m.t === "remove") removeSubs.forEach((f) => f({ videoId: m.videoId, by: m.by }));
    else if (m.t === "queue") set({ queue: m.list || [] });
    else if (m.t === "state") set({ state: { track: m.track, playing: m.playing, pos: m.pos, at: m.at, rate: m.rate || 1 } });
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
  ...(track.addedBy ? { addedBy: track.addedBy } : {}),
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
 *  starts then, for the host and everyone else alike. `rate`: how fast the host's audio really
 *  runs against the room's clock (a sound card is a few per mille off), so the room moves with
 *  the host instead of with the clock. */
export function hostSet(track, playing, pos, startAt, rate = 1) {
  if (!snap.isHost) return;
  const t = roomTrack(track);
  // Kept locally at once, so the host's own drift check measures against what it just said.
  set({ state: { track: t, playing: !!playing && !!t, pos, at: startAt ?? serverNow(), rate } });
  send({ t: "set", track: t, playing, pos, startAt, rate });
}

export const inviteLink = (room) => `https://kodama.kiyoshi.dev/together/?${room}`;

/** A room code out of whatever was pasted: the code itself, an invite link, a kodama:// link. */
export function parseRoomInput(text) {
  const s = String(text || "").trim();
  const m = s.match(/together\/\??([a-z0-9]{4,16})(?![a-z0-9])/i) || s.match(/^([a-z0-9]{4,16})$/i);
  return m ? m[1].toLowerCase() : null;
}

/** Start a room and join it as host. */
export async function startRoom(name) {
  const room = await createRoom();
  join(room, name);
  return room;
}

/** Host only: the room's settings. */
export function hostConfig(patch) {
  if (!snap.isHost) return;
  const config = { ...snap.config, ...patch };
  set({ config });
  send({ t: "config", ...config });
}

/** This member has `videoId` loaded and stands ready to start it. */
let lastReady = "";
export function sendReady(videoId) {
  if (videoId === lastReady && ws && ws.readyState === 1) return;
  lastReady = videoId;
  send({ t: "ready", videoId });
}

/** Take a song out of the room's queue: the host any, a member only one they added. */
export function roomRemove(track) {
  if (snap.isHost) removeSubs.forEach((f) => f({ videoId: track.videoId, by: null }));
  else if (track.addedBy?.id && track.addedBy.id === snap.you?.id) send({ t: "remove", videoId: track.videoId });
}

/** A song for the host's queue; allowed when the host lets everyone add. */
export function requestAdd(track, mode) {
  const t = roomTrack(track);
  if (t) send({ t: "add", track: t, mode });
}
