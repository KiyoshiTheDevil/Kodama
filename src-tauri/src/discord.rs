use discord_rich_presence::{activity, DiscordIpc, DiscordIpcClient};
use std::sync::Mutex;
use tauri::Manager;

pub struct DiscordRpc(Mutex<Option<DiscordIpcClient>>);

impl DiscordRpc {
    pub fn new() -> Self {
        let drpc: Option<DiscordIpcClient> = (|| {
            let mut client = DiscordIpcClient::new("1483291004067909642").ok()?;
            client.connect().ok()?;
            Some(client)
        })();
        DiscordRpc(Mutex::new(drpc))
    }
}

#[tauri::command]
pub fn update_discord_rpc(
    state: tauri::State<'_, DiscordRpc>,
    title: String,
    artist: String,
    album: String,
    thumbnail: String,
    duration: f64,
    elapsed: f64,
    video_id: String,
    paused: bool,
) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;

    if guard.is_none() {
        if let Ok(mut client) = DiscordIpcClient::new("1483291004067909642") {
            if client.connect().is_ok() {
                *guard = Some(client);
            }
        }
    }

    let client = guard.as_mut().ok_or("Discord not running")?;

    let yt_url = format!("https://music.youtube.com/watch?v={}", video_id);

    // Discord requires details/state/large_text to be 2–128 characters. Tracks with
    // sparse metadata (e.g. plain video audio: no artist, or a very long title) would
    // otherwise be rejected entirely. Clamp to 128 chars and omit fields that are empty.
    fn clamp128(s: &str) -> String {
        s.trim().chars().take(128).collect()
    }
    let title_c = clamp128(&title);
    let artist_c = clamp128(&artist);
    let album_c = clamp128(&album);

    let mut assets = activity::Assets::new();
    if !thumbnail.is_empty() {
        assets = assets.large_image(&thumbnail);
    }
    if album_c.chars().count() >= 2 {
        assets = assets.large_text(&album_c);
    }
    let button = activity::Button::new("Listen on YouTube Music", &yt_url);

    let state_str = if paused {
        if artist_c.chars().count() >= 2 { format!("{} · ⏸", artist_c) } else { String::new() }
    } else {
        artist_c.clone()
    };

    let mut act = activity::Activity::new()
        .activity_type(activity::ActivityType::Listening)
        .assets(assets)
        .buttons(vec![button]);

    if title_c.chars().count() >= 2 {
        act = act.details(&title_c);
    }
    if state_str.chars().count() >= 2 {
        act = act.state(&state_str);
    }

    if !paused {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs() as i64;
        let start = now - elapsed as i64;
        let end = if duration > 0.0 {
            now + (duration - elapsed) as i64
        } else {
            0
        };
        act = act.timestamps(activity::Timestamps::new().start(start).end(end));
    }

    match client.set_activity(act.clone()) {
        Ok(_) => {}
        Err(_) => {
            if client.reconnect().is_ok() {
                let _ = client.set_activity(act);
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn clear_discord_rpc(state: tauri::State<'_, DiscordRpc>) -> Result<(), String> {
    let mut guard = state.0.lock().map_err(|e| e.to_string())?;
    if let Some(client) = guard.as_mut() {
        let _ = client.clear_activity();
    }
    Ok(())
}

pub fn disconnect_rpc(app_handle: &tauri::AppHandle) {
    let drpc: tauri::State<DiscordRpc> = app_handle.state();
    let mut guard = match drpc.0.lock() {
        Ok(g) => g,
        Err(_) => return,
    };
    if let Some(client) = guard.as_mut() {
        let _ = client.clear_activity();
        std::thread::sleep(std::time::Duration::from_millis(100));
        let _ = client.close();
    }
}
