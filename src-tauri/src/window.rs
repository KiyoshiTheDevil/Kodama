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

/// Subclass proc that keeps a window square while it is being resized. WM_SIZING arrives
/// with the rect Windows is *about* to apply, so correcting it here is invisible — unlike
/// fixing the size afterwards from JS, which lets a non-square frame paint for a frame first.
#[cfg(windows)]
unsafe extern "system" fn square_subclass(
    hwnd: windows::Win32::Foundation::HWND,
    msg: u32,
    wparam: windows::Win32::Foundation::WPARAM,
    lparam: windows::Win32::Foundation::LPARAM,
    _id: usize,
    _data: usize,
) -> windows::Win32::Foundation::LRESULT {
    use windows::Win32::Foundation::{LRESULT, RECT};
    use windows::Win32::UI::Shell::DefSubclassProc;
    use windows::Win32::UI::WindowsAndMessaging::WM_SIZING;

    // Which handle is being dragged (wParam). Spelled out locally so this doesn't depend on
    // how the windows crate happens to type these constants.
    const WMSZ_LEFT: usize = 1;
    const WMSZ_RIGHT: usize = 2;
    const WMSZ_TOP: usize = 3;
    const WMSZ_TOPLEFT: usize = 4;
    const WMSZ_TOPRIGHT: usize = 5;
    const WMSZ_BOTTOM: usize = 6;
    const WMSZ_BOTTOMLEFT: usize = 7;

    if msg == WM_SIZING {
        let r = &mut *(lparam.0 as *mut RECT);
        let w = r.right - r.left;
        let h = r.bottom - r.top;
        let edge = wparam.0;
        // Side handles: the dragged axis dictates the size. Corner handles: take the larger
        // of the two, so the frame follows the pointer instead of lagging behind it.
        let size = match edge {
            WMSZ_LEFT | WMSZ_RIGHT => w,
            WMSZ_TOP | WMSZ_BOTTOM => h,
            _ => w.max(h),
        };
        // Grow away from the edge being held, so the opposite corner stays put.
        if matches!(edge, WMSZ_TOP | WMSZ_TOPLEFT | WMSZ_TOPRIGHT) {
            r.top = r.bottom - size;
        } else {
            r.bottom = r.top + size;
        }
        if matches!(edge, WMSZ_LEFT | WMSZ_TOPLEFT | WMSZ_BOTTOMLEFT) {
            r.left = r.right - size;
        } else {
            r.right = r.left + size;
        }
        return LRESULT(1); // TRUE — we changed the rect
    }
    DefSubclassProc(hwnd, msg, wparam, lparam)
}

/// Constrain a window to a 1:1 aspect ratio for the whole duration of a resize drag.
/// Windows: a WM_SIZING subclass. macOS: NSWindow does it natively. No-op elsewhere.
pub fn lock_square(window: &tauri::WebviewWindow) {
    #[cfg(windows)]
    {
        use windows::Win32::Foundation::HWND;
        use windows::Win32::UI::Shell::SetWindowSubclass;
        if let Ok(h) = window.hwnd() {
            // Subclass id 2 — id 1 belongs to the borderless-frame fix above.
            unsafe { let _ = SetWindowSubclass(HWND(h.0 as _), Some(square_subclass), 2, 0); }
        }
    }
    #[cfg(target_os = "macos")]
    {
        use cocoa::base::id;
        use cocoa::foundation::NSSize;
        use objc::{msg_send, sel, sel_impl};
        if let Ok(ns) = window.ns_window() {
            unsafe {
                let _: () = msg_send![ns as id, setContentAspectRatio: NSSize::new(1.0, 1.0)];
            }
        }
    }
    #[cfg(not(any(windows, target_os = "macos")))]
    {
        let _ = window;
    }
}

#[tauri::command]
pub fn lock_square_for(app: tauri::AppHandle, label: String) {
    if let Some(win) = app.get_webview_window(&label) {
        let _ = app.run_on_main_thread(move || lock_square(&win));
    }
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

/// What the window looked like before it went fullscreen.
///
/// On Windows that is the whole WINDOWPLACEMENT, which carries both the restore rectangle and
/// whether the window was maximized. Everywhere else the platform's own window manager handles
/// the round trip and only the maximized flag is needed.
pub struct FullscreenState {
    #[cfg(windows)]
    saved: Mutex<Option<windows::Win32::UI::WindowsAndMessaging::WINDOWPLACEMENT>>,
    #[cfg(not(windows))]
    was_maximized: Mutex<bool>,
}

impl FullscreenState {
    pub fn new() -> Self {
        FullscreenState {
            #[cfg(windows)]
            saved: Mutex::new(None),
            #[cfg(not(windows))]
            was_maximized: Mutex::new(false),
        }
    }
}

/// Enter or leave fullscreen.
///
/// Windows does this itself instead of going through tao, because tao's path cannot get a
/// *maximized* window into fullscreen in one step. It calls SetWindowPos while WS_MAXIMIZE is
/// still set, so the window keeps counting as maximized; on the way back its
/// SetWindowPlacement(SW_SHOWMAXIMIZED) is then a no-op and the window stays at monitor size.
/// The old workaround here was to unmaximize first and sleep 80 ms so the change had landed —
/// which is precisely the "window briefly shrinks" flicker, once on the way in and once on the
/// way out.
///
/// Clearing WS_MAXIMIZE with SetWindowLongPtrW moves nothing on its own, so it can be folded
/// into the same SetWindowPos that jumps to the monitor rectangle: one transition, nothing
/// intermediate to paint. The way back is a single SetWindowPlacement, which restores the
/// maximized state or the old rectangle exactly as it was.
///
/// HWND_TOPMOST rides along in that same call to cover the taskbar (the always-on-top the old
/// code set separately), and is dropped again on the way out.
#[tauri::command]
pub fn set_fullscreen(window: tauri::WebviewWindow, fullscreen: bool, state: tauri::State<FullscreenState>) {
    #[cfg(windows)]
    {
        use windows::Win32::Foundation::{HWND, RECT};
        use windows::Win32::Graphics::Gdi::{
            GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST,
        };
        use windows::Win32::UI::HiDpi::{GetDpiForWindow, GetSystemMetricsForDpi};
        use windows::Win32::UI::WindowsAndMessaging::{
            GetWindowLongPtrW, GetWindowPlacement, SetWindowLongPtrW, SetWindowPlacement,
            SetWindowPos, GWL_STYLE, HWND_NOTOPMOST, HWND_TOPMOST, SM_CXPADDEDBORDER,
            SM_CXSIZEFRAME, SWP_FRAMECHANGED, SWP_NOMOVE, SWP_NOOWNERZORDER, SWP_NOSIZE,
            WINDOWPLACEMENT, WS_MAXIMIZE,
        };

        let Ok(handle) = window.hwnd() else { return };
        // HWND is not Send, so only the raw value crosses into the main-thread closure.
        let raw = handle.0 as isize;
        // The window work has to happen on the main thread, but the caller flips the app's own
        // layout the moment this returns. Waiting for the hop keeps those two in step: without
        // it the interface can lay itself out for fullscreen a frame before the window is,
        // which is a smaller version of the very flicker this is meant to remove. Bounded, so a
        // stalled main thread cannot wedge the command.
        let (done_tx, done_rx) = std::sync::mpsc::channel::<()>();

        if fullscreen {
            let mut placement = WINDOWPLACEMENT {
                length: std::mem::size_of::<WINDOWPLACEMENT>() as u32,
                ..Default::default()
            };
            let mut rect: RECT;
            unsafe {
                let hwnd = HWND(raw as _);
                if GetWindowPlacement(hwnd, &mut placement).is_err() {
                    return;
                }
                let mut info = MONITORINFO {
                    cbSize: std::mem::size_of::<MONITORINFO>() as u32,
                    ..Default::default()
                };
                let monitor = MonitorFromWindow(hwnd, MONITOR_DEFAULTTONEAREST);
                if !GetMonitorInfoW(monitor, &mut info).as_bool() {
                    return;
                }
                // rcMonitor, not rcWork: the whole screen, taskbar included.
                rect = info.rcMonitor;
                // …but the window has to reach PAST the screen on three sides to cover it.
                // Kodama's window is borderless with a shadow, and tao shrinks the client area
                // of such a window by the resize-frame thickness on left, right and bottom (it
                // skips that only for its own fullscreen flag, which we are not setting). Put
                // the window rectangle exactly on the monitor and that inset shows up as an
                // uncovered strip along those edges. Growing the window by the same amount puts
                // the CLIENT area on the monitor rectangle, which is what fullscreen means here.
                // The top is already handled: tao insets it by 1px on Windows 11 and
                // nccalc_subclass above takes that pixel straight back.
                let dpi = GetDpiForWindow(hwnd);
                let frame = GetSystemMetricsForDpi(SM_CXSIZEFRAME, dpi)
                    + GetSystemMetricsForDpi(SM_CXPADDEDBORDER, dpi);
                rect.left -= frame;
                rect.right += frame;
                rect.bottom += frame;
            }
            *state.saved.lock().unwrap() = Some(placement);

            let _ = window.run_on_main_thread(move || unsafe {
                let hwnd = HWND(raw as _);
                let style = GetWindowLongPtrW(hwnd, GWL_STYLE);
                SetWindowLongPtrW(hwnd, GWL_STYLE, style & !(WS_MAXIMIZE.0 as isize));
                let _ = SetWindowPos(
                    hwnd,
                    HWND_TOPMOST,
                    rect.left,
                    rect.top,
                    rect.right - rect.left,
                    rect.bottom - rect.top,
                    SWP_NOOWNERZORDER | SWP_FRAMECHANGED,
                );
                let _ = done_tx.send(());
            });
            let _ = done_rx.recv_timeout(std::time::Duration::from_millis(500));
        } else {
            let saved = state.saved.lock().unwrap().take();
            let _ = window.run_on_main_thread(move || unsafe {
                let hwnd = HWND(raw as _);
                // Z-order only — no geometry, so this does not show as a step of its own.
                let _ = SetWindowPos(
                    hwnd,
                    HWND_NOTOPMOST,
                    0,
                    0,
                    0,
                    0,
                    SWP_NOMOVE | SWP_NOSIZE | SWP_NOOWNERZORDER | SWP_FRAMECHANGED,
                );
                // WS_MAXIMIZE is deliberately left cleared: SetWindowPlacement sets it again
                // when the saved state says maximized, and would otherwise see a window that
                // already claims to be maximized and do nothing.
                if let Some(placement) = saved {
                    let _ = SetWindowPlacement(hwnd, &placement);
                }
                let _ = done_tx.send(());
            });
            let _ = done_rx.recv_timeout(std::time::Duration::from_millis(500));
        }
    }

    // macOS and Linux hand fullscreen to the window manager, which gets a maximized window
    // right on its own — but tao still restores to the pre-maximized rectangle, so the
    // maximized state is put back by hand afterwards.
    #[cfg(not(windows))]
    {
        if fullscreen {
            let maximized = window.is_maximized().unwrap_or(false);
            *state.was_maximized.lock().unwrap() = maximized;
            if maximized {
                let _ = window.unmaximize();
                std::thread::sleep(std::time::Duration::from_millis(80));
            }
            let _ = window.set_fullscreen(true);
            let _ = window.set_always_on_top(true);
        } else {
            let _ = window.set_fullscreen(false);
            let _ = window.set_always_on_top(false);
            if *state.was_maximized.lock().unwrap() {
                std::thread::sleep(std::time::Duration::from_millis(80));
                let _ = window.maximize();
            }
        }
    }
}

/// Hide or show the mouse pointer, at the OS level.
///
/// `cursor: none` in the page is not enough. The browser only re-reads the cursor when the
/// element under the pointer changes; a style change on an element the pointer already sits on
/// is not an occasion, so on a resting pointer the arrow stays drawn even though everything in
/// the page reports `none` (measured in the running app, and it flickers away for an instant on
/// the next mouse movement, which is when the browser does re-read). Windows has no such
/// notion: ShowCursor takes effect immediately.
///
/// The display counter is shared by the windows of a thread, so this pairs strictly — one hide
/// per show, guarded by a flag, and always from the main thread, which is the one that owns the
/// window and the WebView child. Anything that puts the pointer back on screen (any mouse
/// movement, leaving fullscreen, losing focus) calls this with `false`.
#[cfg(windows)]
static CURSOR_HIDDEN: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

#[tauri::command]
pub fn set_cursor_hidden(window: tauri::WebviewWindow, hidden: bool) {
    #[cfg(windows)]
    {
        use std::sync::atomic::Ordering;
        use windows::Win32::Foundation::POINT;
        use windows::Win32::UI::WindowsAndMessaging::{
            GetCursorPos, SetCursorPos, ShowCursor,
        };
        // ShowCursor counts, so a repeated hide would need a matching number of shows.
        if CURSOR_HIDDEN.swap(hidden, Ordering::SeqCst) == hidden {
            return;
        }
        let _ = window.run_on_main_thread(move || unsafe {
            ShowCursor(!hidden);
            if !hidden {
                return;
            }
            // ShowCursor covers the windows of our own thread. The one the pointer is actually
            // over belongs to the WebView's process, and there the cursor is whatever the
            // browser last set — which it only reconsiders when it receives mouse input. That
            // is why this worked in some spots and not others, and why native applications,
            // which own their input thread, have no such trouble.
            //
            // So give it the input. Nudging the pointer one pixel and straight back leaves it
            // exactly where it was and produces the movement the browser needs to re-read the
            // cursor, at which point it reads the `none` the page has been reporting all along.
            // The app's own idle timer ignores it: a one-pixel round trip is well under the
            // threshold that counts as activity.
            let mut p = POINT::default();
            if GetCursorPos(&mut p).is_ok() {
                let step = if p.x > 0 { -1 } else { 1 };
                let _ = SetCursorPos(p.x + step, p.y);
                let _ = SetCursorPos(p.x, p.y);
            }
        });
    }
    #[cfg(not(windows))]
    {
        // macOS and Linux hide the pointer from CSS without this.
        let _ = (window, hidden);
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

// Desired traffic-light inset on macOS: x = distance from the left edge, y = extra height
// added on top of the buttons' own height (i.e. how far down their vertical center sits).
// Kept in one place so it's easy to retune against the sidebar's search-bar row without
// hunting through the positioning code. Must match (or drive) the `pl-[72px]` left padding
// on the macOS search-bar row in App.jsx — keep the two in sync when tuning.
#[cfg(target_os = "macos")]
const MAC_TRAFFIC_LIGHT_INSET: (f64, f64) = (24.0, 24.0);

// Tauri's own `traffic_light_position()` only applies once at window construction — wry's
// underlying window re-applies its stored inset continuously (on every webview redraw), but
// that live re-application isn't exposed on the public `tauri::WebviewWindow` API, only on an
// internal runtime trait. Without it, anything that recomputes the titlebar (leaving/entering
// fullscreen, restoring from maximize, some resizes) snaps the buttons back to their native
// top-left spot — which is exactly the bug an earlier attempt at this hit and abandoned.
// So we reimplement wry's own algorithm (tao's `inset_traffic_lights`) ourselves and re-run it
// on resize/move, which is cheap and idempotent.
#[cfg(target_os = "macos")]
pub unsafe fn reposition_traffic_lights(window: &tauri::WebviewWindow, x: f64, y: f64) {
    use cocoa::base::{id, nil};
    use cocoa::foundation::NSRect;
    use objc::{msg_send, sel, sel_impl};

    let Ok(ns_window) = window.ns_window() else { return };
    let ns_window = ns_window as id;
    if ns_window == nil {
        return;
    }

    // NSWindowButton: CloseButton = 0, MiniaturizeButton = 1, ZoomButton = 2.
    let close: id = msg_send![ns_window, standardWindowButton: 0u64];
    let miniaturize: id = msg_send![ns_window, standardWindowButton: 1u64];
    let zoom: id = msg_send![ns_window, standardWindowButton: 2u64];
    if close == nil || miniaturize == nil || zoom == nil {
        return;
    }

    let close_frame: NSRect = msg_send![close, frame];
    let miniaturize_frame: NSRect = msg_send![miniaturize, frame];

    // The three buttons share a titlebar container view two levels up; resizing/repositioning
    // it (rather than just the buttons) is what makes the vertical inset take effect.
    let button_superview: id = msg_send![close, superview];
    let title_bar_container_view: id = msg_send![button_superview, superview];
    if title_bar_container_view == nil {
        return;
    }

    let title_bar_frame_height = close_frame.size.height + y;
    let mut title_bar_rect: NSRect = msg_send![title_bar_container_view, frame];
    let window_frame: NSRect = msg_send![ns_window, frame];
    title_bar_rect.size.height = title_bar_frame_height;
    title_bar_rect.origin.y = window_frame.size.height - title_bar_frame_height;
    let _: () = msg_send![title_bar_container_view, setFrame: title_bar_rect];

    // Preserve Apple's own spacing between the three dots, just shift the whole group.
    let space_between = miniaturize_frame.origin.x - close_frame.origin.x;
    for (i, button) in [close, miniaturize, zoom].into_iter().enumerate() {
        let mut frame: NSRect = msg_send![button, frame];
        frame.origin.x = x + (i as f64 * space_between);
        let _: () = msg_send![button, setFrameOrigin: frame.origin];
    }
}

#[cfg(target_os = "macos")]
pub fn apply_mac_traffic_light_inset(window: &tauri::WebviewWindow) {
    let (x, y) = MAC_TRAFFIC_LIGHT_INSET;
    let window = window.clone();
    let _ = window.clone().run_on_main_thread(move || unsafe {
        reposition_traffic_lights(&window, x, y);
    });
}


