// The confirm bar and brand-account mirror for the YouTube Music sign-in window. Shared by the
// desktop (src-tauri/src/window.rs, include_str!) and Android (copied into the app's assets by
// src-tauri/gen/android/app/build.gradle.kts, run by LoginActivity.kt). See window.rs for what it does.
(function () {
  if (location.hostname.indexOf('music.youtube.com') === -1) return;
  var L = window.__KODAMA_LABELS__ || { confirm: 'Use this account', hint: '' };
  function setCookie(name, val) {
    try { document.cookie = name + '=' + (val || '') + ';path=/;max-age=3600'; } catch (e) {}
  }
  function readDsid() {
    try {
      if (window.ytcfg && typeof ytcfg.get === 'function') return ytcfg.get('DELEGATED_SESSION_ID') || '';
    } catch (e) {}
    return '';
  }
  setInterval(function () { setCookie('KODAMA_DSID', readDsid()); }, 1000);
  function injectBar() {
    if (!document.body || document.getElementById('kodama-confirm-bar')) return;
    var bar = document.createElement('div');
    bar.id = 'kodama-confirm-bar';
    bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;gap:18px;padding:14px 20px;background:rgba(15,15,15,0.97);border-top:1px solid rgba(255,255,255,0.14);font-family:system-ui,-apple-system,sans-serif;';
    if (L.hint) {
      var hint = document.createElement('span');
      hint.textContent = L.hint;
      hint.style.cssText = 'color:#b4b4b4;font-size:13px;max-width:520px;';
      bar.appendChild(hint);
    }
    var btn = document.createElement('button');
    btn.textContent = L.confirm;
    btn.style.cssText = 'background:#f5f5f5;color:#0d0d0d;font-weight:600;font-size:14px;border:none;border-radius:9px;padding:11px 24px;cursor:pointer;';
    btn.onclick = function () {
      setCookie('KODAMA_DSID', readDsid());
      setCookie('KODAMA_DONE', '1');
      btn.disabled = true;
      btn.style.opacity = '0.6';
    };
    bar.appendChild(btn);
    document.body.appendChild(bar);
  }
  var iv = setInterval(function () { injectBar(); if (document.getElementById('kodama-confirm-bar')) clearInterval(iv); }, 500);
})();
