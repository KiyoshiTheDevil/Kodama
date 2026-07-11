/**
 * Kodama — anonymous active-user counter (Cloudflare Worker)
 * ----------------------------------------------------------
 * Privacy model: the app NEVER sends its raw install id. It hashes it locally
 * (WebCrypto SHA-256) together with the current day / month, so this Worker only
 * ever sees an opaque, per-day and per-month rotating token. That means:
 *   - we can count unique active installs per day (DAU) and per month (MAU),
 *   - but we can neither reverse the token to an identity nor link a device
 *     across days (the daily token changes every midnight UTC).
 * Only aggregate integer counters are ever persisted; the tokens live in
 * short-TTL dedup keys that auto-expire.
 *
 * Bindings (set in the Cloudflare dashboard / wrangler.toml):
 *   - KV namespace  STATS   (required)
 *
 * Routes:
 *   POST /ping    body: { d, m, v? }   d = daily token, m = monthly token, v = app version
 *   GET  /count                        -> { day, dau, month, mau }
 *   GET  /badge                        -> shields.io endpoint JSON (active users)
 *   GET  /badge?metric=mau             -> shields.io endpoint JSON (monthly)
 *
 * Deploy: see analytics/README.md
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

function todayUTC() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}
function monthUTC() {
  return new Date().toISOString().slice(0, 7); // YYYY-MM
}

// hex token sanity check — reject anything that isn't a 64-char sha-256 hex digest
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

async function bump(env, dedupKey, counterKey, ttl) {
  // Atomicity note: KV is eventually consistent, not transactional. For an
  // anonymous vanity counter a rare double/skip on concurrent same-token pings
  // is acceptable. The daily per-install client guard makes collisions unlikely.
  if (await env.STATS.get(dedupKey)) return false; // already counted this token
  await env.STATS.put(dedupKey, "1", { expirationTtl: ttl });
  const cur = await readCount(env, counterKey);
  await env.STATS.put(counterKey, String(cur + 1));
  return true;
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
      // daily dedup key expires after 48h; monthly after ~40 days
      await bump(env, `seen:d:${day}:${d}`, `dau:${day}`, 60 * 60 * 48);
      await bump(env, `seen:m:${month}:${m}`, `mau:${month}`, 60 * 60 * 24 * 40);
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
