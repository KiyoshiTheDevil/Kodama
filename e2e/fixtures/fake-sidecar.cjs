const http = require("node:http");
const { URL } = require("node:url");

const { clone, fixtures } = require("./data.cjs");

const HOST = "127.0.0.1";
const PORT = 9847;
const CONTROL_PREFIX = "/__e2e__/";

function createState() {
  return { preset: "firstRun", requests: [], routes: new Map(), sseClients: new Map() };
}

function routeKey(method, pathname) {
  return `${method.toUpperCase()} ${pathname}`;
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function sendJson(response, status, body, headers = {}) {
  response.writeHead(status, {
    "access-control-allow-origin": "*",
    "content-type": "application/json; charset=utf-8",
    ...headers,
  });
  response.end(JSON.stringify(body));
}

function defaultResponse(state, request, url) {
  const { pathname } = url;
  const profiles = fixtures.profiles[state.preset] || fixtures.profiles.firstRun;

  if (pathname === "/profiles") return { body: profiles };
  if (pathname === "/auth/validate") return { body: { valid: state.preset !== "firstRun" } };
  if (pathname === "/status") return { body: { ok: true, connected: true } };
  if (pathname === "/liked/ids") return { body: { ids: [] } };
  if (pathname === "/liked") return { body: { tracks: [] } };
  if (pathname === "/home") return { body: fixtures.home };
  if (pathname === "/mood/categories")
    return { body: { "For you": [{ title: "Fixture focus", params: "fixture-focus" }] } };
  if (pathname === "/mood/playlists")
    return {
      body: [
        {
          playlistId: "playlist-fixture",
          title: "Fixture Playlist",
          thumbnail: fixtures.tracks.normalTrack.thumbnail,
        },
      ],
    };
  if (pathname === "/search" || pathname === "/search/suggestions")
    return {
      body: pathname.endsWith("suggestions")
        ? [fixtures.tracks.normalTrack.title]
        : fixtures.search,
    };
  if (pathname === "/library/playlists") return { body: { playlists: fixtures.library.playlists } };
  if (pathname === "/library/albums") return { body: { albums: fixtures.library.albums } };
  if (pathname === "/library/artists") return { body: { artists: fixtures.library.artists } };
  if (pathname === "/news") return { body: [] };
  if (pathname === "/ffmpeg/status") return { body: { installed: true, available: true } };
  if (pathname === "/ffmpeg/check-update" || pathname === "/ytdlp/check-update")
    return { body: { available: false } };
  if (pathname === "/cache/stats") return { body: { usedBytes: 0, files: 0 } };
  if (pathname === "/api/local-fonts") return { body: { fonts: [] } };
  if (pathname === "/remote/_status") return { body: { enabled: false, devices: [] } };
  if (pathname === "/lastfm/status") return { body: { connected: false } };
  if (pathname === "/overlay/config") return { body: {} };
  if (pathname.startsWith("/__e2e__/external")) return { body: [] };

  if (request.method === "POST" || request.method === "PUT" || request.method === "DELETE") {
    return { body: { ok: true } };
  }
  return { status: 404, body: { error: `Unmocked fixture route: ${request.method} ${pathname}` } };
}

function sendSse(response, events) {
  response.writeHead(200, {
    "access-control-allow-origin": "*",
    "cache-control": "no-cache",
    connection: "keep-alive",
    "content-type": "text/event-stream",
  });
  for (const event of events || []) response.write(`data: ${JSON.stringify(event)}\n\n`);
  response.end();
}

function createFakeSidecar() {
  const state = createState();
  const server = http.createServer(async (request, response) => {
    const url = new URL(request.url, `http://${HOST}:${PORT}`);
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-methods": "*",
        "access-control-allow-headers": "content-type",
      });
      response.end();
      return;
    }

    if (url.pathname.startsWith(CONTROL_PREFIX)) {
      if (url.pathname === `${CONTROL_PREFIX}health`) return sendJson(response, 200, { ok: true });
      const body = await readJson(request);
      if (url.pathname === `${CONTROL_PREFIX}reset`) {
        state.preset = body.preset || "firstRun";
        state.requests = [];
        state.routes.clear();
        return sendJson(response, 200, { ok: true, preset: state.preset });
      }
      if (url.pathname === `${CONTROL_PREFIX}route`) {
        state.routes.set(routeKey(body.method || "GET", body.pathname), body.response || {});
        return sendJson(response, 200, { ok: true });
      }
      if (url.pathname === `${CONTROL_PREFIX}requests`)
        return sendJson(response, 200, { requests: state.requests });
      if (url.pathname === `${CONTROL_PREFIX}clear-requests`) {
        state.requests = [];
        return sendJson(response, 200, { ok: true });
      }
      if (url.pathname === `${CONTROL_PREFIX}shutdown`) {
        sendJson(response, 200, { ok: true });
        server.close();
        return;
      }
      return sendJson(response, 404, { error: "Unknown fixture control" });
    }

    const requestRecord = {
      method: request.method,
      pathname: url.pathname,
      query: Object.fromEntries(url.searchParams),
      timestamp: new Date().toISOString(),
    };
    const rawBody = await readJson(request);
    if (Object.keys(rawBody).length > 0) requestRecord.body = rawBody;
    state.requests.push(requestRecord);

    const configured = state.routes.get(routeKey(request.method, url.pathname));
    const responseSpec = configured || defaultResponse(state, request, url);
    if (responseSpec.disconnect) return request.socket.destroy();
    if (responseSpec.delayMs)
      await new Promise((resolve) => setTimeout(resolve, responseSpec.delayMs));
    if (responseSpec.sse) return sendSse(response, responseSpec.sse);
    return sendJson(
      response,
      responseSpec.status || 200,
      clone(responseSpec.body || {}),
      responseSpec.headers
    );
  });

  return { server, state };
}

if (require.main === module) {
  const { server } = createFakeSidecar();
  server.listen(PORT, HOST, () => console.log(`Fake Kodama sidecar listening on ${HOST}:${PORT}`));
}

module.exports = { createFakeSidecar };
