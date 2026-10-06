# ListenTogether room server

A Cloudflare Worker with one Durable Object per room. It carries only what plays and where
(`this song, at this position, as of this server time`); every Kodama streams the audio itself.
The protocol is described at the top of `worker.js`.

Local:

    npx wrangler dev --port 8787

Kodama connects to the deployed worker; for a local server set `http://localhost:8787` in the Debug tab.

Deploy (Workers free plan is enough, rooms use SQLite-backed Durable Objects):

    npx wrangler deploy
