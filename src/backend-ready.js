// The window opens faster than the Python backend starts, above all on a cold start, where the
// packed server first unpacks itself. Every view used to fire its first requests into a closed
// port: the home page landed on "No suggestions" with its refresh button, and covers stayed on
// their placeholder. Retrying in each place was a patchwork that gave up too early. Instead,
// every request to the backend waits here until it answers once, so no caller has to know.
import { API } from "./context.jsx";

// Long enough for a slow first start, short enough that a backend that never comes still ends
// in the views' own error states instead of a frozen app.
const GIVE_UP_MS = 30000;

const realFetch = window.fetch.bind(window);

let resolveReady;
export const backendReady = new Promise((res) => { resolveReady = res; });

async function probe() {
  const start = Date.now();
  while (Date.now() - start < GIVE_UP_MS) {
    try {
      const r = await realFetch(`${API}/status`, { cache: "no-store" });
      if (r.ok) { resolveReady(true); return; }
    } catch { /* not listening yet */ }
    await new Promise((res) => setTimeout(res, 150));
  }
  console.warn("[boot] backend did not answer within " + GIVE_UP_MS + " ms");
  resolveReady(false);
}

export function installBackendGate() {
  window.fetch = (input, init) => {
    const url = typeof input === "string" ? input : input?.url || String(input);
    if (!url.startsWith(API) && !url.startsWith("http://127.0.0.1:9847")) return realFetch(input, init);
    return backendReady.then(() => realFetch(input, init));
  };
  probe();
}
