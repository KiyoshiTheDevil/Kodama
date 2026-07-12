/**
 * Kodama — anonymous active-user counter (Cloudflare Worker)
 * ----------------------------------------------------------
 * Privacy model: the app NEVER sends its raw install id. It hashes it locally
 * (WebCrypto SHA-256) together with the current day / month, so this Worker only
 * ever sees an opaque, per-day and per-month rotating token. That means:
 *   - we can count unique active installs per day (DAU) and per month (MAU),
 *   - but we can neither reverse the token to an identity nor link a device
 *     across days (the daily token changes every midnight UTC).
 * Only aggregate integer counters are ever persisted.
 *
 * KV-write budget (Cloudflare free tier = 1,000 writes/day):
 *   - DAU: the app self-limits to ONE ping/day/install (localStorage guard), so
 *     we skip a server-side daily dedup write and just bump a per-day counter
 *     -> ~1 write per active user per day.
 *   - MAU: dedup on the stable monthly token, so repeat pings within the month
 *     are free; only a brand-new monthly-unique costs writes -> ~2 writes per
 *     user per MONTH (negligible per day).
 *   => ~1 write/user/day, i.e. a free-tier ceiling of ~1,000 daily-active users.
 *   Beyond that: Workers Paid ($5/mo) raises KV to 1M writes/day with NO code
 *   change, or switch to Analytics Engine for effectively unlimited writes.
 *
 * Bindings (wrangler.toml): KV namespace STATS (required).
 *
 * Routes:
 *   POST /ping    body: { d, m, v? }   d = daily token, m = monthly token, v = app version
 *   GET  /count                        -> { day, dau, month, mau }
 *   GET  /badge                        -> shields.io endpoint JSON (active users)
 *   GET  /badge?metric=mau             -> shields.io endpoint JSON (monthly)
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
};

function json(body, extra = {}) {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json", ...CORS, ...extra },
  });
}

const todayUTC = () => new Date().toISOString().slice(0, 10); // YYYY-MM-DD
const monthUTC = () => new Date().toISOString().slice(0, 7);  // YYYY-MM

// reject anything that isn't a 64-char sha-256 hex digest
const HEX64 = /^[0-9a-f]{64}$/;

function human(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  return String(n);
}

async function readCount(env, key) {
  const v = await env.STATS.get(key);
  return v ? parseInt(v, 10) || 0 : 0;
}

// Increment a counter (read-modify-write). KV is eventually consistent, not
// transactional, so a rare concurrent collision may drop a count — acceptable
// for a vanity counter. `ttl` keeps old daily/monthly keys from piling up.
async function incr(env, key, ttl) {
  const cur = await readCount(env, key);
  await env.STATS.put(key, String(cur + 1), ttl ? { expirationTtl: ttl } : undefined);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    // ── POST /ping ──────────────────────────────────────────────────────────
    if (url.pathname === "/ping" && request.method === "POST") {
      let d, m;
      try {
        const b = await request.json();
        d = b.d; m = b.m;
      } catch { /* ignore malformed */ }
      if (!HEX64.test(d || "") || !HEX64.test(m || "")) {
        return json({ ok: false }, { status: 400 });
      }
      const day = todayUTC();
      const month = monthUTC();

      // DAU — no server dedup (client already pings once/day/install). 1 write.
      // TTL 48h: only today's key is ever read.
      await incr(env, `dau:${day}`, 60 * 60 * 48);

      // MAU — dedup on the stable monthly token so repeat pings are free.
      const seenKey = `seen:m:${month}:${m}`;
      if (!(await env.STATS.get(seenKey))) {
        await env.STATS.put(seenKey, "1", { expirationTtl: 60 * 60 * 24 * 40 });
        await incr(env, `mau:${month}`, 60 * 60 * 24 * 40);
      }
      return json({ ok: true });
    }

    // ── GET /count ──────────────────────────────────────────────────────────
    if (url.pathname === "/count") {
      const day = todayUTC();
      const month = monthUTC();
      return json({
        day,
        dau: await readCount(env, `dau:${day}`),
        month,
        mau: await readCount(env, `mau:${month}`),
      });
    }

    // ── GET /badge  (shields.io custom endpoint) ─────────────────────────────
    if (url.pathname === "/badge") {
      const metric = url.searchParams.get("metric") === "mau" ? "mau" : "dau";
      const key = metric === "mau" ? `mau:${monthUTC()}` : `dau:${todayUTC()}`;
      const n = await readCount(env, key);
      return json(
        {
          schemaVersion: 1,
          label: metric === "mau" ? "active this month" : "active today",
          message: human(n),
          color: "blueviolet",
        },
        { "Cache-Control": "max-age=300" },
      );
    }

    return json({ ok: false, error: "not found" }, { status: 404 });
  },
};
