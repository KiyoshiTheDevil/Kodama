// App-icon personalization (Stufe 1 + 3).
//
// Stufe 1 (all platforms): change the *running* app's icon — the taskbar/window icon on
// Windows and the menu-bar tray icon — via Tauri's own Image API. This is what the user
// sees while the app is open. The static pinned-shortcut / .exe icon is NOT touched.
//
// Stufe 3 (macOS only): additionally set the Dock icon (NSApplication, live) and write a
// custom icon onto the .app bundle (NSWorkspace, persists in Finder/Dock even when the app
// isn't running). Both Cocoa calls must run on the main thread.

use tauri::Manager;

#[tauri::command]
pub fn set_app_icon(app: tauri::AppHandle, file: String) -> Result<(), String> {
    // Guard against path traversal: only a bare file name is allowed.
    if file.contains('/') || file.contains('\\') || file.contains("..") {
        return Err("invalid icon name".into());
    }

    let res_dir = app.path().resource_dir().map_err(|e| e.to_string())?;
    let icon_path = res_dir.join("App-Icons").join(&file);
    if !icon_path.exists() {
        return Err(format!("icon not found: {}", icon_path.display()));
    }

    // Stufe 1: window + tray icon (cross-platform, via the image-png feature).
    let image = tauri::image::Image::from_path(&icon_path).map_err(|e| e.to_string())?;
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.set_icon(image.clone());
    }
    if let Some(tray) = app.try_state::<crate::AppTray>() {
        let _ = tray.0.set_icon(Some(image.clone()));
    }

    // Stufe 3: macOS Dock (live) + .app bundle (persistent).
    #[cfg(target_os = "macos")]
    {
        let path_str = icon_path.to_string_lossy().to_string();
        let _ = app.run_on_main_thread(move || unsafe { set_macos_icon(&path_str) });
    }

    Ok(())
}

#[cfg(target_os = "macos")]
unsafe fn set_macos_icon(png_path: &str) {
    use cocoa::base::{id, nil};
    use cocoa::foundation::NSString;
    use objc::{class, msg_send, sel, sel_impl};

    let path: id = NSString::alloc(nil).init_str(png_path);
    let image: id = msg_send![class!(NSImage), alloc];
    let image: id = msg_send![image, initWithContentsOfFile: path];
    if image == nil {
        return;
    }

    // Dock icon of the running instance.
    let nsapp: id = msg_send![class!(NSApplication), sharedApplication];
    let _: () = msg_send![nsapp, setApplicationIconImage: image];

    // Persistent custom icon on the .app bundle (survives relaunch, shows in Finder/Dock).
    let workspace: id = msg_send![class!(NSWorkspace), sharedWorkspace];
    let bundle: id = msg_send![class!(NSBundle), mainBundle];
    let bundle_path: id = msg_send![bundle, bundlePath];
    let _: bool = msg_send![workspace, setIcon: image forFile: bundle_path options: 0u64];
}
