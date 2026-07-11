# Kodama Analytics

Two independent numbers, both privacy-respecting:

1. **Total downloads** — served straight from the GitHub Release API, no infrastructure of our own. Just a shields.io badge (see below).
2. **Active users** — an anonymous daily/monthly heartbeat counted by a tiny Cloudflare Worker (`worker.js`).

## Privacy model (active users)

The app **never sends its raw install id**. On each heartbeat it computes, locally via WebCrypto:

```
d = SHA-256( installId + ":" + "YYYY-MM-DD" )   // daily rotating token
m = SHA-256( installId + ":" + "YYYY-MM" )       // monthly rotating token
```

The Worker only ever sees `d` and `m`. Consequences:

- We can count **unique active installs per day (DAU)** and **per month (MAU)**.
- The token **cannot be reversed** to an id (install id is 122-bit random).
- A device **cannot be linked across days** — the daily token changes every midnight UTC.
- Only **aggregate integer counters** are persisted; the tokens live in short-TTL dedup keys that auto-expire (48 h daily, ~40 d monthly).

It is **opt-out** in Settings → Privacy, and the install id / heartbeat never run when disabled.

## Deploy

```bash
cd analytics
npm i -g wrangler            # or: npx wrangler ...
wrangler login
wrangler kv namespace create STATS   # copy the printed id into wrangler.toml
wrangler deploy
```

This publishes e.g. `https://kodama-stats.<your-subdomain>.workers.dev`.

Then set that base URL as `STATS_URL` in `src/App.jsx` (search for `STATS_URL`) **and** add the host to the CSP `connect-src` in both `index.html` and `src-tauri/tauri.conf.json`.

## Routes

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/ping` | Body `{ d, m, v? }` — count one active install for today/this month |
| GET | `/count` | `{ day, dau, month, mau }` — raw JSON (for a website counter) |
| GET | `/badge` | shields.io endpoint JSON (active **today**) |
| GET | `/badge?metric=mau` | shields.io endpoint JSON (active **this month**) |

## Badges (README)

**Downloads (no Worker needed):**

```markdown
![Downloads](https://img.shields.io/github/downloads/KiyoshiTheDevil/Kodama/total?label=downloads&color=blueviolet)
```

**Active users (via the Worker's shields endpoint):**

```markdown
![Active users](https://img.shields.io/endpoint?url=https%3A%2F%2Fkodama-stats.YOURSUB.workers.dev%2Fbadge%3Fmetric%3Dmau)
```

(URL-encode the Worker `/badge` URL as the `url=` parameter.)
