// ListenTogether: rooms where several Kodamas play the same song at the same moment.
//
// No audio passes through here. Every Kodama plays the song from YouTube itself; a room only
// carries WHAT plays and WHERE it is: "this song, at this position, as of this server time".
// Each client syncs its clock to the room and works out where it should be from that.
//
//   POST /rooms                 -> { room, hostToken }    a new room; the token makes its holder host
//   GET  /rooms/<room>/ws        -> WebSocket into the room
//
// Messages, as JSON (client -> room):
//   { t: "hello", name, hostToken?, device? }               join, as host if the token matches;
//                                                           an older socket of the same device is closed
//   { t: "ping", c }                                        clock sync; answered with { t: "pong", c, s }
//   { t: "queue", list: [track] }                           host only: what plays after this song
//   { t: "config", control, waitAll }                       host only: room settings
//   { t: "ready", videoId }                                 this member has that song loaded
//   { t: "add", track, mode }                               a song for the host's queue (if allowed)
//   { t: "set", track, playing, pos, startAt?, rate? }      host only: the new playback state;
//                                                           rate: how fast the host's audio really runs
//                                                           startAt (server ms, at most 5 s ahead)
//                                                           schedules the start for everyone
// (room -> client):
//   { t: "welcome", you, state, members, queue, config, s } after hello
//   { t: "queue", list }
//   { t: "config", control, waitAll }
//   { t: "add", track, mode, from }                         to the host: a member's song
//   { t: "state", track, playing, pos, at, rate }           position `pos` (seconds) at server time `at` (ms),
//                                                           moving `rate` seconds per second
//   { t: "members", list: [{ id, name, host }] }
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
// control: "host" (only the host picks songs) or "everyone" (anyone may add to the queue).
// waitAll: a new song starts once every member has it loaded (or after a few seconds).
const DEFAULT_CONFIG = { control: "host", waitAll: false };
const ADD_GAP = 1000;        // ms: one song request per member this often at most
const QUEUE_MAX = 20;

// A track as the room keeps it: only what a listener needs to load and show it.
const cleanTrack = (t) => t && typeof t.videoId === "string" ? {
  videoId: t.videoId.slice(0, 32),
  title: String(t.title || "").slice(0, 200),
  artists: String(t.artists || "").slice(0, 200),
  thumbnail: String(t.thumbnail || "").slice(0, 500),
  duration: Number(t.duration) || 0,
} : null;
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
      if (await this.ctx.storage.get("hostHash")) return new Response("taken", { status: 409 });
      const { hostHash } = await request.json();
      await this.ctx.storage.put({ hostHash, state: { track: null, playing: false, pos: 0, at: Date.now() } });
      await this.ctx.storage.setAlarm(Date.now() + UNUSED_ROOM_TTL);
      return new Response("ok", { status: 201 });
    }
    if (!(await this.ctx.storage.get("hostHash"))) return json({ error: "no such room" }, 404);
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ id: crypto.randomUUID().slice(0, 8), name: "", host: false, joined: false });
    return new Response(null, { status: 101, webSocket: client });
  }

  // Everyone in the room; `except` leaves out a socket that is closing right now and may still be
  // listed while its close handler runs.
  members(except) {
    return this.ctx.getWebSockets()
      .filter((ws) => ws !== except)
      .map((ws) => ws.deserializeAttachment())
      .filter((a) => a && a.joined)
      .map(({ id, name, host, ready }) => ({ id, name, host, ready: ready || "" }));
  }

  broadcast(msg, except) {
    const text = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws !== except && ws.deserializeAttachment()?.joined) { try { ws.send(text); } catch { /* gone; its close handler tidies up */ } }
    }
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== "string" || raw.length > MAX_MESSAGE) return;
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }
    const me = ws.deserializeAttachment();
    const now = Date.now();

    if (msg.t === "ping") { ws.send(JSON.stringify({ t: "pong", c: msg.c, s: now })); return; }

    if (msg.t === "hello") {
      const hostHash = await this.ctx.storage.get("hostHash");
      const host = typeof msg.hostToken === "string" && msg.hostToken.length > 0 && (await sha256(msg.hostToken)) === hostHash;
      const name = String(msg.name || "").trim().slice(0, 40) || "Listener";
      const device = typeof msg.device === "string" ? msg.device.slice(0, 64) : "";
      // The same Kodama again (a reconnect after a dropped line, a reloaded window): its old
      // socket may not have closed yet and would stand in the member list as a second person.
      if (device) {
        for (const other of this.ctx.getWebSockets()) {
          if (other !== ws && other.deserializeAttachment()?.device === device) {
            other.serializeAttachment({ ...other.deserializeAttachment(), joined: false });
            try { other.close(4000, "replaced"); } catch { /* already gone */ }
          }
        }
      }
      ws.serializeAttachment({ ...me, name, host, device, joined: true });
      await this.ctx.storage.deleteAlarm();   // someone is here: the room stays
      ws.send(JSON.stringify({ t: "welcome", you: { id: me.id, host }, state: await this.ctx.storage.get("state"), queue: (await this.ctx.storage.get("queue")) || [], config: (await this.ctx.storage.get("config")) || DEFAULT_CONFIG, members: this.members(), s: now }));
      this.broadcast({ t: "members", list: this.members() });
      return;
    }

    if (!me?.joined) return;

    if (msg.t === "set") {
      if (!me.host) { ws.send(JSON.stringify({ t: "error", reason: "host-only" })); return; }
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
      if (!me.host) { ws.send(JSON.stringify({ t: "error", reason: "host-only" })); return; }
      const list = (Array.isArray(msg.list) ? msg.list : []).slice(0, QUEUE_MAX).map(cleanTrack).filter(Boolean);
      await this.ctx.storage.put("queue", list);
      this.broadcast({ t: "queue", list }, ws);
    }

    if (msg.t === "config") {
      if (!me.host) { ws.send(JSON.stringify({ t: "error", reason: "host-only" })); return; }
      const config = { control: msg.control === "everyone" ? "everyone" : "host", waitAll: !!msg.waitAll };
      await this.ctx.storage.put("config", config);
      this.broadcast({ t: "config", ...config });
    }

    if (msg.t === "ready") {
      const ready = typeof msg.videoId === "string" ? msg.videoId.slice(0, 32) : "";
      if (ready === me.ready) return;
      ws.serializeAttachment({ ...me, ready });
      this.broadcast({ t: "members", list: this.members() });
    }

    if (msg.t === "add") {
      const config = (await this.ctx.storage.get("config")) || DEFAULT_CONFIG;
      if (!me.host && config.control !== "everyone") { ws.send(JSON.stringify({ t: "error", reason: "add-not-allowed" })); return; }
      if (now - (me.lastAdd || 0) < ADD_GAP) return;
      const track = cleanTrack(msg.track);
      if (!track) return;
      ws.serializeAttachment({ ...me, lastAdd: now });
      const out = JSON.stringify({ t: "add", track, mode: msg.mode === "next" ? "next" : "end", from: me.name });
      for (const other of this.ctx.getWebSockets()) {
        const a = other.deserializeAttachment();
        if (a?.joined && a.host) { try { other.send(out); } catch { /* gone */ } }
      }
    }
  }

  async webSocketClose(ws) {
    try { ws.close(); } catch { /* already closed */ }
    await this.leave(ws);
  }
  async webSocketError(ws) { await this.leave(ws); }

  async leave(ws) {
    const left = this.members(ws);
    this.broadcast({ t: "members", list: left }, ws);
    if (left.length === 0) await this.ctx.storage.setAlarm(Date.now() + EMPTY_ROOM_TTL);
  }

  // Runs when a room has stood empty (or unused) long enough: it is removed entirely.
  async alarm() {
    if (this.members().length > 0) return;
    await this.ctx.storage.deleteAll();
  }
}
