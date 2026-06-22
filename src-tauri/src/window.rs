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

#[tauri::command]
pub async fn open_login_window(app: tauri::AppHandle, profile_name: String) -> Result<(), String> {
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
    // Force a Chrome UA: the default macOS WKWebView UA is Safari-like and YT Music/Google
    // shows a "browser not optimized" wall. Matches the UA used for /auth/cookie-login.
    .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
    .data_directory(login_data_dir)
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
            if !current_url.contains("youtube.com") {
                continue;
            }

            // Read auth cookies. On Windows cookies_for_url is reliable; on macOS WKWebView
            // it often returns an empty/partial set, so fall back to cookies() (whole store)
            // filtered to the youtube.com domain. eprintln so a terminal run shows the state.
            let mut found: Vec<_> = match win.cookies_for_url(yt_url.clone()) {
                Ok(cs) => {
                    eprintln!("[login] cookies_for_url -> {} cookies", cs.len());
                    cs
                }
                Err(e) => {
                    eprintln!("[login] cookies_for_url ERR: {}", e);
                    Vec::new()
                }
            };
            if !found.iter().any(|c| c.name() == "SAPISID") {
                match win.cookies() {
                    Ok(cs) => {
                        eprintln!(
                            "[login] cookies() all -> {} cookies; names={:?}",
                            cs.len(),
                            cs.iter().map(|c| c.name().to_string()).collect::<Vec<_>>()
                        );
                        let yt: Vec<_> = cs
                            .into_iter()
                            .filter(|c| c.domain().map(|d| d.contains("youtube.com")).unwrap_or(false))
                            .collect();
                        if yt.iter().any(|c| c.name() == "SAPISID") {
                            found = yt;
                        }
                    }
                    Err(e) => eprintln!("[login] cookies() ERR: {}", e),
                }
            }

            let has_auth = found.iter().any(|c| c.name() == "SAPISID");
            eprintln!("[login] url={} has_auth={}", current_url, has_auth);
            {
                let cookies = found;
                if has_auth {
                    let cookie_str = cookies
                        .iter()
                        .map(|c| format!("{}={}", c.name(), c.value()))
                        .collect::<Vec<_>>()
                        .join("; ");

                    let client = reqwest::Client::new();
                    let _ = client
                        .post("http://localhost:9847/auth/cookie-login")
                        .json(&serde_json::json!({
                            "cookie": cookie_str,
                            "profile_name": profile,
                            "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
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
    let cookies = win.cookies_for_url(yt_url).map_err(|e| e.to_string())?;
    if !cookies.iter().any(|c| c.name() == "SAPISID") {
        return Err("keeper not authenticated".into());
    }
    let cookie_str = cookies
        .iter()
        .map(|c| format!("{}={}", c.name(), c.value()))
        .collect::<Vec<_>>()
        .join("; ");
    let has_ts = cookies
        .iter()
        .any(|c| c.name() == "__Secure-1PSIDTS" || c.name() == "__Secure-3PSIDTS");
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

