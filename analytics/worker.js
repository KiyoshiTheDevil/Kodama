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

// The second argument used to be spread straight into `headers`, so `{ status: 404 }`
// became a header called "status" and every response — including errors — went out as
// HTTP 200. Headers and status are separate now.
function json(body, { headers = {}, status = 200 } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...CORS, ...headers },
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

// Dimension values land in KV key names, and anyone can POST to /ping — so they are
// validated, not trusted. Anything unexpected is bucketed as "other" rather than dropped,
// which keeps the daily totals across a dimension adding up to the DAU count.
const DIM_OK = /^[A-Za-z0-9._-]{1,32}$/;
const OS_OK = new Set(["windows", "macos", "linux"]);
function dim(value, allowed) {
  const v = typeof value === "string" ? value : "";
  if (allowed) return allowed.has(v) ? v : "other";
  return DIM_OK.test(v) ? v : "other";
}

async function readCount(env, key) {
  const v = await env.STATS.get(key);
  return v ? parseInt(v, 10) || 0 : 0;
}

// Increment a counter (read-modify-write). KV is eventually consistent, not
// transactional, so a rare concurrent collision may drop a count — acceptable
// for a vanity counter. `ttl` keeps old daily/monthly keys from piling up.
async function incr(env, key) {
  const n = (await readCount(env, key)) + 1;
  // The value is mirrored into the key's metadata: KV list() hands metadata back with the
  // key names, so /history reads a whole series in one round trip instead of one get per
  // day. No expirationTtl — these counters ARE the history now.
  await env.STATS.put(key, String(n), { metadata: { n } });
}


/**
 * GitHub only ever reports a release's *total* downloads, so "downloads in month X" cannot
 * be reconstructed after the fact — it has to be sampled. This records one snapshot a day;
 * the stats page turns consecutive snapshots into per-month deltas.
 */
async function snapshotDownloads(env) {
  // Unauthenticated GitHub allows 60 requests/hour PER IP, and Workers egress from shared
  // addresses — so a third of the daily crons were being refused with 403 and
  // x-ratelimit-remaining: 0, at the exact cron minute, through no fault of ours.
  // An authenticated call is counted per token instead: 5000/hour, and the token needs no
  // scopes at all because the release list is public.
  //   npx wrangler secret put GITHUB_TOKEN
  const URL_RELEASES = "https://api.github.com/repos/KiyoshiTheDevil/Kodama/releases?per_page=100";
  const call = (token) => fetch(URL_RELEASES, {
    headers: {
      "User-Agent": "kodama-stats-worker",
      Accept: "application/vnd.github+json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });

  let r = await call(env.GITHUB_TOKEN);
  let fellBack = false;

  // A token that has expired or been revoked answers 401 (or 403) to every single call, which
  // would be strictly worse than having none at all — unauthenticated, two runs in three still
  // get through. So a rejected authenticated call is retried without the header, and the note
  // below records that it happened, because the snapshot then succeeds and nothing else would
  // ever mention that the token has stopped working.
  if (!r.ok && env.GITHUB_TOKEN && (r.status === 401 || r.status === 403)) {
    const retried = await call(null);
    if (retried.ok) { r = retried; fellBack = true; }
    else {
      // Keep the authenticated response: with no token the answer is the ordinary rate limit
      // and says nothing about why the token was refused.
      await env.STATS.put("dlerr:last", JSON.stringify({
        at: new Date().toISOString(),
        status: r.status,
        remaining: r.headers.get("x-ratelimit-remaining"),
        authed: true,
        retriedAnon: retried.status,
      }), { expirationTtl: 60 * 60 * 24 * 7 });
      return { at: new Date().toISOString(), status: r.status, authed: true, retriedAnon: retried.status };
    }
  }

  if (!r.ok) {
    // Record why instead of returning in silence: a cron that never produces data looks
    // identical to one that never ran, and that ambiguity cost a month of guessing.
    const note = {
      at: new Date().toISOString(),
      status: r.status,
      remaining: r.headers.get("x-ratelimit-remaining"),
      authed: !!env.GITHUB_TOKEN,
    };
    await env.STATS.put("dlerr:last", JSON.stringify(note), { expirationTtl: 60 * 60 * 24 * 7 });
    return note;
  }

  if (fellBack) {
    // Not an error: the day's figure was written. It is a warning that the token is dead.
    await env.STATS.put("dlerr:last", JSON.stringify({
      at: new Date().toISOString(),
      status: 200,
      authed: true,
      note: "token rejected, fell back to unauthenticated",
    }), { expirationTtl: 60 * 60 * 24 * 7 });
  }
  const releases = await r.json();
  const perTag = {};
  let total = 0;
  for (const rel of releases) {
    const n = (rel.assets || []).reduce((sum, a) => sum + (a.download_count || 0), 0);
    perTag[rel.tag_name] = n;
    total += n;
  }
  await env.STATS.put(`dl:${todayUTC()}`, JSON.stringify({ total, perTag }), { metadata: { n: total } });
  return {
    at: new Date().toISOString(), status: 200, total,
    releases: Object.keys(perTag).length,
    authed: !!env.GITHUB_TOKEN && !fellBack,
    ...(fellBack ? { warning: "GITHUB_TOKEN was rejected, used an unauthenticated call" } : {}),
  };
}

/**
 * Monthly counters only keep growing while pings arrive, so a month that has ended is never
 * touched again. Re-writing the previous month once a day carries it past the 40-day expiry
 * the old code set on it — without this, everything before the switch to permanent counters
 * quietly disappears.
 */
async function preservePreviousMonth(env) {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - 1);
  const key = `mau:${d.toISOString().slice(0, 7)}`;
  const n = await readCount(env, key);
  if (n > 0) await env.STATS.put(key, String(n), { metadata: { n } });
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(Promise.all([snapshotDownloads(env), preservePreviousMonth(env)]));
  },

  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    // ── POST /ping ──────────────────────────────────────────────────────────
    if (url.pathname === "/ping" && request.method === "POST") {
      let d, m, v, os, l;
      try {
        const b = await request.json();
        d = b.d; m = b.m; v = b.v; os = b.os; l = b.l;
      } catch { /* ignore malformed */ }
      if (!HEX64.test(d || "") || !HEX64.test(m || "")) {
        return json({ ok: false }, { status: 400 });
      }
      const day = todayUTC();
      const month = monthUTC();

      // DAU — no server dedup (client already pings once/day/install). 1 write.
      await incr(env, `dau:${day}`);

      // One counter per dimension per day. Costs one KV write each — see the budget note
      // above; the stats page shows how close the total is running to the daily ceiling.
      await incr(env, `ver:${day}:${dim(v)}`);
      await incr(env, `os:${day}:${dim(os, OS_OK)}`);
      await incr(env, `lang:${day}:${dim(l)}`);

      // MAU — dedup on the stable monthly token so repeat pings are free.
      const seenKey = `seen:m:${month}:${m}`;
      if (!(await env.STATS.get(seenKey))) {
        await env.STATS.put(seenKey, "1", { expirationTtl: 60 * 60 * 24 * 40 });
        await incr(env, `mau:${month}`);
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
        { headers: { "Cache-Control": "max-age=300" } },
      );
    }


    // ── GET /snapshot ───────────────────────────────────────────────────────
    // Runs the daily job on demand. Idempotent: if today's snapshot already exists it
    // reports that and writes nothing, so this can't be used to burn through KV writes.
    if (url.pathname === "/snapshot") {
      const key = `dl:${todayUTC()}`;
      const existing = await env.STATS.get(key);
      if (existing) {
        return json({ ok: true, already: true, day: todayUTC(), data: JSON.parse(existing) });
      }
      const result = await snapshotDownloads(env);
      const lastErr = await env.STATS.get("dlerr:last");
      return json({ ok: !!(result && result.status === 200), result, lastError: lastErr ? JSON.parse(lastErr) : null });
    }

    // ── GET /history ────────────────────────────────────────────────────────
    // The whole series at once, for the local stats page (tools/stats.html).
    if (url.pathname === "/history") {
      const out = { dau: {}, mau: {}, dl: {}, ver: {}, os: {}, lang: {} };

      // Nested dimensions: key is `<prefix>:<day>:<value>`, grouped per day for the page.
      for (const [prefix, bucket] of [["ver:", out.ver], ["os:", out.os], ["lang:", out.lang]]) {
        let cursor;
        do {
          const r = await env.STATS.list({ prefix, cursor });
          for (const k of r.keys) {
            const rest = k.name.slice(prefix.length);
            const cut = rest.indexOf(":");
            if (cut < 0) continue;
            const day = rest.slice(0, cut);
            const value = rest.slice(cut + 1);
            const n = (k.metadata && typeof k.metadata.n === "number")
              ? k.metadata.n
              : await readCount(env, k.name);
            (bucket[day] ||= {})[value] = n;
          }
          cursor = r.list_complete ? null : r.cursor;
        } while (cursor);
      }

      for (const [prefix, bucket] of [["dau:", out.dau], ["mau:", out.mau], ["dl:", out.dl]]) {
        let cursor;
        do {
          const r = await env.STATS.list({ prefix, cursor });
          for (const k of r.keys) {
            const day = k.name.slice(prefix.length);
            // Counters written before metadata existed need a real read. Only ever a
            // handful of keys, and they get metadata the next time they are touched.
            bucket[day] = (k.metadata && typeof k.metadata.n === "number")
              ? k.metadata.n
              : await readCount(env, k.name);
          }
          cursor = r.list_complete ? null : r.cursor;
        } while (cursor);
      }
      return json(out, { headers: { "Cache-Control": "max-age=300" } });
    }

    return json({ ok: false, error: "not found" }, { status: 404 });
  },
};
