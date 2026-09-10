// Running a panel extension: the frame, the wiring, and the ways it is stopped.
//
// ─── The two things that make this a sandbox ─────────────────────────────────
//
// 1. sandbox="allow-scripts" and NOT allow-same-origin. Those two together are the classic
//    mistake: a frame with both can reach through to its own origin, which is the host's, and the
//    sandbox becomes decoration. Without allow-same-origin the frame has an opaque origin, so
//    localStorage throws, cookies are gone and there is nothing of Kodama's to read.
//
// 2. Messages are matched on event.source, not on event.origin. An opaque origin reports itself
//    as the string "null", and every other opaque frame reports the same, so origin cannot tell
//    two extensions apart. The window handle can.
//
// The reverse direction has to use "*" as the target origin, because "null" is not addressable.
// That is safe here only because nothing sent to an extension is a secret: it is the answer to a
// question that extension just asked.
import { createDispatcher } from "./bridge.js";
import { guestDocument } from "./guest.js";
import { API_VERSION } from "./manifest.js";

/** Errors from one extension before it is stopped. A crash loop is a stuck app, not a bug report. */
const ERROR_LIMIT = 8;

/**
 * Mount an extension into `container`.
 *
 * `impl` is the map of method implementations. It is passed in rather than imported so this file
 * never reaches into the app itself: whatever an extension can do is assembled by the caller and
 * handed over, which is the same rule the manifest states, enforced by the shape of the code.
 *
 * Returns a handle with `destroy()`. Call it: an extension left mounted keeps a frame alive, and
 * Kodama has learned once already that panes which are hidden rather than removed go on running.
 */
export function mountExtension({ container, manifest, code, impl, onError }) {
  // An app is a whole application on an origin of its own. It is framed rather than poured into a
  // srcdoc, it keeps that origin, and it is therefore NOT sandboxed away from whatever that origin
  // can reach. That is not a compromise, it is what having an origin means; the manifest says so
  // in words and the tier keeps the shape first-party.
  //
  // In exchange it is the safer of the two to talk to. A real origin can be checked, both on the
  // way in and on the way out, where a panel can only ever be identified by its window handle.
  const framed = manifest.kind === "app";
  const handle = createDispatcher(manifest, impl);
  const frame = document.createElement("iframe");
  let errors = 0;
  let dead = false;

  // allow-same-origin belongs here and nowhere else. The warning it usually carries is about a
  // frame sharing the EMBEDDER's origin, which could then reach through to the host document.
  // An app's origin is not Kodama's, so it reaches its own server and nothing of ours.
  frame.setAttribute("sandbox", framed
    ? "allow-scripts allow-same-origin allow-forms allow-popups"
    : "allow-scripts");
  frame.setAttribute("referrerpolicy", "no-referrer");
  frame.setAttribute("title", manifest.name);
  frame.style.cssText = "border:0;width:100%;height:100%;display:block;background:transparent";
  if (framed) frame.src = manifest.origin + (manifest.entry || "/");
  else frame.srcdoc = guestDocument(code, API_VERSION);

  const stop = (reason) => {
    if (dead) return;
    dead = true;
    window.removeEventListener("message", onMessage);
    frame.remove();
    if (reason) onError?.(reason);
  };

  async function onMessage(e) {
    // The identity check. The window handle always, and for an app the origin as well: it has a
    // real one, so there is a second answer to be had and no reason to accept only the first.
    if (dead || e.source !== frame.contentWindow) return;
    if (framed && e.origin !== manifest.origin) return;
    const msg = e.data;
    if (!msg || typeof msg !== "object") return;

    if (msg.__kodama === "error") {
      if (++errors >= ERROR_LIMIT) {
        stop(`${manifest.name} was stopped after ${ERROR_LIMIT} errors`);
      } else {
        onError?.(String(msg.message || "").slice(0, 300));
      }
      return;
    }
    if (msg.__kodama !== "call") return;

    const reply = await handle(msg);
    if (!reply || dead) return;                       // no id, or torn down while awaiting
    // Addressed to the app's own origin where there is one. "*" is forced only for a panel,
    // whose origin is "null" and cannot be named.
    frame.contentWindow?.postMessage({ __kodama: "reply", ...reply }, framed ? manifest.origin : "*");
  }

  window.addEventListener("message", onMessage);
  container.appendChild(frame);

  return {
    frame,
    destroy: () => stop(null),
    get stopped() { return dead; },
  };
}
