use std::sync::Mutex;
use tauri::{Manager, Emitter};

/// Subclass proc that reclaims the residual 1px top frame line Windows draws on borderless
/// windows. On WM_NCCALCSIZE we let the default (and Tauri's) handler compute the client
/// rect, then grow it up by 1px so content covers that line. DWMWA_BORDER_COLOR can't
/// remove this top edge.
#[cfg(windows)]
unsafe extern "system" fn nccalc_subclass(
    hwnd: windows::Win32::Foundation::HWND,
    msg: u32,
    wparam: windows::Win32::Foundation::WPARAM,
    lparam: windows::Win32::Foundation::LPARAM,
    _id: usize,
    _data: usize,
) -> windows::Win32::Foundation::LRESULT {
    use windows::Win32::UI::Shell::DefSubclassProc;
    use windows::Win32::UI::WindowsAndMessaging::{NCCALCSIZE_PARAMS, WM_NCCALCSIZE};
    if msg == WM_NCCALCSIZE && wparam.0 != 0 {
        let ret = DefSubclassProc(hwnd, msg, wparam, lparam);
        let params = &mut *(lparam.0 as *mut NCCALCSIZE_PARAMS);
        params.rgrc[0].top -= 1;
        return ret;
    }
    DefSubclassProc(hwnd, msg, wparam, lparam)
}

/// Remove the coloured outer border Windows 11 draws around borderless (decorations:false)
/// windows — by default it follows the system accent colour. We set DWMWA_BORDER_COLOR to
/// DWMWA_COLOR_NONE (sides + bottom) and install a WM_NCCALCSIZE subclass for the residual
/// 1px top frame line. The DWM drop shadow stays, so the edge is still defined. No-op off Windows.
pub fn remove_window_border(window: &tauri::WebviewWindow) {
    #[cfg(windows)]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_BORDER_COLOR};
        use windows::Win32::UI::Shell::SetWindowSubclass;
        use windows::Win32::UI::WindowsAndMessaging::{
            SetWindowPos, SWP_FRAMECHANGED, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER,
        };
        const DWMWA_COLOR_NONE: u32 = 0xFFFFFFFE;
        if let Ok(h) = window.hwnd() {
            let hwnd = HWND(h.0 as _);
            unsafe {
                let _ = DwmSetWindowAttribute(
                    hwnd,
                    DWMWA_BORDER_COLOR,
                    &DWMWA_COLOR_NONE as *const u32 as *const core::ffi::c_void,
                    std::mem::size_of::<u32>() as u32,
                );
                let _ = SetWindowSubclass(hwnd, Some(nccalc_subclass), 1, 0);
                // Force a frame recalculation so the subclass applies immediately.
                let _ = SetWindowPos(
                    hwnd,
                    None,
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_FRAMECHANGED,
                );
            }
        }
    }
    #[cfg(not(windows))]
    {
        let _ = window;
    }
}

/// Strip the Windows 11 accent-coloured border from a borderless window created on the
/// JS side (e.g. the Overlay Editor). Must touch the HWND on the main thread.
#[tauri::command]
pub fn remove_window_border_for(app: tauri::AppHandle, label: String) {
    if let Some(win) = app.get_webview_window(&label) {
        let _ = app.run_on_main_thread(move || remove_window_border(&win));
    }
}

pub struct WasMaximized(Mutex<bool>);

impl WasMaximized {
    pub fn new() -> Self {
        WasMaximized(Mutex::new(false))
    }
}

#[tauri::command]
pub fn set_fullscreen(window: tauri::WebviewWindow, fullscreen: bool, state: tauri::State<WasMaximized>) {
    if fullscreen {
        let maximized = window.is_maximized().unwrap_or(false);
        *state.0.lock().unwrap() = maximized;

        if maximized {
            let _ = window.unmaximize();
            std::thread::sleep(std::time::Duration::from_millis(80));
        }
        let _ = window.set_fullscreen(true);
        let _ = window.set_always_on_top(true);
    } else {
        let _ = window.set_fullscreen(false);
        let _ = window.set_always_on_top(false);
        if *state.0.lock().unwrap() {
            std::thread::sleep(std::time::Duration::from_millis(80));
            let _ = window.maximize();
        }
    }
}

// Per-profile WebView data directory. Persisted (not wiped on close) so a hidden
// "session-keeper" WebView can keep the browser session — and its rotating *SIDTS cookies —
// alive after login. Wiped only at the start of an interactive login (fresh slate per login,
// and per profile so accounts never bleed into each other).
fn auth_data_dir(profile: &str) -> std::path::PathBuf {
    let safe: String = profile
        .chars()
        .map(|c| if c.is_alphanumeric() || c == '-' || c == '_' { c } else { '_' })
        .collect();
    std::env::temp_dir().join("kodama-auth-webview").join(safe)
}

#[cfg(target_os = "macos")]
const LOGIN_USER_AGENT: &str = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15";
#[cfg(not(target_os = "macos"))]
const LOGIN_USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Injected into the login WebView. On music.youtube.com it (1) continuously mirrors the
// active brand account's ytcfg DELEGATED_SESSION_ID into a cookie the native poll reads
// alongside the auth cookies (empty for the default account), and (2) shows a bottom bar
// with a confirm button so the user can first switch to a brand account via their avatar,
// then finish — instead of the login auto-closing on the default account. Clicking the
// button sets KODAMA_DONE=1, which the poll waits for. Runs from an initialization script,
// so it executes regardless of the page CSP; it only touches the DOM (no injected <script>).
const LOGIN_INIT_JS: &str = r#"
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
"#;

#[tauri::command]
pub async fn open_login_window(
    app: tauri::AppHandle,
    profile_name: String,
    confirm_label: String,
    switch_hint: String,
) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("login") {
        let _ = w.destroy();
        tokio::time::sleep(std::time::Duration::from_millis(200)).await;
    }
    // A new interactive login supersedes any running keeper.
    if let Some(w) = app.get_webview_window("session-keeper") {
        let _ = w.destroy();
    }

    // Fresh, per-profile data directory for the interactive login (no inherited session).
    // It persists afterwards so the session-keeper can reuse it.
    let login_data_dir = auth_data_dir(&profile_name);
    let _ = std::fs::remove_dir_all(&login_data_dir);

    // Feed the localized bar labels to the init script (JSON-encoded so quotes are safe).
    let labels = serde_json::json!({ "confirm": confirm_label, "hint": switch_hint }).to_string();
    let init_script = format!("window.__KODAMA_LABELS__ = {};\n{}", labels, LOGIN_INIT_JS);

    // Load the sign-in URL directly. NOTE: do NOT start blank + navigate() afterwards — Google's
    // embedded-webview check ("This browser or app may not be secure") trips on the programmatic
    // navigation and blocks sign-in entirely. Direct load is what lets the real sign-in through.
    let _win = tauri::WebviewWindowBuilder::new(
        &app,
        "login",
        tauri::WebviewUrl::External(
            "https://accounts.google.com/AddSession?service=youtube&continue=https%3A%2F%2Fmusic.youtube.com%2F&flowName=GlifWebSignIn"
                .parse()
                .unwrap(),
        ),
    )
    .title("Kodama – Anmelden")
    .inner_size(900.0, 680.0)
        .center()
    .decorations(true)
    // Platform-matched UA. Also replayed to /auth/cookie-login.
    .user_agent(LOGIN_USER_AGENT)
    .data_directory(login_data_dir)
    .initialization_script(&init_script)
    .build()
    .map_err(|e| e.to_string())?;

    let app_clone = app.clone();
    let profile = profile_name.clone();

    tauri::async_runtime::spawn(async move {
        let yt_url: url::Url = "https://music.youtube.com".parse().unwrap();
        tokio::time::sleep(std::time::Duration::from_secs(4)).await;
        let mut completed = false;

        for _ in 0..150 {
            tokio::time::sleep(std::time::Duration::from_secs(2)).await;

            let Some(win) = app_clone.get_webview_window("login") else {
                break;
            };

            let current_url = win.url().ok().map(|u| u.to_string()).unwrap_or_default();
            // Only treat it as logged-in once Google has redirected to YT Music itself — not
            // while the user is still on the accounts.google.com sign-in form.
            if !current_url.contains("music.youtube.com") {
                continue;
            }

            // Read auth cookies on the MAIN thread. On macOS wry's cookie retrieval pumps
            // the main run loop to receive WKHTTPCookieStore's async callback, so it only
            // returns anything when invoked on the main thread. This detection loop runs on
            // a background task, so calling win.cookies() directly here times out and returns
            // nothing — which is why login was never detected on macOS. Hop to the main thread
            // and send owned (name, value) pairs back through a channel.
            let (ctx, crx) = std::sync::mpsc::channel::<Vec<(String, String)>>();
            let cwin = win.clone();
            let cyt = yt_url.clone();
            let capp = app_clone.clone();
            let _ = app_clone.run_on_main_thread(move || {
                // The login window may be torn down (user closed it, or the app is shutting
                // down) between the liveness check above and this closure. Calling
                // cookies_for_url on a dead webview panics deep inside wry
                // (rx.recv().unwrap()) and takes the whole process down — the poll loop now
                // outlives the window much longer (it waits for the confirm click), so this
                // race is real. Re-check on the main thread (race-free vs. destruction, which
                // is also main-thread) and wrap the read in catch_unwind to survive the
                // shutdown case where the event loop is already going away.
                if capp.get_webview_window("login").is_none() {
                    let _ = ctx.send(Vec::new());
                    return;
                }
                let pairs = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                    let mut cs = cwin.cookies_for_url(cyt).unwrap_or_default();
                    if !cs.iter().any(|c| c.name() == "SAPISID") {
                        if let Ok(all) = cwin.cookies() {
                            let yt: Vec<_> = all
                                .into_iter()
                                .filter(|c| c.domain().map(|d| d.contains("youtube.com")).unwrap_or(false))
                                .collect();
                            if yt.iter().any(|c| c.name() == "SAPISID") {
                                cs = yt;
                            }
                        }
                    }
                    cs.iter().map(|c| (c.name().to_string(), c.value().to_string())).collect::<Vec<_>>()
                }))
                .unwrap_or_default();
                let _ = ctx.send(pairs);
            });
            let found: Vec<(String, String)> = crx
                .recv_timeout(std::time::Duration::from_secs(5))
                .unwrap_or_default();

            let has_auth = found.iter().any(|(n, _)| n == "SAPISID");
            // Wait for the user to confirm via the injected bar (KODAMA_DONE=1) instead of
            // completing on the first authenticated load — this is what lets brand-account
            // users switch account first. The bar only appears once has_auth is true anyway.
            let done = found.iter().any(|(n, v)| n == "KODAMA_DONE" && v == "1");
            eprintln!("[login] url={} has_auth={} done={} cookies={}", current_url, has_auth, done, found.len());
            {
                if has_auth && done {
                    // Brand-account context (empty for the default account), kept out of the
                    // auth cookie string along with the other KODAMA_* helper cookies.
                    let dsid = found
                        .iter()
                        .find(|(n, _)| n == "KODAMA_DSID")
                        .map(|(_, v)| v.clone())
                        .unwrap_or_default();
                    let cookie_str = found
                        .iter()
                        .filter(|(n, _)| !n.starts_with("KODAMA_"))
                        .map(|(n, v)| format!("{}={}", n, v))
                        .collect::<Vec<_>>()
                        .join("; ");

                    let client = reqwest::Client::new();
                    let _ = client
                        .post("http://localhost:9847/auth/cookie-login")
                        .json(&serde_json::json!({
                            "cookie": cookie_str,
                            "profile_name": profile,
                            "user_agent": LOGIN_USER_AGENT,
                            "delegated_session_id": dsid
                        }))
                        .send()
                        .await;

                    let _ = win.destroy();
                    let _ = app_clone.emit("login-complete", &profile);
                    completed = true;
                    break;
                }
            }
        }

        if !completed {
            let _ = app_clone.emit("login-cancelled", ());
        }
    });

    Ok(())
}

#[tauri::command]
pub fn close_login_window(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("login") {
        let _ = w.destroy();
    }
}

// Create a hidden "session-keeper" WebView on music.youtube.com using the profile's persisted
// data directory. As a real browser engine it auto-authenticates from the stored session and
// keeps the rotating *SIDTS cookies fresh — which plain HTTP requests cannot do.
#[tauri::command]
pub async fn ensure_session_keeper(app: tauri::AppHandle, profile_name: String) -> Result<(), String> {
    if app.get_webview_window("session-keeper").is_some() {
        return Ok(());
    }
    let dir = auth_data_dir(&profile_name);
    if !dir.exists() {
        return Err("no auth data for profile".into());
    }
    tauri::WebviewWindowBuilder::new(
        &app,
        "session-keeper",
        tauri::WebviewUrl::External("https://music.youtube.com/".parse().unwrap()),
    )
    .title("Kodama session")
    .inner_size(900.0, 680.0)
    .visible(false)
    .skip_taskbar(true)
    .user_agent(LOGIN_USER_AGENT)
    .data_directory(dir)
    .build()
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn stop_session_keeper(app: tauri::AppHandle) {
    if let Some(w) = app.get_webview_window("session-keeper") {
        let _ = w.destroy();
    }
}

// Reload the keeper (forcing fresh authenticated requests → cookie rotation), read the full
// cookie set from the WebView store, and push it to the backend so the live ytmusicapi session
// gets the freshly rotated tokens. Returns true if the captured set includes a *SIDTS token.
#[tauri::command]
pub async fn rotate_session_cookies(app: tauri::AppHandle, profile_name: String) -> Result<bool, String> {
    if app.get_webview_window("session-keeper").is_none() {
        ensure_session_keeper(app.clone(), profile_name.clone()).await?;
        tokio::time::sleep(std::time::Duration::from_secs(7)).await;
    }
    let win = app
        .get_webview_window("session-keeper")
        .ok_or_else(|| "no keeper".to_string())?;
    if let Ok(u) = "https://music.youtube.com/".parse() {
        let _ = win.navigate(u);
    }
    tokio::time::sleep(std::time::Duration::from_secs(9)).await;
    let yt_url: url::Url = "https://music.youtube.com".parse().unwrap();
    // Read cookies on the main thread — see the note in open_login_window: wry's macOS
    // cookie retrieval only returns anything when invoked on the main thread.
    let (ctx, crx) = std::sync::mpsc::channel::<Vec<(String, String)>>();
    let cwin = win.clone();
    let capp = app.clone();
    app.run_on_main_thread(move || {
        // Same guard as the login poll: the keeper window can be torn down (app shutdown)
        // while a rotation is in flight; cookies_for_url on a dead webview panics inside wry.
        if capp.get_webview_window("session-keeper").is_none() {
            let _ = ctx.send(Vec::new());
            return;
        }
        let pairs = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            let cs = cwin.cookies_for_url(yt_url).unwrap_or_default();
            cs.iter().map(|c| (c.name().to_string(), c.value().to_string())).collect::<Vec<_>>()
        }))
        .unwrap_or_default();
        let _ = ctx.send(pairs);
    })
    .map_err(|e| e.to_string())?;
    let cookies: Vec<(String, String)> = crx
        .recv_timeout(std::time::Duration::from_secs(5))
        .map_err(|_| "timed out reading keeper cookies".to_string())?;
    if !cookies.iter().any(|(n, _)| n == "SAPISID") {
        return Err("keeper not authenticated".into());
    }
    let cookie_str = cookies
        .iter()
        .map(|(n, v)| format!("{}={}", n, v))
        .collect::<Vec<_>>()
        .join("; ");
    let has_ts = cookies
        .iter()
        .any(|(n, _)| n == "__Secure-1PSIDTS" || n == "__Secure-3PSIDTS");
    let client = reqwest::Client::new();
    let _ = client
        .post("http://localhost:9847/auth/refresh-cookies")
        .json(&serde_json::json!({ "cookie": cookie_str, "profile_name": profile_name }))
        .send()
        .await;
    Ok(has_ts)
}

/// Opens Kodama's vendored copy of Boidu's Composer (served locally at
/// http://localhost:9847/composer-app/) in its own window, pre-configured so its
/// "YouTube Bridge" experiment is on and points at Kodama's local bridge endpoint —
/// the user doesn't have to touch the composer's settings. The init script seeds the
/// composer's Zustand-persisted settings before the app boots (merging, not clobbering).
#[tauri::command]
pub async fn open_composer_window(
    app: tauri::AppHandle,
    video_id: Option<String>,
    overrides: std::collections::HashMap<String, String>,
) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("unison-composer") {
        let _ = w.set_focus();
        return Ok(());
    }

    // Load Kodama's locally-built, vendored copy of the composer (served by the Python
    // backend at the same origin as the audio bridge), not the public website.
    let url = match video_id.as_deref() {
        Some(v) if !v.is_empty() => format!("http://localhost:9847/composer-app/?v={}", v),
        _ => "http://localhost:9847/composer-app/".to_string(),
    };

    // Base init script: pre-configure the composer to use Kodama as its audio bridge.
    let mut init_script = String::from(
        r#"
(function () {
  try {
    var KEY = "composer-settings";
    var BRIDGE = "http://localhost:9847/composer-bridge";
    var env = null;
    try { env = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) {}
    if (!env || typeof env !== "object") env = { state: {}, version: 2 };
    if (!env.state || typeof env.state !== "object") env.state = {};
    env.state.experiments = Object.assign({}, env.state.experiments, { youtubeBridge: true });
    env.state.composerBridgeUrl = BRIDGE;
    if (typeof env.version !== "number") env.version = 2;
    localStorage.setItem(KEY, JSON.stringify(env));
  } catch (e) {}
})();
"#,
    );

    // Light theming: override the composer's CSS colour tokens (accent, background,
    // surfaces, border) with Kodama's, as inline !important on <html> — which beats any
    // author stylesheet rule regardless of @theme/layer order. Keys are whitelisted to
    // --color-composer-* and values stripped to a safe CSS-colour charset. documentElement
    // is null at the very first init run, so apply() guards and re-runs on DOMContentLoaded.
    let mut pairs = String::new();
    for (k, val) in &overrides {
        let key_ok = k.starts_with("--color-composer-")
            && k.len() <= 48
            && k.chars().all(|c| c.is_ascii_lowercase() || c == '-');
        let safe_val: String = val
            .chars()
            .filter(|c| c.is_ascii_alphanumeric() || "#(),.%- ".contains(*c))
            .collect();
        if key_ok && !safe_val.is_empty() {
            pairs.push_str("['");
            pairs.push_str(k);
            pairs.push_str("','");
            pairs.push_str(&safe_val);
            pairs.push_str("'],");
        }
    }
    if !pairs.is_empty() {
        init_script.push_str("\n(function(){try{var O=[");
        init_script.push_str(&pairs);
        init_script.push_str("];var apply=function(){var r=document.documentElement;if(!r)return;O.forEach(function(p){r.style.setProperty(p[0],p[1],'important');});};apply();document.addEventListener('DOMContentLoaded',apply);}catch(e){}})();");
    }

    // Always use Inter (Google Fonts). Set the composer's --font-family-sans AND the body
    // font-family directly as inline !important so it wins regardless of how the composer
    // applies its font. Mono elements keep their own font-family. NOTE: at the very first
    // init run document.head/documentElement can be null, so every DOM access is guarded
    // and the work is (re)run on DOMContentLoaded/load — otherwise an early throw would
    // skip the listener registration entirely.
    init_script.push_str("\n(function(){var ff='\"Inter\", system-ui, sans-serif';var run=function(){try{if(!document.getElementById('__kodama_inter')){var l=document.createElement('link');l.id='__kodama_inter';l.rel='stylesheet';l.href='https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap';var h=document.head||document.documentElement;if(h)h.appendChild(l);}var r=document.documentElement;if(r)r.style.setProperty('--font-family-sans',ff,'important');if(document.body)document.body.style.setProperty('font-family',ff,'important');}catch(e){}};if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',run);}else{run();}window.addEventListener('load',run);})();");

    let composer_win = tauri::WebviewWindowBuilder::new(
        &app,
        "unison-composer",
        tauri::WebviewUrl::External(url.parse::<url::Url>().map_err(|e| e.to_string())?),
    )
    .title("Boidu Composer — Kodama")
    .inner_size(1280.0, 860.0)
    .min_inner_size(900.0, 600.0)
    .center()
    // No native titlebar — the composer renders its own (custom titlebar in the unified
    // header). Window controls/drag go through IPC, enabled for this remote-URL window
    // via capabilities/composer.json.
    .decorations(false)
    .initialization_script(&init_script)
    .build()
    .map_err(|e| e.to_string())?;

    // Window subclassing (remove_window_border's top-line fix) must run on the main/UI
    // thread; this command runs on the async runtime, so dispatch it there.
    let _ = app.run_on_main_thread(move || remove_window_border(&composer_win));

    Ok(())
}

