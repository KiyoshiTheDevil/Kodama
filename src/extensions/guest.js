// The shim that runs inside an extension's iframe, as source text.
//
// A string rather than a module, because it is injected into a document that has no origin in
// common with Kodama and therefore cannot import anything from it. It is written into the frame
// ahead of the extension's own code, and is the only thing in there that can talk to the host.
//
// Everything it exposes is a call that returns a promise. Nothing is a handle: an extension never
// gets an object belonging to Kodama, so there is nothing to reach through.

export const GUEST_SHIM = `
(function () {
  var seq = 0;
  var waiting = new Map();

  // Replies come back through the one channel the frame has. The parent is the only sender that
  // can reach it, so there is nothing to check the sender against here: any other window would
  // need a handle to this frame, and having one already means the host is compromised.
  window.addEventListener("message", function (e) {
    var m = e.data;
    if (!m || m.__kodama !== "reply" || !waiting.has(m.id)) return;
    var w = waiting.get(m.id);
    waiting.delete(m.id);
    clearTimeout(w.timer);
    if (m.ok) w.resolve(m.result);
    else {
      var err = new Error(m.error && m.error.message || "call failed");
      err.code = m.error && m.error.code;
      w.reject(err);
    }
  });

  function call(method, params) {
    return new Promise(function (resolve, reject) {
      var id = String(++seq);
      // A host that never answers must not leave the extension waiting for the life of the
      // window. Ten seconds is long enough for a network call the host makes on its behalf.
      var timer = setTimeout(function () {
        waiting.delete(id);
        reject(new Error("no reply from Kodama"));
      }, 10000);
      waiting.set(id, { resolve: resolve, reject: reject, timer: timer });
      parent.postMessage({ __kodama: "call", id: id, method: method, params: params || {} }, "*");
    });
  }

  window.kodama = {
    version: __API_VERSION__,
    storage: {
      get: function (key) { return call("storage.get", { key: key }); },
      set: function (key, value) { return call("storage.set", { key: key, value: value }); },
      remove: function (key) { return call("storage.remove", { key: key }); },
      keys: function () { return call("storage.keys"); },
    },
    appearance: { get: function () { return call("appearance.get"); } },
    player: {
      get: function () { return call("player.get"); },
      play: function () { return call("player.play"); },
      pause: function () { return call("player.pause"); },
      next: function () { return call("player.next"); },
      previous: function () { return call("player.previous"); },
    },
    ui: { toast: function (text, kind) { return call("ui.toast", { text: text, kind: kind }); } },
    net: { fetch: function (url, init) { return call("net.fetch", { url: url, init: init }); } },
  };

  // An extension that throws on load should say so to the host rather than dying quietly inside
  // a frame nobody can see into. The host counts these and stops an extension that keeps failing.
  window.addEventListener("error", function (e) {
    parent.postMessage({ __kodama: "error", message: String(e.message || "error") }, "*");
  });
  window.addEventListener("unhandledrejection", function (e) {
    parent.postMessage({ __kodama: "error", message: String((e.reason && e.reason.message) || e.reason || "rejection") }, "*");
  });
})();
`;

/**
 * The document an extension runs in.
 *
 * Its own content policy on top of the sandbox attribute, because the two stop different things:
 * the sandbox decides what the frame IS (no origin, no navigation, no popups), the policy decides
 * where its content may come FROM. `connect-src 'none'` is the important line, and it is not
 * redundant with the host allowlist: it means an extension cannot reach the network at all except
 * by asking the host, so there is exactly one place where the allowlist has to be right.
 */
export function guestDocument(code, apiVersion) {
  const shim = GUEST_SHIM.replace("__API_VERSION__", JSON.stringify(apiVersion));
  return `<!doctype html><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'">
<style>html,body{margin:0;height:100%;font:14px system-ui;color:#fff;background:transparent}</style>
<body><div id="root"></div>
<script>${shim}</script>
<script>${code}</script>`;
}
