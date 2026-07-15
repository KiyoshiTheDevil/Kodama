#![cfg_attr(all(not(debug_assertions), target_os = "windows"), windows_subsystem = "windows")]

mod audio;
mod discord;
mod window;
mod server;
mod obs;
mod media;
mod appicon;

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::Manager;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use audio::{AudioPlayer, start_audio_thread, audio_play, audio_crossfade, audio_pause, audio_resume, audio_stop, audio_seek, audio_set_volume};
use discord::{DiscordRpc, disconnect_rpc, update_discord_rpc, clear_discord_rpc};
use window::{WasMaximized, set_fullscreen, open_login_window, close_login_window, open_composer_window, remove_window_border_for, ensure_session_keeper, rotate_session_cookies, stop_session_keeper};
use server::{ServerProcess, stop_server};
#[cfg(windows)]
use obs::start_audio_session_tagger;

struct AppTray(tauri::tray::TrayIcon<tauri::Wry>);
struct CloseTray(AtomicBool);

#[tauri::command]
fn set_close_to_tray(enabled: bool, state: tauri::State<CloseTray>) {
    state.0.store(enabled, Ordering::Relaxed);
}

#[tauri::command]
fn relaunch_app(app: tauri::AppHandle) {
    app.restart();
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

// Capture the main window as a PNG and return it base64-encoded (for bug-report screenshots).
// Native capture keeps backdrop-filter/blur intact, which HTML-based capture cannot. The
// window is located via Tauri's own geometry (not by name) and cropped out of its monitor —
// robust against unrelated windows that happen to contain "Kodama" in their title.
// Windows-only: xcap (the capture crate) doesn't compile on macOS. On other platforms this
// returns an error and the frontend simply sends the report without a screenshot.
#[cfg(windows)]
#[tauri::command]
fn capture_screenshot(app: tauri::AppHandle) -> Result<String, String> {
    use base64::Engine;
    use std::io::Cursor;
    let win = app.get_webview_window("main").ok_or_else(|| "no main window".to_string())?;
    let pos = win.outer_position().map_err(|e| e.to_string())?;
    let size = win.outer_size().map_err(|e| e.to_string())?;
    let monitors = xcap::Monitor::all().map_err(|e| e.to_string())?;
    let cx = pos.x + size.width as i32 / 2;
    let cy = pos.y + size.height as i32 / 2;
    let mon = monitors
        .iter()
        .find(|m| cx >= m.x() && cx < m.x() + m.width() as i32 && cy >= m.y() && cy < m.y() + m.height() as i32)
        .or_else(|| monitors.first())
        .ok_or_else(|| "no monitor".to_string())?;
    let full = mon.capture_image().map_err(|e| e.to_string())?;
    let rx = (pos.x - mon.x()).max(0) as u32;
    let ry = (pos.y - mon.y()).max(0) as u32;
    let rw = size.width.min(full.width().saturating_sub(rx)).max(1);
    let rh = size.height.min(full.height().saturating_sub(ry)).max(1);
    let cropped = xcap::image::imageops::crop_imm(&full, rx, ry, rw, rh).to_image();
    let mut cursor = Cursor::new(Vec::new());
    xcap::image::DynamicImage::ImageRgba8(cropped)
        .write_to(&mut cursor, xcap::image::ImageFormat::Png)
        .map_err(|e| e.to_string())?;
    Ok(base64::engine::general_purpose::STANDARD.encode(cursor.get_ref()))
}

#[cfg(not(windows))]
#[tauri::command]
fn capture_screenshot(_app: tauri::AppHandle) -> Result<String, String> {
    Err("screenshot not supported on this platform".to_string())
}

#[tauri::command]
fn stop_server_cmd(app: tauri::AppHandle) {
    server::stop_server(&app);
}

/// Rebuilds the tray menu with localised labels.
/// Called from the frontend whenever the language changes.
#[tauri::command]
fn update_tray_labels(app: tauri::AppHandle, show_label: String, quit_label: String) {
    let Some(tray) = app.try_state::<AppTray>() else { return };
    let Ok(show) = MenuItem::with_id(&app, "show", show_label, true, None::<&str>) else { return };
    let Ok(quit) = MenuItem::with_id(&app, "quit", quit_label, true, None::<&str>) else { return };
    let Ok(sep)  = PredefinedMenuItem::separator(&app) else { return };
    if let Ok(menu) = Menu::with_items(&app, &[&show, &sep, &quit]) {
        let _ = tray.0.set_menu(Some(menu));
    }
}

/// One-time data migration from the old identifier (Kiyoshi Music) to the new one
/// (Kodama). Runs at the very start of `main()` — BEFORE WebView2 initializes — so
/// the whole data folder (profiles, caches AND the WebView2/localStorage store with
/// pinned playlists & settings) is carried over before the new store gets created.
fn migrate_legacy_data_dir() {
    let roots: Vec<std::path::PathBuf> = {
        #[cfg(windows)]
        { std::env::var("LOCALAPPDATA").ok().map(std::path::PathBuf::from).into_iter().collect() }
        #[cfg(not(windows))]
        {
            let mut v = Vec::new();
            if let Ok(x) = std::env::var("XDG_DATA_HOME") { v.push(std::path::PathBuf::from(x)); }
            if let Ok(h) = std::env::var("HOME") { v.push(std::path::PathBuf::from(h).join(".local/share")); }
            v
        }
    };
    for root in roots {
        let old = root.join("dev.kiyoshi.music");
        let new = root.join("dev.kodama.music");
        if old.is_dir() && !new.exists() {
            match std::fs::rename(&old, &new) {
                Ok(_)  => eprintln!("[migrate] moved {} -> {}", old.display(), new.display()),
                Err(e) => eprintln!("[migrate] failed to move data dir: {e}"),
            }
        }
    }
}

fn main() {
    migrate_legacy_data_dir();

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            // A second instance was started — focus the existing window instead
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.show();
                let _ = win.unminimize();
                let _ = win.set_focus();
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(ServerProcess::new())
        .manage(WasMaximized::new())
        .manage(DiscordRpc::new())
        .manage(AudioPlayer::new())
        .manage(CloseTray(AtomicBool::new(true)))
        .setup(|app| {
            let audio_tx = start_audio_thread(app.handle().clone());
            app.state::<AudioPlayer>().set_sender(audio_tx);

            // Remove the Windows-accent outer border on the borderless main window.
            if let Some(w) = app.get_webview_window("main") {
                window::remove_window_border(&w);
            }

            // macOS: keep the native traffic lights centered against the sidebar's search
            // bar. Tauri's own `traffic_light_position()` only applies once at window
            // construction, so anything that recomputes the titlebar (fullscreen, restoring
            // from maximize, some resizes) snapped the buttons back to their default top-left
            // spot — apply on creation and re-apply on every resize/move so it sticks.
            #[cfg(target_os = "macos")]
            if let Some(w) = app.get_webview_window("main") {
                window::apply_mac_traffic_light_inset(&w);
                let w_for_event = w.clone();
                w.on_window_event(move |event| match event {
                    tauri::WindowEvent::Resized(_) | tauri::WindowEvent::Moved(_) => {
                        window::apply_mac_traffic_light_inset(&w_for_event);
                    }
                    _ => {}
                });
            }

            // Deep-link (kodama://song/<id>): the bundler registers the scheme on release
            // installs, but Linux and Windows-dev need a runtime registration.
            #[cfg(any(target_os = "linux", all(debug_assertions, windows)))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let _ = app.deep_link().register_all();
            }

            // OS media controls (SMTC / Now Playing / MPRIS). setup() runs on the main thread,
            // which souvlaki requires (and where the main window's HWND is available).
            media::init(app.handle());

            #[cfg(windows)]
            start_audio_session_tagger();

            // ── System Tray ────────────────────────────────────────────────────
            let show = MenuItem::with_id(app, "show", "Show Kodama", true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let sep  = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(app, &[&show, &sep, &quit])?;

            let tray = TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&menu)
                .tooltip("Kodama")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    // Links-Klick auf Tray-Icon → Fenster zeigen/fokussieren
                    if let TrayIconEvent::Click { button: MouseButton::Left, .. } = event {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                })
                .build(app)?;

            // Store tray handle so update_tray_labels can call set_menu() on it
            app.manage(AppTray(tray));

            #[cfg(not(debug_assertions))]
            {
                // Spawn server startup on a background thread so the main event loop
                // is never blocked — a blocked setup() freezes WebKit rendering and
                // produces a white window, especially noticeable on Linux AppImage.
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    let mut none: Option<std::process::Child> = None;
                    server::kill_existing_server(&mut none);
                    server::start_server(&handle);
                });
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            set_fullscreen, open_login_window, close_login_window, open_composer_window,
            remove_window_border_for,
            update_discord_rpc, clear_discord_rpc,
            media::media_update, media::media_clear,
            appicon::set_app_icon,
            audio_play, audio_crossfade, audio_pause, audio_resume,
            audio_stop, audio_seek, audio_set_volume,
            relaunch_app, quit_app, stop_server_cmd,
            update_tray_labels, set_close_to_tray,
            capture_screenshot,
            ensure_session_keeper, rotate_session_cookies, stop_session_keeper,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            match event {
                // X-Button → Fenster verstecken statt schließen
                tauri::RunEvent::WindowEvent { ref label, event: tauri::WindowEvent::CloseRequested { api, .. }, .. }
                    if label == "main" =>
                {
                    if app_handle.state::<CloseTray>().0.load(Ordering::Relaxed) {
                        api.prevent_close();
                        if let Some(win) = app_handle.get_webview_window("main") {
                            let _ = win.hide();
                        }
                    }
                }
                // Echtes Beenden (via Tray-Menü oder quit_app-Command)
                tauri::RunEvent::Exit => {
                    disconnect_rpc(app_handle);
                    stop_server(app_handle);
                }
                _ => {}
            }
        });
}
