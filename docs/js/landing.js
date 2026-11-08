// The landing page: development status from status.json, numbers from the stats worker and
// GitHub, and a download that fits the visitor's system.
(function () {
  var ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return ESC[c]; }); }

  // ── Status ────────────────────────────────────────────────────────────
  // Grey-green for the first stage, the full accent for the last.
  function stageColour(i, n) {
    var t = n > 1 ? i / (n - 1) : 1;
    var a = [0x5f, 0x6b, 0x62], b = [0x9b, 0xe3, 0x6d];
    return "rgb(" + a.map(function (v, k) { return Math.round(v + (b[k] - v) * t); }).join(",") + ")";
  }

  function milestones(m) {
    var out = "";
    for (var i = 1; i <= m.count; i++) {
      var state = i < m.current ? "done" : i === m.current ? "now" : "later";
      var fill = state === "done" ? 100 : state === "now" ? Math.round((m.progress || 0) * 100) : 0;
      // The current one starts empty and grows to its value (see below), the others are set.
      out += '<div class="sg ' + state + '"><div class="b"><i style="width:' + (state === "now" ? 0 : fill) + '%" data-fill="' + fill + '"></i></div>' +
        '<span class="t"><span class="w">Milestone </span>' + i + "</span>" +
        (state === "now" && m.eta ? '<span class="eta">ETA ' + esc(m.eta) + "</span>" : "") + "</div>";
    }
    return out;
  }

  function platforms(stages, list) {
    var k = stages.length - 1;
    var ticks = "";
    for (var j = 1; j < k; j++) ticks += '<u style="left:' + (j / k) * 100 + '%"></u>';
    function bar(stage) {
      var i = Math.max(0, stages.indexOf(stage));
      // The first stage already shows a sliver, so it reads as started rather than empty.
      return '<span class="pb"><i style="width:' + Math.max((i / k) * 100, 3) + "%;background:" + stageColour(i, stages.length) + '"></i>' + ticks + "</span>";
    }
    function label(stage) {
      var i = Math.max(0, stages.indexOf(stage));
      return '<span class="s" style="color:' + stageColour(i, stages.length) + '">' + esc(stage) + "</span>";
    }
    var heads = stages.map(function (s, i) { return '<span style="left:' + (i / k) * 100 + '%">' + esc(s) + "</span>"; }).join("");
    var out = '<div class="hd"><span></span><div class="sc">' + heads + "</div><span></span></div>";
    list.forEach(function (p) {
      if (p.children && p.children.length) {
        out += '<div class="grp"><button type="button" class="pr head" aria-expanded="false">' +
          '<span class="n">' + esc(p.name) + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6.5 10l5.5 5.5 5.5-5.5"/></svg></span>' +
          bar(p.stage) + label(p.stage) + '</button><div class="subs">' +
          p.children.map(function (c) { return '<div class="pr sub"><span class="n">' + esc(c.name) + "</span>" + bar(c.stage) + label(c.stage) + "</div>"; }).join("") +
          "</div></div>";
      } else {
        out += '<div class="pr"><span class="n">' + esc(p.name) + "</span>" + bar(p.stage) + label(p.stage) + "</div>";
      }
    });
    return out;
  }

  fetch("status.json", { cache: "no-cache" }).then(function (r) { return r.json(); }).then(function (d) {
    document.getElementById("milestones").innerHTML = milestones(d.milestones);
    // Two frames later, so the empty bar has been drawn and the width change animates.
    var now = document.querySelector(".sg.now .b i");
    if (now) requestAnimationFrame(function () { requestAnimationFrame(function () { now.style.width = now.dataset.fill + "%"; }); });
    var card = document.getElementById("platforms");
    card.innerHTML = platforms(d.stages, d.platforms);
    card.hidden = false;
    card.addEventListener("click", function (e) {
      var b = e.target.closest("button.head"); if (!b) return;
      var open = b.parentNode.classList.toggle("open");
      b.setAttribute("aria-expanded", String(open));
    });
  }).catch(function () {});

  // ── The eyes follow the pointer a little ─────────────────────────────
  // At most 2.5 units of the 48-unit drawing, so they glance rather than roll. Not on touch,
  // and not when the visitor asked for less motion.
  var look = document.querySelector(".eyes .look");
  if (look && matchMedia("(hover: hover)").matches && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    var pending = null, queued = false;
    addEventListener("pointermove", function (e) {
      pending = e;
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () {
        var ev = pending; queued = false;
        var r = look.ownerSVGElement.getBoundingClientRect();
        var dx = ev.clientX - (r.left + r.width / 2), dy = ev.clientY - (r.top + r.height * 0.46);
        var d = Math.hypot(dx, dy) || 1, reach = Math.min(1, d / 400);
        look.style.transform = "translate(" + (dx / d) * 2.5 * reach + "px," + (dy / d) * 2 * reach + "px)";
      });
    }, { passive: true });
    document.documentElement.addEventListener("pointerleave", function () { look.style.transform = ""; });
  }

  // ── A reaction when the eyes are clicked ─────────────────────────────
  // It escalates: one click makes it happy (^^ and a hop), quick clicks startle it, after a few it
  // gets dizzy (spirals, wobbling), then looks unimpressed, and if the clicking goes on it gets
  // angry (red slanted eyes, a shake) and ignores clicks until it has calmed down.
  var eyes = document.querySelector(".eyes");
  var busy = null, streak = 0, last = 0, motion = null;
  var calm = matchMedia("(prefers-reduced-motion: reduce)").matches;
  // The body's movement per reaction; each starts from the pose the previous one was in.
  var MOVES = {
    happy: { ms: 700, easing: "cubic-bezier(.3,.7,.4,1)", frames: [
      { transform: "translateY(-14px) scale(.96,1.05)", offset: .35 }, { transform: "translateY(0) scale(1.05,.95)", offset: .7 }, { transform: "none" }] },
    startle: { ms: 600, easing: "cubic-bezier(.2,.9,.3,1.4)", frames: [
      { transform: "translateY(-6px) scale(.9,1.12)", offset: .3 }, { transform: "none" }] },
    dizzy: { ms: 1500, easing: "ease-in-out", frames: [
      { transform: "rotate(-9deg)", offset: .2 }, { transform: "rotate(7deg)", offset: .4 }, { transform: "rotate(-5deg)", offset: .6 },
      { transform: "rotate(3deg)", offset: .8 }, { transform: "none" }] },
    squint: { ms: 350, easing: "ease-out", frames: [{ transform: "none" }] },
    angry: { ms: 900, easing: "linear", frames: [
      { transform: "translateX(-5px) scale(1.04)", offset: .08 }, { transform: "translateX(5px) scale(1.06)", offset: .18 },
      { transform: "translateX(-5px) scale(1.06)", offset: .28 }, { transform: "translateX(4px) scale(1.05)", offset: .38 },
      { transform: "translateX(-3px) scale(1.04)", offset: .48 }, { transform: "translateX(2px) scale(1.02)", offset: .58 },
      { transform: "none", offset: .7 }, { transform: "none" }] },
    // a small huff now and then while it stays angry
    huff: { ms: 500, easing: "ease-out", frames: [
      { transform: "translateY(-3px) scale(1.07)", offset: .25 }, { transform: "translateX(-3px) scale(1.04)", offset: .5 },
      { transform: "translateX(2px)", offset: .75 }, { transform: "none" }] },
    // one deep breath: in (rises, fills up), hold, out
    calm: { ms: 3000, easing: "ease-in-out", frames: [
      { transform: "translateY(-6px) scale(1.08,1.12)", offset: .42 }, { transform: "translateY(-6px) scale(1.08,1.12)", offset: .55 },
      { transform: "none" }] }
  };
  var ANGRY_MS = 6000, CALM_MS = 3000;
  var angryUntil = 0, huffs = null, page = document.querySelector("main");
  function shakePage(px) {
    if (calm || !page.animate) return;
    page.animate([
      { transform: "none" }, { transform: "translate(" + -px + "px, 2px)" }, { transform: "translate(" + px * .85 + "px, -2px)" },
      { transform: "translate(" + -px * .7 + "px, 1px)" }, { transform: "translate(" + px * .4 + "px, -1px)" }, { transform: "none" }],
      { duration: 450, easing: "ease-out" });
  }
  function move(kind) {
    if (calm || !eyes.animate) return;
    var from = getComputedStyle(eyes).transform;   // mid-hop or mid-wobble: carry on from there
    if (motion) motion.cancel();
    var m = MOVES[kind];
    motion = eyes.animate([{ transform: from === "none" ? "none" : from }].concat(m.frames), { duration: m.ms, easing: m.easing });
  }
  function face(kind) {
    eyes.classList.remove("r-happy", "r-startle", "r-dizzy", "r-squint", "r-angry", "r-calm");
    eyes.classList.add("r-" + kind);
  }
  // Angry: the page turns red with it (body.rage) and shakes, it huffs now and then, then it
  // closes its eyes, takes a deep breath while the red drains away, and is back to normal.
  function rage() {
    angryUntil = Date.now() + ANGRY_MS + CALM_MS;
    clearTimeout(busy);
    document.body.classList.remove("calming");
    document.body.classList.add("rage");
    face("angry"); move("angry"); shakePage(7);
    huffs = setInterval(function () { move("huff"); shakePage(3); }, 1700);
    busy = setTimeout(function () {
      clearInterval(huffs);
      document.body.classList.add("calming");
      document.body.classList.remove("rage");
      face("calm"); move("calm");
      busy = setTimeout(function () {
        eyes.classList.remove("r-calm");
        document.body.classList.remove("calming");
      }, CALM_MS);
    }, ANGRY_MS);
  }
  function react(kind, ms) {
    if (kind === "angry") return rage();
    face(kind);
    clearTimeout(busy);
    busy = setTimeout(function () { eyes.classList.remove("r-" + kind); }, ms);
    move(kind);
  }
  // Quick clicks would select the heading under the eyes.
  if (eyes) eyes.addEventListener("mousedown", function (e) { e.preventDefault(); });
  if (eyes) eyes.addEventListener("click", function () {
    var now = Date.now();
    // While angry it ignores further clicks; once it has calmed down, it starts over.
    if (now < angryUntil) return;
    streak = now - last < 900 ? streak + 1 : 1;
    last = now;
    if (streak >= 11) { react("angry"); streak = 0; }
    else if (streak >= 7) react("squint", 2200);
    else if (streak >= 4) react("dizzy", 1500);
    else if (streak >= 2) react("startle", 700);
    else react("happy", 900);
  });

  // ── Numbers and download ─────────────────────────────────────────────
  var STATS_URL = "https://kodama-stats.kiyoshidesign.workers.dev";
  var REPO = "KiyoshiTheDevil/Kodama";
  var ua = navigator.userAgent;
  var OS = /Android|iPhone|iPad/i.test(ua) ? "other" : /Mac/i.test(ua) ? "mac" : /Win/i.test(ua) ? "win" : "other";
  if (OS === "win" || OS === "mac") document.getElementById("dlLabel").textContent = OS === "mac" ? "macOS" : "Windows";

  function human(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M";
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "k";
    return String(n);
  }
  var parts = { mau: null, dl: null, ver: null };
  function show() {
    var bits = [];
    if (parts.mau > 0) bits.push(human(parts.mau) + " active this month");
    if (parts.dl > 0) bits.push(human(parts.dl) + " downloads");
    if (parts.ver) bits.push(parts.ver);
    if (bits.length) document.getElementById("stats").textContent = bits.join(" · ");
  }
  fetch(STATS_URL + "/count").then(function (r) { return r.json(); })
    .then(function (d) { parts.mau = d && d.mau; show(); }).catch(function () {});
  // GitHub's API sometimes answers the release list with a 504 for a while (seen 2026-11-08,
  // on the live page too). So: one retry, and the last good answer is kept in this browser and
  // shown when GitHub fails. per_page=100, because the default page of 30 would stop counting
  // the downloads of older releases once there are more than 30.
  var KEY = "kodama-releases";
  function apply(r) {
    parts.dl = r.dl; parts.ver = r.ver;
    var url = OS === "mac" ? r.mac : OS === "win" ? r.win : null;
    var btn = document.getElementById("dlBtn");
    if (url) { btn.href = url; btn.removeAttribute("target"); }   // direct download
    show();
  }
  function load(tries) {
    return fetch("https://api.github.com/repos/" + REPO + "/releases?per_page=100")
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .catch(function (e) {
        if (tries > 0) return new Promise(function (ok) { setTimeout(ok, 1500); }).then(function () { return load(tries - 1); });
        throw e;
      });
  }
  load(1).then(function (rs) {
    if (!Array.isArray(rs)) throw new Error("shape");
    var t = 0;
    rs.forEach(function (rel) { (rel.assets || []).forEach(function (a) { t += a.download_count || 0; }); });
    var latest = null;
    for (var i = 0; i < rs.length; i++) { if (!rs[i].draft) { latest = rs[i]; break; } }
    var assets = (latest && latest.assets) || [];
    var pick = function (re) { for (var j = 0; j < assets.length; j++) { if (re.test(assets[j].name)) return assets[j].browser_download_url; } return null; };
    var r = { dl: t, ver: latest ? latest.tag_name : null, win: pick(/setup\.exe$|\.exe$/i), mac: pick(/\.dmg$/i) };
    try { localStorage.setItem(KEY, JSON.stringify(r)); } catch (e) {}
    apply(r);
  }).catch(function () {
    var r = null;
    try { r = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
    if (r) apply(r);
  });
})();
