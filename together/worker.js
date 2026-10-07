// ListenTogether: rooms where several Kodamas play the same song at the same moment.
//
// No audio passes through here. Every Kodama plays the song from YouTube itself; a room only
// carries WHAT plays and WHERE it is: "this song, at this position, as of this server time".
// Each client syncs its clock to the room and works out where it should be from that.
//
//   POST /rooms                 -> { room, hostToken }    a new room; the token makes its holder host
//   GET  /rooms/<room>/ws        -> WebSocket into the room
//   GET  /rooms/<room>           -> { name, host, members, count, limit, full, track } for the invite page:
//                                   what anyone in the room sees, to anyone with the code
//
// Messages, as JSON (client -> room):
//   { t: "hello", name, hostToken?, device?, avatar? }      join, as host if the token matches;
//                                                           an older socket of the same device is closed.
//                                                           Refused when kicked (4001) or full (4002);
//                                                           with approval on, answered { t: "waiting" }
//   { t: "profile", avatar }                                show (or, empty, hide) a profile picture
//   { t: "ping", c }                                        clock sync; answered with { t: "pong", c, s }
//   { t: "queue", list: [track] }                           host only: what plays after this song
//   { t: "config", waitAll, name, newRole, limit, approval } host only: room settings
//   { t: "role", id, role }                                 host only: cohost / member / listener
//   { t: "kick", id }                                       host, co-host: out, and not back in
//   { t: "admit" | "deny", id }                             host, co-host: someone waiting
//   { t: "transfer", id }                                   host only: hand the room over
//   { t: "close" }                                          host only: end the room for everyone
//   { t: "ready", videoId }                                 this member has that song loaded
//   { t: "add", track, mode }                               a song for the host's queue (if allowed)
//   { t: "remove", videoId }                                a member's own song (a co-host: any) out of the queue
//   { t: "set", track, playing, pos, startAt?, rate? }      host only: the new playback state;
//                                                           rate: how fast the host's audio really runs
//                                                           startAt (server ms, at most 5 s ahead)
//                                                           schedules the start for everyone
// (room -> client):
//   { t: "welcome", you: { id, host, role }, state, members, queue, config, s } after hello
//   { t: "waiting" }                                        to someone waiting to be let in
//   { t: "waiting", list }                                  to host and co-hosts: who is waiting
//   { t: "host", id, name, why }                            the room has a new host (handover / auto)
//   { t: "closed", by }                                     the host ended the room
//   { t: "queue", list }
//   { t: "config", waitAll, name, newRole, limit, approval }
//   { t: "add", track, mode, from, fromId }                 to the host: a member's song
//   { t: "remove", videoId, by }                            to the host: a song out (by: who added it, or null)
//   { t: "state", track, playing, pos, at, rate }           position `pos` (seconds) at server time `at` (ms),
//                                                           moving `rate` seconds per second
//   { t: "members", list: [{ id, name, host, role, avatar, ready }] }
//   { t: "error", reason }
//
// One Durable Object per room, on the WebSocket Hibernation API: between messages the room
// sleeps and costs nothing. Its state therefore lives in storage and in the sockets'
// attachments, never only in memory, which hibernation would drop.
import { DurableObject } from "cloudflare:workers";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...CORS } });

// Room codes people can read out loud: no 0/O, 1/I/L.
const ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";
const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => ALPHABET[b % ALPHABET.length]).join("");
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
const sha256 = async (s) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));

const MAX_MESSAGE = 16384;   // a queue of 20 songs fits
// waitAll: a new song starts once every member has it loaded (or after a few seconds).
// newRole: what someone new is ("listener" only listens, "member" may add songs).
// limit: how many may be in the room, the host included; 0 is no limit.
// approval: someone new waits until the host or a co-host lets them in.
const DEFAULT_CONFIG = { waitAll: false, name: "", newRole: "listener", limit: 10, approval: false };
const LIMIT_MAX = 50;
// Roles below the host: a co-host adds and removes any song, lets people in and removes them
// (never the host); a member adds songs and removes their own; a listener only listens.
const ROLES = ["cohost", "member", "listener"];
const HOST_HANDOVER = 60 * 1000;   // ms a host may be gone before the room passes to someone else
const ADD_GAP = 1000;        // ms: one song request per member this often at most
const QUEUE_MAX = 20;

// A track as the room keeps it: only what a listener needs to load and show it, and who put it
// in the queue (absent for the host's own songs).
const cleanTrack = (t) => t && typeof t.videoId === "string" ? {
  videoId: t.videoId.slice(0, 32),
  title: String(t.title || "").slice(0, 200),
  artists: String(t.artists || "").slice(0, 200),
  thumbnail: String(t.thumbnail || "").slice(0, 500),
  // "3:15" as Kodama shows it, or seconds.
  duration: typeof t.duration === "string" ? t.duration.slice(0, 12) : (Number(t.duration) || 0),
  ...(t.addedBy && typeof t.addedBy.id === "string"
    ? { addedBy: { id: t.addedBy.id.slice(0, 16), name: String(t.addedBy.name || "").slice(0, 40) } }
    : {}),
} : null;

// A profile picture is shown to everyone in the room, whose Kodamas then load it: only Google's
// own image hosts, so nobody can make the whole room fetch an address of their choosing.
const AVATAR_HOSTS = [".googleusercontent.com", ".ggpht.com", ".ytimg.com"];
function cleanAvatar(url) {
  try {
    const u = new URL(String(url || ""));
    return u.protocol === "https:" && String(url).length <= 500 && AVATAR_HOSTS.some((h) => u.hostname.endsWith(h)) ? u.href : "";
  } catch { return ""; }
}
const EMPTY_ROOM_TTL = 15 * 60 * 1000;   // a room nobody is in is kept this long, then removed
const UNUSED_ROOM_TTL = 60 * 60 * 1000;  // a room nobody ever joined

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    if (url.pathname === "/rooms" && request.method === "POST") {
      // A fresh code; on the very unlikely clash with a live room, another one.
      for (let i = 0; i < 4; i++) {
        const room = newCode();
        const hostToken = hex(crypto.getRandomValues(new Uint8Array(24)).buffer);
        const stub = env.ROOMS.get(env.ROOMS.idFromName(room));
        const r = await stub.fetch("https://room/init", { method: "POST", body: JSON.stringify({ hostHash: await sha256(hostToken) }) });
        if (r.status === 201) return json({ room, hostToken }, 201);
      }
      return json({ error: "no free room code" }, 503);
    }

    const info = /^\/rooms\/([a-z0-9]{4,16})$/.exec(url.pathname);
    if (info && request.method === "GET") {
      const r = await env.ROOMS.get(env.ROOMS.idFromName(info[1])).fetch("https://room/info");
      return new Response(r.body, { status: r.status, headers: { "content-type": "application/json", "cache-control": "no-store", ...CORS } });
    }

    const m = /^\/rooms\/([a-z0-9]{4,16})\/ws$/.exec(url.pathname);
    if (m && request.method === "GET") {
      if (request.headers.get("Upgrade") !== "websocket") return json({ error: "expected a WebSocket" }, 426);
      return env.ROOMS.get(env.ROOMS.idFromName(m[1])).fetch(request);
    }
    return json({ error: "not found" }, 404);
  },
};

export class Room extends DurableObject {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/init") {
      if (await this.ctx.storage.get("state")) return new Response("taken", { status: 409 });
      const { hostHash } = await request.json();
      await this.ctx.storage.put({ hostHash, state: { track: null, playing: false, pos: 0, at: Date.now() } });
      await this.ctx.storage.setAlarm(Date.now() + UNUSED_ROOM_TTL);
      return new Response("ok", { status: 201 });
    }
    // A room exists once created, and until it is closed or emptied for good: by its state.
    if (!(await this.ctx.storage.get("state"))) return json({ error: "no such room" }, 404);
    if (url.pathname === "/info") {
      // The invite page's view of the room. Names and pictures only as the room shows them;
      // a handful is enough for a page that says who is there.
      const members = await this.members();
      const host = members.find((m) => m.host);
      const config = await this.config();
      const state = await this.ctx.storage.get("state");
      const track = state?.track ? { videoId: state.track.videoId, title: state.track.title, artists: state.track.artists } : null;
      return json({
        name: config.name || "",
        host: host?.name || "",
        count: members.length,
        limit: config.limit,
        full: config.limit > 0 && members.length >= config.limit,
        approval: config.approval,
        members: members.sort((a, b) => (b.host ? 1 : 0) - (a.host ? 1 : 0)).slice(0, 5).map(({ name, avatar, host: h }) => ({ name, avatar, host: h })),
        track,
      });
    }
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id: crypto.randomUUID().slice(0, 8), name: "", joined: false, waiting: false });
    return new Response(null, { status: 101, webSocket: client });
  }

  // ── Stored state ──────────────────────────────────────────────────────────────────────────
  async config() {
    const c = (await this.ctx.storage.get("config")) || {};
    return {
      ...DEFAULT_CONFIG, ...c,
      // Rooms from before roles said "everyone may add" this way.
      newRole: c.newRole || (c.control === "everyone" ? "member" : "listener"),
    };
  }
  async roles() { return (await this.ctx.storage.get("roles")) || {}; }
  async hostId() { return (await this.ctx.storage.get("hostId")) || ""; }

  // ── Who is here ───────────────────────────────────────────────────────────────────────────
  // Everyone in the room; `except` leaves out a socket that is closing right now and may still be
  // listed while its close handler runs. Their role from the room's records, the host's by id.
  async members(except) {
    const [roles, hostId] = [await this.roles(), await this.hostId()];
    return this.ctx.getWebSockets()
      .filter((ws) => ws !== except)
      .map((ws) => ws.deserializeAttachment())
      .filter((a) => a && a.joined)
      .map(({ id, name, ready, avatar, joinedAt }) => {
        const host = id === hostId;
        return { id, name, host, role: host ? "host" : roles[id] || "listener", ready: ready || "", avatar: avatar || "", joinedAt: joinedAt || 0 };
      });
  }
  waiting(except) {
    return this.ctx.getWebSockets()
      .filter((ws) => ws !== except)
      .map((ws) => ws.deserializeAttachment())
      .filter((a) => a && a.waiting)
      .map(({ id, name, avatar }) => ({ id, name, avatar: avatar || "" }));
  }
  socketsOf(id) {
    return this.ctx.getWebSockets().filter((ws) => ws.deserializeAttachment()?.id === id);
  }

  broadcast(msg, except) {
    const text = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws !== except && ws.deserializeAttachment()?.joined) { try { ws.send(text); } catch { /* gone; its close handler tidies up */ } }
    }
  }
  // The host and co-hosts: who lets people in, and is told who is waiting.
  async toAdmins(msg, except) {
    const text = JSON.stringify(msg);
    for (const m of await this.members(except)) {
      if (m.role !== "host" && m.role !== "cohost") continue;
      for (const ws of this.socketsOf(m.id)) { try { ws.send(text); } catch { /* gone */ } }
    }
  }
  async announceMembers(except) {
    this.broadcast({ t: "members", list: await this.members(except) }, except);
    await this.toAdmins({ t: "waiting", list: this.waiting(except) }, except);
  }

  // ── Alarms: removing an empty room, handing over a room whose host has gone ──────────────
  async schedule(except) {
    const members = await this.members(except);
    if (members.length === 0 && this.waiting(except).length === 0) {
      await this.ctx.storage.setAlarm(Date.now() + EMPTY_ROOM_TTL);
      return;
    }
    const gone = await this.ctx.storage.get("hostGoneAt");
    if (gone && !members.some((m) => m.host)) await this.ctx.storage.setAlarm(gone + HOST_HANDOVER);
    else await this.ctx.storage.deleteAlarm();
  }

  async setHost(id, why) {
    const roles = await this.roles();
    delete roles[id];
    await this.ctx.storage.put({ hostId: id, roles });
    await this.ctx.storage.delete("hostGoneAt");
    const m = (await this.members()).find((x) => x.id === id);
    this.broadcast({ t: "host", id, name: m?.name || "", why });
    await this.announceMembers();
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== "string" || raw.length > MAX_MESSAGE) return;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const me = ws.deserializeAttachment();
    const now = Date.now();
    const send = (o) => { try { ws.send(JSON.stringify(o)); } catch { /* gone */ } };
    const refuse = (reason, code) => { send({ t: "error", reason }); try { ws.close(code, reason); } catch { /* gone */ } };

    if (msg.t === "ping") { send({ t: "pong", c: msg.c, s: now }); return; }

    if (msg.t === "hello") {
      const name = String(msg.name || "").trim().slice(0, 40) || "Listener";
      const device = typeof msg.device === "string" ? msg.device.slice(0, 64) : "";
      // The same Kodama again (a reconnect after a dropped line, a reloaded window): its old
      // socket may not have closed yet and would stand in the member list as a second person.
      if (device) {
        for (const other of this.ctx.getWebSockets()) {
          if (other !== ws && other.deserializeAttachment()?.device === device) {
            other.serializeAttachment({ ...other.deserializeAttachment(), joined: false, waiting: false });
            try { other.close(4000, "replaced"); } catch { /* already gone */ }
          }
        }
      }
      // The member id the room shows. From the device when there is one, so it outlives a
      // reconnect (a member keeps their role and can still take back their songs), hashed with
      // the room so it says nothing about the device and differs from room to room.
      const id = device ? (await sha256(`${this.ctx.id}:${device}`)).slice(0, 12) : me.id;
      if (((await this.ctx.storage.get("banned")) || []).includes(id)) { refuse("kicked", 4001); return; }

      // The room's creator becomes host by the key it got; from then on the host is an id, which
      // is what a hand-over can pass on.
      const hostHash = await this.ctx.storage.get("hostHash");
      let hostId = await this.hostId();
      if (hostHash && typeof msg.hostToken === "string" && msg.hostToken && (await sha256(msg.hostToken)) === hostHash && (!hostId || hostId === id)) {
        hostId = id;
        await this.ctx.storage.put("hostId", id);
      }
      const isHost = id === hostId;
      const config = await this.config();
      const base = { ...me, id, name, device, avatar: cleanAvatar(msg.avatar), joinedAt: me.joinedAt || now };

      if (!isHost) {
        const count = (await this.members(ws)).length;
        if (config.limit > 0 && count >= config.limit) { refuse("room-full", 4002); return; }
        // Waiting to be let in, unless let in before (a reconnect does not knock again).
        if (config.approval && !((await this.ctx.storage.get("admitted")) || []).includes(id)) {
          ws.serializeAttachment({ ...base, joined: false, waiting: true });
          send({ t: "waiting" });
          await this.toAdmins({ t: "waiting", list: this.waiting() });
          await this.schedule();
          return;
        }
      }
      await this.admit(ws, base, isHost);
      return;
    }

    if (!me?.joined) return;
    const roles = await this.roles();
    const hostId = await this.hostId();
    const role = me.id === hostId ? "host" : roles[me.id] || "listener";
    const isHost = role === "host";
    const isAdmin = isHost || role === "cohost";

    if (msg.t === "set") {
      if (!isHost) { send({ t: "error", reason: "host-only" }); return; }
      const tr = cleanTrack(msg.track);
      // `at` in the future: everyone stands at `pos` until then and starts together.
      const startAt = Number(msg.startAt);
      const at = Number.isFinite(startAt) ? Math.min(now + 5000, Math.max(now, startAt)) : now;
      const rate = Math.min(1.03, Math.max(0.97, Number(msg.rate) || 1));
      const state = { track: tr, playing: !!msg.playing && !!tr, pos: Math.max(0, Number(msg.pos) || 0), at, rate };
      await this.ctx.storage.put("state", state);
      this.broadcast({ t: "state", ...state });
    }

    if (msg.t === "queue") {
      if (!isHost) { send({ t: "error", reason: "host-only" }); return; }
      const list = (Array.isArray(msg.list) ? msg.list : []).slice(0, QUEUE_MAX).map(cleanTrack).filter(Boolean);
      await this.ctx.storage.put("queue", list);
      this.broadcast({ t: "queue", list }, ws);
    }

    if (msg.t === "config") {
      if (!isHost) { send({ t: "error", reason: "host-only" }); return; }
      const limit = Number(msg.limit);
      const config = {
        waitAll: !!msg.waitAll,
        name: String(msg.name || "").replace(/\s+/g, " ").trim().slice(0, 40),
        newRole: msg.newRole === "member" ? "member" : "listener",
        // 0 is no limit; otherwise 2..50. Lowering it sends nobody away, it only lets nobody in.
        limit: limit === 0 ? 0 : Math.min(LIMIT_MAX, Math.max(2, Math.round(limit) || DEFAULT_CONFIG.limit)),
        approval: !!msg.approval,
      };
      await this.ctx.storage.put("config", config);
      this.broadcast({ t: "config", ...config });
    }

    if (msg.t === "role") {
      // The host gives roles; nobody changes their own, and the host's is not a role to give.
      if (!isHost) { send({ t: "error", reason: "host-only" }); return; }
      const target = String(msg.id || "");
      if (!target || target === hostId || !ROLES.includes(msg.role)) return;
      roles[target] = msg.role;
      await this.ctx.storage.put("roles", roles);
      await this.announceMembers();
    }

    if (msg.t === "kick") {
      // Host and co-hosts; never the host. A kicked device cannot come back into this room.
      if (!isAdmin) { send({ t: "error", reason: "not-allowed" }); return; }
      const target = String(msg.id || "");
      if (!target || target === hostId || target === me.id) return;
      const banned = (await this.ctx.storage.get("banned")) || [];
      if (!banned.includes(target)) banned.push(target);
      await this.ctx.storage.put("banned", banned.slice(-200));
      for (const other of this.socketsOf(target)) {
        try { other.send(JSON.stringify({ t: "error", reason: "kicked" })); } catch { /* gone */ }
        other.serializeAttachment({ ...other.deserializeAttachment(), joined: false, waiting: false });
        try { other.close(4001, "kicked"); } catch { /* gone */ }
      }
      await this.announceMembers();
    }

    if (msg.t === "admit" || msg.t === "deny") {
      if (!isAdmin) { send({ t: "error", reason: "not-allowed" }); return; }
      const target = String(msg.id || "");
      for (const other of this.socketsOf(target)) {
        const a = other.deserializeAttachment();
        if (!a?.waiting) continue;
        if (msg.t === "deny") {
          other.serializeAttachment({ ...a, waiting: false });
          try { other.send(JSON.stringify({ t: "error", reason: "denied" })); other.close(4004, "denied"); } catch { /* gone */ }
        } else {
          const admitted = (await this.ctx.storage.get("admitted")) || [];
          if (!admitted.includes(target)) admitted.push(target);
          await this.ctx.storage.put("admitted", admitted.slice(-500));
          await this.admit(other, { ...a, waiting: false }, false);
        }
      }
      await this.announceMembers();
    }

    if (msg.t === "transfer") {
      // The host hands the room to someone in it, and with it the right the creation key gave.
      if (!isHost) { send({ t: "error", reason: "host-only" }); return; }
      const target = String(msg.id || "");
      if (!(await this.members()).some((m) => m.id === target) || target === me.id) return;
      await this.ctx.storage.delete("hostHash");
      roles[me.id] = "cohost";
      await this.ctx.storage.put("roles", roles);
      await this.setHost(target, "handover");
    }

    if (msg.t === "close") {
      // The host ends the room for everyone: they are told, let go, and the room is removed now.
      if (!isHost) { send({ t: "error", reason: "host-only" }); return; }
      const text = JSON.stringify({ t: "closed", by: me.name });
      for (const other of this.ctx.getWebSockets()) {
        try { other.send(text); } catch { /* gone */ }
        other.serializeAttachment({ ...other.deserializeAttachment(), joined: false, waiting: false });
        try { other.close(4005, "closed"); } catch { /* gone */ }
      }
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.deleteAll();
      return;
    }

    if (msg.t === "profile") {
      ws.serializeAttachment({ ...me, avatar: cleanAvatar(msg.avatar) });
      await this.announceMembers();
    }

    if (msg.t === "remove") {
      // The host edits its own queue. A co-host may take out any song, a member only their own;
      // the host's Kodama then removes it.
      if (isHost) return;
      const queue = (await this.ctx.storage.get("queue")) || [];
      const videoId = String(msg.videoId || "");
      const own = queue.some((q) => q.videoId === videoId && q.addedBy?.id === me.id);
      const any = queue.some((q) => q.videoId === videoId);
      if (!(own || (role === "cohost" && any))) { send({ t: "error", reason: "remove-not-allowed" }); return; }
      const out = JSON.stringify({ t: "remove", videoId, by: own ? me.id : null });
      for (const other of this.socketsOf(hostId)) { try { other.send(out); } catch { /* gone */ } }
    }

    if (msg.t === "ready") {
      const ready = typeof msg.videoId === "string" ? msg.videoId.slice(0, 32) : "";
      if (ready === me.ready) return;
      ws.serializeAttachment({ ...me, ready });
      this.broadcast({ t: "members", list: await this.members() });
    }

    if (msg.t === "add") {
      if (role === "listener") { send({ t: "error", reason: "add-not-allowed" }); return; }
      if (now - (me.lastAdd || 0) < ADD_GAP) return;
      const track = cleanTrack(msg.track);
      if (!track) return;
      delete track.addedBy;   // who added it is the room's to say, not the sender's
      ws.serializeAttachment({ ...me, lastAdd: now });
      const out = JSON.stringify({ t: "add", track, mode: msg.mode === "next" ? "next" : "end", from: me.name, fromId: me.id });
      for (const other of this.socketsOf(hostId)) { try { other.send(out); } catch { /* gone */ } }
    }
  }

  // Into the room proper: a role for a newcomer (the room's default), the welcome, everyone told.
  async admit(ws, base, isHost) {
    const roles = await this.roles();
    const config = await this.config();
    if (!isHost && !roles[base.id]) {
      roles[base.id] = config.newRole;
      await this.ctx.storage.put("roles", roles);
    }
    ws.serializeAttachment({ ...base, joined: true, waiting: false });
    if (isHost) await this.ctx.storage.delete("hostGoneAt");
    const role = isHost ? "host" : roles[base.id];
    ws.send(JSON.stringify({
      t: "welcome", you: { id: base.id, host: isHost, role },
      state: await this.ctx.storage.get("state"), queue: (await this.ctx.storage.get("queue")) || [],
      config, members: await this.members(), s: Date.now(),
    }));
    await this.announceMembers();
    if (isHost || role === "cohost") ws.send(JSON.stringify({ t: "waiting", list: this.waiting() }));
    await this.schedule();
  }

  async webSocketClose(ws) {
    try { ws.close(); } catch { /* already closed */ }
    await this.leave(ws);
  }
  async webSocketError(ws) { await this.leave(ws); }

  async leave(ws) {
    if (!(await this.ctx.storage.get("state"))) return;   // closed: nothing left to tell
    const a = ws.deserializeAttachment();
    // The host gone, with nobody else holding the host's id: the room waits a minute for them.
    if (a?.joined && a.id === (await this.hostId()) && !this.socketsOf(a.id).some((o) => o !== ws && o.deserializeAttachment()?.joined)) {
      await this.ctx.storage.put("hostGoneAt", Date.now());
    }
    await this.announceMembers(ws);
    await this.schedule(ws);
  }

  // An empty room is removed. A room whose host has been gone a minute goes to the first
  // co-host, or else to whoever has been in it longest.
  async alarm() {
    const members = await this.members();
    if (members.length === 0 && this.waiting().length === 0) {
      await this.ctx.storage.deleteAll();
      return;
    }
    const gone = await this.ctx.storage.get("hostGoneAt");
    if (!gone || members.some((m) => m.host)) { await this.schedule(); return; }
    if (Date.now() < gone + HOST_HANDOVER) { await this.schedule(); return; }
    const next = [...members].sort((x, y) =>
      (y.role === "cohost") - (x.role === "cohost") || x.joinedAt - y.joinedAt)[0];
    await this.ctx.storage.delete("hostHash");
    await this.setHost(next.id, "auto");
    await this.schedule();
  }
}
