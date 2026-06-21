use std::process::Child;
use std::sync::Mutex;
use tauri::Manager;

pub struct ServerProcess(Mutex<Option<Child>>);

impl ServerProcess {
    pub fn new() -> Self {
        ServerProcess(Mutex::new(None))
    }
}

#[allow(dead_code)]
fn wait_for_server(max_ms: u64) -> bool {
    let start = std::time::Instant::now();
    while start.elapsed().as_millis() < max_ms as u128 {
        if let Ok(stream) = std::net::TcpStream::connect("127.0.0.1:9847") {
            drop(stream);
            return true;
        }
        std::thread::sleep(std::time::Duration::from_millis(200));
    }
    false
}

fn shutdown_via_http() {
    use std::io::Write;
    if let Ok(mut stream) = std::net::TcpStream::connect_timeout(
        &"127.0.0.1:9847".parse().unwrap(),
        std::time::Duration::from_millis(500),
    ) {
        let _ = stream.set_write_timeout(Some(std::time::Duration::from_millis(500)));
        let _ = stream
            .write_all(b"POST /shutdown HTTP/1.0\r\nHost: localhost\r\nContent-Length: 0\r\n\r\n");
    }
}

pub fn kill_existing_server(child: &mut Option<Child>) {
    shutdown_via_http();
    std::thread::sleep(std::time::Duration::from_millis(400));

    if let Some(mut c) = child.take() {
        let _ = c.kill();
        std::thread::sleep(std::time::Duration::from_millis(200));
    }

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        let _ = std::process::Command::new("taskkill")
            .args(["/F", "/T", "/IM", "kodama-server.exe"])
            .creation_flags(CREATE_NO_WINDOW)
            .output();
        if let Ok(out) = std::process::Command::new("netstat")
            .args(["-ano"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
        {
            let text = String::from_utf8_lossy(&out.stdout);
            for line in text.lines() {
                if line.contains(":9847") && line.contains("LISTENING") {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if let Some(pid) = parts.last() {
                        let _ = std::process::Command::new("taskkill")
                            .args(["/F", "/T", "/PID", pid])
                            .creation_flags(CREATE_NO_WINDOW)
                            .output();
                    }
                }
            }
        }
        std::thread::sleep(std::time::Duration::from_millis(200));
    }

}

#[allow(dead_code)]
pub fn start_server(app: &tauri::AppHandle) {
    let server_bin = "kodama-server.exe";

    let exe_dir = std::env::current_exe()
        .ok()
        .and_then(|e| e.parent().map(|p| p.to_path_buf()))
        .unwrap_or_else(|| std::path::PathBuf::from("."));

    let candidates: Vec<std::path::PathBuf> = vec![
        exe_dir.join(server_bin),
    ];

    let server_exe = match candidates.iter().find(|p| p.exists()) {
        Some(p) => {
            eprintln!("[server] Found binary at: {}", p.display());
            p.clone()
        }
        None => {
            eprintln!("[server] Binary '{}' not found.", server_bin);
            for p in &candidates {
                eprintln!("[server]   - {}", p.display());
            }
            return;
        }
    };

    use std::os::windows::process::CommandExt;
    const CREATE_NO_WINDOW: u32 = 0x08000000;
    match std::process::Command::new(&server_exe)
        .creation_flags(CREATE_NO_WINDOW)
        .spawn()
    {
        Ok(child) => { *app.state::<ServerProcess>().0.lock().unwrap() = Some(child); }
        Err(e) => { eprintln!("[server] Failed to spawn {}: {}", server_exe.display(), e); return; }
    }

    // Wait for the server to accept connections (runs on a background thread,
    // so blocking here does NOT freeze the UI).
    wait_for_server(15000);
}

pub fn stop_server(app_handle: &tauri::AppHandle) {
    let state: tauri::State<ServerProcess> = app_handle.state();
    let mut child_opt = state.0.lock().ok().and_then(|mut g| g.take());
    kill_existing_server(&mut child_opt);
}
