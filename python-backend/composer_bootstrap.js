// Kodama's bootstrap inside the Composer.
//
// Served by Kodama's backend and injected into the Composer's index.html as it goes out, so the
// vendored build is never forked. It is Kodama's code running in the Composer's document: it has
// that document's origin and can therefore do the same-origin work the parent no longer can.
//
// This replaces the Tauri initialization_script that used to do the same three jobs. A frame does
// not get one of those, and that is the point rather than a loss: what used to be Kodama reaching
// into another document is now that document asking, over a channel with a permission behind it.
// It is also the first real user of the extension bridge.
(function () {
  "use strict";

  // Framed by Kodama, or opened on its own? Only the first has a parent to ask, and running the
  // rest anyway would post messages into the void and then wait ten seconds for each.
  if (window.parent === window) return;

  var BRIDGE_URL = window.location.origin + "/composer-bridge";
  var SETTINGS_KEY = "composer-settings";
  var seq = 0;
  var waiting = new Map();

  window.addEventListener("message", function (e) {
    // The parent is the only window that can reach this frame, and the reply carries the id of a
    // call this document made. Anything else is not ours.
    var m = e.data;
    if (!m || m.__kodama !== "reply" || !waiting.has(m.id)) return;
    var w = waiting.get(m.id);
    waiting.delete(m.id);
    clearTimeout(w.timer);
    if (m.ok) w.resolve(m.result);
    else w.reject(new Error((m.error && m.error.message) || "call failed"));
  });

  function call(method, params) {
    return new Promise(function (resolve, reject) {
      var id = String(++seq);
      var timer = setTimeout(function () {
        waiting.delete(id);
        reject(new Error("no reply from Kodama"));
      }, 10000);
      waiting.set(id, { resolve: resolve, reject: reject, timer: timer });
      parent.postMessage({ __kodama: "call", id: id, method: method, params: params || {} }, "*");
    });
  }

  // ── 1. The audio bridge ────────────────────────────────────────────────────
  //
  // Needs no call: the bridge is on this document's own origin, because Kodama serves both. What
  // the init script had to be told, this can simply read off itself.
  try {
    var env = null;
    try { env = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null"); } catch (e) {}
    if (!env || typeof env !== "object") env = { state: {}, version: 2 };
    if (!env.state || typeof env.state !== "object") env.state = {};
    env.state.experiments = Object.assign({}, env.state.experiments, { youtubeBridge: true });
    env.state.composerBridgeUrl = BRIDGE_URL;
    if (typeof env.version !== "number") env.version = 2;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(env));
  } catch (e) { /* private mode: the composer falls back to its own default */ }

  // ── 2. Kodama's colours ────────────────────────────────────────────────────
  //
  // The mapping from Kodama's tokens to the Composer's lives here, on Kodama's side, because it is
  // knowledge about the Composer and not about themes. appearance.get answers with resolved
  // values, which is the only answer that still works for a theme published after this was
  // written: an id would be a word this code has never heard.
  function paint(look) {
    var c = look.colors || {};
    var pairs = [
      ["--color-composer-accent", c.accent],
      ["--color-composer-accent-dark", c.accent],
      ["--color-composer-accent-darker", c.accent],
      ["--color-composer-accent-text", c.accent],
      ["--color-composer-link", c.accent],
    ];
    // The Composer is dark-only. Its surfaces are themed only when Kodama is dark too, keyed on
    // the mode rather than the theme's name: a theme installed rather than shipped is not called
    // "light" even when it is one, and would have had a dark composer painted over it.
    if (look.mode !== "light") {
      pairs.push(
        ["--color-composer-bg", c.bgBase],
        ["--color-composer-bg-dark", c.bgBase],
        ["--color-composer-bg-elevated", c.bgElevated],
        ["--color-composer-border", c.border],
        ["--color-composer-border-hover", c.bgHover],
        ["--color-composer-button", c.bgElevated],
        ["--color-composer-button-hover", c.bgHover],
        ["--color-composer-input", c.bgElevated],
        ["--color-composer-text", c.textPrimary],
        ["--color-composer-text-secondary", c.textSecondary],
        ["--color-composer-text-muted", c.textMuted],
        ["--color-composer-text-tertiary", c.textMuted]
      );
    }
    var apply = function () {
      var r = document.documentElement;
      if (!r) return;
      pairs.forEach(function (p) {
        // Inline !important beats any author rule whatever the layer order, which is what the
        // init script relied on and is still the reason this works at all.
        if (p[1]) r.style.setProperty(p[0], p[1], "important");
      });
    };
    apply();
    document.addEventListener("DOMContentLoaded", apply);
  }

  // ── 3. Inter ───────────────────────────────────────────────────────────────
  function font() {
    var ff = '"Inter", system-ui, sans-serif';
    var run = function () {
      try {
        if (!document.getElementById("__kodama_inter")) {
          var l = document.createElement("link");
          l.id = "__kodama_inter";
          l.rel = "stylesheet";
          l.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap";
          var h = document.head || document.documentElement;
          if (h) h.appendChild(l);
        }
        var r = document.documentElement;
        if (r) r.style.setProperty("--font-family-sans", ff, "important");
        if (document.body) document.body.style.setProperty("font-family", ff, "important");
      } catch (e) {}
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
    else run();
    window.addEventListener("load", run);
  }

  font();
  call("appearance.get").then(paint).catch(function () {
    // Kodama did not answer, or did not grant it. The Composer keeps its own colours, which is a
    // working Composer that looks like itself rather than a broken one.
  });
})();
