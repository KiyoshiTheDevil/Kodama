# ListenTogether room server

A Cloudflare Worker with one Durable Object per room. It carries only what plays and where
(`this song, at this position, as of this server time`); every Kodama streams the audio itself.
The protocol is described at the top of `worker.js`.

Local:

    npx wrangler dev --port 8787

Kodama Dev connects to `http://localhost:8787` by default; a release build to the deployed worker.
The address can be overridden in the Debug tab (stored as `kodama-together-url`).

Deploy (Workers free plan is enough, rooms use SQLite-backed Durable Objects):

    npx wrangler deploy
