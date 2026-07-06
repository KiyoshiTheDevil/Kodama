// OS media controls via `souvlaki`: Windows SMTC (the volume-flyout media tile, lock screen,
// keyboard media keys), macOS Now Playing / MPRemoteCommandCenter, Linux MPRIS.
//
// souvlaki's MediaControls is platform-bound and not Send/Sync (COM on Windows, AppKit on
// macOS must be the main thread), so we keep it in a main-thread thread-local and only ever
// touch it from the main thread (commands marshal via AppHandle::run_on_main_thread).
use std::cell::RefCell;
use std::time::Duration;

use souvlaki::{MediaControlEvent, MediaControls, MediaMetadata, MediaPlayback, MediaPosition, PlatformConfig};
use tauri::{AppHandle, Emitter, Manager};

thread_local! {
    static CONTROLS: RefCell<Option<MediaControls>> = const { RefCell::new(None) };
    // Signature of the metadata last pushed to the OS. The frontend refreshes every ~15s to
    // keep the elapsed time accurate, but on Windows `set_metadata` re-uploads the cover to
    // SMTC (WinRT/COM work on the UI thread) and janks a frame. We skip it when the metadata
    // is unchanged and only update playback state/position — which is cheap.
    static LAST_META: RefCell<Option<String>> = const { RefCell::new(None) };
}

/// Create the OS media controls and forward button presses to the frontend as a
/// `media-control` event. MUST be called on the main thread (call from setup()).
pub fn init(app: &AppHandle) {
    #[cfg(target_os = "windows")]
    let hwnd: Option<*mut std::ffi::c_void> = app
        .get_webview_window("main")
        .and_then(|w| w.hwnd().ok())
        .map(|h| h.0 as *mut std::ffi::c_void);
    #[cfg(not(target_os = "windows"))]
    let hwnd: Option<*mut std::ffi::c_void> = None;

    let config = PlatformConfig {
        dbus_name: "kodama",
        display_name: "Kodama",
        hwnd,
    };

    let mut controls = match MediaControls::new(config) {
        Ok(c) => c,
        Err(e) => {
            eprintln!("[media] failed to create OS media controls: {:?}", e);
            return;
        }
    };

    let app_handle = app.clone();
    let attached = controls.attach(move |event: MediaControlEvent| {
        let emit = |action: &str| {
            let _ = app_handle.emit("media-control", serde_json::json!({ "action": action }));
        };
        match event {
            MediaControlEvent::Play => emit("play"),
            MediaControlEvent::Pause => emit("pause"),
            MediaControlEvent::Toggle => emit("toggle"),
            MediaControlEvent::Next => emit("next"),
            MediaControlEvent::Previous => emit("previous"),
            MediaControlEvent::Stop => emit("stop"),
            MediaControlEvent::SetPosition(MediaPosition(d)) => {
                let _ = app_handle.emit(
                    "media-control",
                    serde_json::json!({ "action": "seek", "position": d.as_secs_f64() }),
                );
            }
            _ => {}
        }
    });
    if let Err(e) = attached {
        eprintln!("[media] failed to attach media controls: {:?}", e);
        return;
    }

    CONTROLS.with(|c| *c.borrow_mut() = Some(controls));
}

/// Push the current track's metadata + playback state. Main-thread only.
fn apply(title: String, artist: String, album: String, cover: String, duration: f64, playing: bool, elapsed: f64) {
    CONTROLS.with(|cell| {
        if let Some(controls) = cell.borrow_mut().as_mut() {
            // Only re-push metadata (incl. the cover, the expensive part) when it actually
            // changed — the periodic elapsed-time refresh otherwise janks a frame every 15s.
            let sig = format!("{title}\u{1}{artist}\u{1}{album}\u{1}{cover}\u{1}{duration}");
            let changed = LAST_META.with(|m| {
                let mut m = m.borrow_mut();
                if m.as_deref() == Some(sig.as_str()) {
                    false
                } else {
                    *m = Some(sig);
                    true
                }
            });
            if changed {
                let _ = controls.set_metadata(MediaMetadata {
                    title: Some(&title),
                    artist: Some(&artist),
                    album: if album.is_empty() { None } else { Some(&album) },
                    cover_url: if cover.is_empty() { None } else { Some(&cover) },
                    duration: if duration > 0.0 { Some(Duration::from_secs_f64(duration)) } else { None },
                });
            }
            let progress = Some(MediaPosition(Duration::from_secs_f64(elapsed.max(0.0))));
            let _ = controls.set_playback(if playing {
                MediaPlayback::Playing { progress }
            } else {
                MediaPlayback::Paused { progress }
            });
        }
    });
}

fn clear() {
    LAST_META.with(|m| *m.borrow_mut() = None);
    CONTROLS.with(|cell| {
        if let Some(controls) = cell.borrow_mut().as_mut() {
            let _ = controls.set_playback(MediaPlayback::Stopped);
        }
    });
}

// ── Tauri commands (called from the frontend; marshal onto the main thread) ──
#[tauri::command]
pub fn media_update(
    app: AppHandle,
    title: String,
    artist: String,
    album: String,
    thumbnail: String,
    duration: f64,
    elapsed: f64,
    paused: bool,
) {
    let _ = app.run_on_main_thread(move || {
        apply(title, artist, album, thumbnail, duration, !paused, elapsed);
    });
}

#[tauri::command]
pub fn media_clear(app: AppHandle) {
    let _ = app.run_on_main_thread(clear);
}
