use rodio::Source;
use std::sync::{Arc, Mutex};
use tauri::Emitter;

use super::analyzer;
use super::decoder::StreamingSource;

pub enum AudioCmd {
    Play { url: String, seek_to: f64 },
    Pause,
    Resume,
    Stop,
    Seek(f64),
    SetVolume(f32),
    // Start `url` on a second sink and crossfade from the current track over `duration` secs.
    Crossfade { url: String, seek_to: f64, duration: f64 },
}

// Build a ready-to-play decoder source for any of our URL kinds (used by Play's progressive
// path and by crossfade). Progressive = stream over HTTP; file:// / http = read fully first.
fn build_streaming_source(url: &str, seek_to: f64) -> Result<StreamingSource, String> {
    if url.contains("/audio-stream/") {
        let hs = super::http_source::HttpStream::new(url.to_string()).map_err(|e| e.to_string())?;
        StreamingSource::new_streaming(Box::new(hs), seek_to)
    } else if let Some(p) = url.strip_prefix("file://") {
        let data = std::fs::read(p.replace("%20", " ")).map_err(|e| format!("File read error: {e}"))?;
        StreamingSource::new_with_seek(data, seek_to)
    } else {
        let client = reqwest::blocking::Client::builder()
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
            .timeout(std::time::Duration::from_secs(120))
            .build()
            .map_err(|e| e.to_string())?;
        let resp = client.get(url).send().map_err(|e| e.to_string())?;
        if !resp.status().is_success() {
            return Err(format!("HTTP {}", resp.status()));
        }
        let data = resp.bytes().map(|b| b.to_vec()).map_err(|e| e.to_string())?;
        StreamingSource::new_with_seek(data, seek_to)
    }
}

pub struct AudioPlayer(Mutex<Option<std::sync::mpsc::SyncSender<AudioCmd>>>);

impl AudioPlayer {
    pub fn new() -> Self {
        AudioPlayer(Mutex::new(None))
    }

    pub fn set_sender(&self, sender: std::sync::mpsc::SyncSender<AudioCmd>) {
        *self.0.lock().unwrap() = Some(sender);
    }
}

pub fn start_audio_thread(app: tauri::AppHandle) -> std::sync::mpsc::SyncSender<AudioCmd> {
    let (tx, rx) = std::sync::mpsc::sync_channel::<AudioCmd>(64);

    // Shared handle to the analysis buffer of the currently-playing source.
    let current_analysis: Arc<Mutex<Option<Arc<analyzer::AnalysisBuffer>>>> =
        Arc::new(Mutex::new(None));

    // ── Visualizer analysis thread: snapshot → FFT → bands, emit ~30fps ──
    {
        let app = app.clone();
        let cur = Arc::clone(&current_analysis);
        std::thread::spawn(move || {
            let mut az: Option<(u32, analyzer::Analyzer)> = None;
            let mut samples = [0.0f32; analyzer::FFT_SIZE];
            let mut bands = [0.0f32; analyzer::NUM_BANDS];
            let mut last_written = 0usize;
            let mut idle_zeros = 0u32;
            loop {
                std::thread::sleep(std::time::Duration::from_millis(33));
                let buf = { cur.lock().unwrap().clone() };
                let written = buf.as_ref().map(|b| b.written()).unwrap_or(0);
                let active = buf.is_some() && written != last_written;
                last_written = written;
                if active {
                    let buf = buf.unwrap();
                    let sr = buf.sample_rate();
                    if az.as_ref().map(|(s, _)| *s != sr).unwrap_or(true) {
                        az = Some((sr, analyzer::Analyzer::new(sr)));
                    }
                    buf.snapshot(&mut samples);
                    let (raw, level) = az.as_ref().unwrap().1.analyze(&samples);
                    bands.copy_from_slice(&raw); // keep last frame for the decay path
                    idle_zeros = 0;
                    let payload: Vec<f32> = raw.iter().map(|b| (b * 1000.0).round() / 1000.0).collect();
                    let _ = app.emit(
                        "audio-levels",
                        serde_json::json!({ "bands": payload, "level": (level * 1000.0).round() / 1000.0 }),
                    );
                } else {
                    // Paused / nothing playing → decay toward zero, then stop emitting.
                    let mut any = false;
                    for b in bands.iter_mut() {
                        if *b > 0.002 { *b *= 0.82; any = true; } else { *b = 0.0; }
                    }
                    if any || idle_zeros < 2 {
                        if !any { idle_zeros += 1; }
                        let payload: Vec<f32> = bands.iter().map(|b| (b * 1000.0).round() / 1000.0).collect();
                        let _ = app.emit("audio-levels", serde_json::json!({ "bands": payload, "level": 0.0 }));
                    }
                }
            }
        });
    }
    let current_analysis = Arc::clone(&current_analysis);

    std::thread::spawn(move || {
        let output = rodio::OutputStream::try_default();
        let (_stream, handle) = match output {
            Ok(pair) => pair,
            Err(e) => {
                eprintln!("[Audio] Output init failed: {e}");
                return;
            }
        };

        let mut sink: Option<rodio::Sink> = None;
        let mut audio_data: Option<Vec<u8>> = None;
        // For progressive (HTTP-streamed) playback: the proxy URL to re-stream from on seek.
        let mut progressive_url: Option<String> = None;
        let mut duration: f64 = 0.0;
        let mut volume: f32 = 0.16f32;
        let mut seek_offset: f64 = 0.0;

        let (data_tx, data_rx) = std::sync::mpsc::channel::<(Vec<u8>, f64, u64)>();
        // Progressive path delivers an already-probed, ready-to-play StreamingSource built off
        // the audio thread (so the probe's network reads don't block command handling).
        let (source_tx, source_rx) =
            std::sync::mpsc::channel::<(super::decoder::StreamingSource, u64, bool)>();

        // ── Crossfade: a second sink for the incoming track + a linear volume ramp ──
        let mut sink2: Option<rodio::Sink> = None;
        let mut duration2: f64 = 0.0;
        let mut prog_url2: Option<String> = None;
        let mut xfade_start: Option<std::time::Instant> = None;
        let mut xfade_dur: f64 = 0.0;
        let (xsource_tx, xsource_rx) =
            std::sync::mpsc::channel::<(super::decoder::StreamingSource, String, f64, u64)>();

        let mut play_gen: u64 = 0;

        loop {
            while let Ok((data, seek_to, gen)) = data_rx.try_recv() {
                if gen != play_gen {
                    eprintln!("[Audio] Ignoring stale download (gen {gen} != {play_gen})");
                    continue;
                }
                eprintln!("[Audio] Received {} bytes for decoding", data.len());
                if let Some(s) = sink.take() {
                    s.stop();
                }
                duration = 0.0;
                seek_offset = 0.0;
                audio_data = Some(data.clone());

                match StreamingSource::new(data) {
                    Ok(mut source) => {
                        duration = source
                            .total_duration()
                            .map(|d| d.as_secs_f64())
                            .unwrap_or(0.0);
                        eprintln!("[Audio] Streaming started, duration={duration:.1}s");
                        match rodio::Sink::try_new(&handle) {
                            Ok(new_sink) => {
                                new_sink.set_volume(volume);
                                *current_analysis.lock().unwrap() = Some(source.enable_analysis());
                                new_sink.append(source);
                                if seek_to > 0.05 {
                                    let _ = new_sink
                                        .try_seek(std::time::Duration::from_secs_f64(seek_to));
                                }
                                let _ = app.emit(
                                    "audio-loaded",
                                    serde_json::json!({ "duration": duration }),
                                );
                                sink = Some(new_sink);
                            }
                            Err(e) => eprintln!("[Audio] Sink error: {e}"),
                        }
                    }
                    Err(e) => {
                        eprintln!("[Audio] Decode error: {e}");
                        let _ = app.emit("audio-error", format!("{e}"));
                    }
                }
            }

            // Progressive (HTTP-streamed) sources, already probed off-thread.
            while let Ok((mut source, gen, start_paused)) = source_rx.try_recv() {
                if gen != play_gen {
                    eprintln!("[Audio] Ignoring stale stream source (gen {gen} != {play_gen})");
                    continue;
                }
                if let Some(s) = sink.take() {
                    s.stop();
                }
                // seek_offset was set by the Play/Seek handler (the source decodes from there).
                duration = source.total_duration().map(|d| d.as_secs_f64()).unwrap_or(0.0);
                match rodio::Sink::try_new(&handle) {
                    Ok(new_sink) => {
                        new_sink.set_volume(volume);
                        *current_analysis.lock().unwrap() = Some(source.enable_analysis());
                        new_sink.append(source);
                        if start_paused {
                            new_sink.pause();
                        }
                        let _ = app.emit("audio-loaded", serde_json::json!({ "duration": duration }));
                        sink = Some(new_sink);
                        eprintln!("[Audio] Progressive stream playing, duration={duration:.1}s");
                    }
                    Err(e) => eprintln!("[Audio] Sink error: {e}"),
                }
            }

            // Incoming crossfade source: start it on sink2 at volume 0 and begin the ramp.
            while let Ok((mut source, url, dur, gen)) = xsource_rx.try_recv() {
                if gen != play_gen || sink.is_none() {
                    // Superseded (track changed) or the outgoing track already ended
                    // during the build — abort so the frontend can resume normally.
                    let _ = app.emit("audio-crossfade-failed", ());
                    continue;
                }
                if let Some(s) = sink2.take() {
                    s.stop();
                }
                duration2 = source.total_duration().map(|d| d.as_secs_f64()).unwrap_or(0.0);
                prog_url2 = if url.contains("/audio-stream/") { Some(url) } else { None };
                match rodio::Sink::try_new(&handle) {
                    Ok(s2) => {
                        s2.set_volume(0.0);
                        // The visualizer follows the incoming track (the UI already shows it).
                        *current_analysis.lock().unwrap() = Some(source.enable_analysis());
                        s2.append(source);
                        sink2 = Some(s2);
                        xfade_start = Some(std::time::Instant::now());
                        xfade_dur = dur.max(0.1);
                        let _ = app.emit("audio-loaded", serde_json::json!({ "duration": duration2 }));
                        let _ = app.emit("audio-crossfade-started", ());
                        eprintln!("[Audio] Crossfade started over {xfade_dur:.1}s, next duration={duration2:.1}s");
                    }
                    Err(e) => {
                        let _ = app.emit("audio-crossfade-failed", ());
                        eprintln!("[Audio] Crossfade sink error: {e}");
                    }
                }
            }

            while let Ok(cmd) = rx.try_recv() {
                match cmd {
                    AudioCmd::Play { url, seek_to } => {
                        if let Some(s) = sink.take() {
                            s.stop();
                        }
                        if let Some(s) = sink2.take() {
                            s.stop();
                        }
                        xfade_start = None;
                        prog_url2 = None;
                        duration = 0.0;
                        seek_offset = 0.0;
                        audio_data = None;
                        progressive_url = None;
                        play_gen += 1;
                        let gen = play_gen;

                        // Progressive: the /audio-stream proxy streams with byte-range support →
                        // build the streaming source off-thread and play as soon as it's probed.
                        if url.contains("/audio-stream/") {
                            progressive_url = Some(url.clone());
                            seek_offset = seek_to; // source decodes from seek_to; report offset
                            let stx = source_tx.clone();
                            let dl_app = app.clone();
                            std::thread::spawn(move || {
                                eprintln!("[Audio] Progressive stream (gen {gen})");
                                let built = super::http_source::HttpStream::new(url)
                                    .map_err(|e| e.to_string())
                                    .and_then(|hs| {
                                        super::decoder::StreamingSource::new_streaming(Box::new(hs), seek_to)
                                    });
                                match built {
                                    Ok(source) => { let _ = stx.send((source, gen, false)); }
                                    Err(e) => {
                                        eprintln!("[Audio] Progressive load error (gen {gen}): {e}");
                                        let _ = dl_app.emit("audio-error", format!("Stream failed: {e}"));
                                    }
                                }
                            });
                            continue;
                        }

                        let dtx = data_tx.clone();
                        let dl_app = app.clone();

                        std::thread::spawn(move || {
                            let result = if url.starts_with("file://") {
                                let path = url.strip_prefix("file://").unwrap();
                                let path = path.replace("%20", " ");
                                eprintln!("[Audio] Reading from disk (gen {gen}): {path}");
                                std::fs::read(&path).map_err(|e| format!("File read error: {e}"))
                            } else {
                                eprintln!(
                                    "[Audio] HTTP download (gen {gen}): {}…",
                                    &url[..url.len().min(80)]
                                );
                                (|| -> Result<Vec<u8>, String> {
                                    let client = reqwest::blocking::Client::builder()
                                        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
                                        .timeout(std::time::Duration::from_secs(120))
                                        .build()
                                        .map_err(|e| e.to_string())?;
                                    let resp =
                                        client.get(&url).send().map_err(|e| e.to_string())?;
                                    if !resp.status().is_success() {
                                        return Err(format!("HTTP {}", resp.status()));
                                    }
                                    resp.bytes().map(|b| b.to_vec()).map_err(|e| e.to_string())
                                })()
                            };
                            match result {
                                Ok(data) => {
                                    eprintln!("[Audio] Loaded {} bytes (gen {gen})", data.len());
                                    let _ = dtx.send((data, seek_to, gen));
                                }
                                Err(e) => {
                                    eprintln!("[Audio] Load error (gen {gen}): {e}");
                                    let _ = dl_app.emit("audio-error", format!("Load failed: {e}"));
                                }
                            }
                        });
                    }
                    AudioCmd::Pause => {
                        if let Some(s) = &sink {
                            s.pause();
                        }
                        if let Some(s) = &sink2 {
                            s.pause();
                        }
                    }
                    AudioCmd::Resume => {
                        if let Some(s) = &sink {
                            s.play();
                        }
                        if let Some(s) = &sink2 {
                            s.play();
                        }
                    }
                    AudioCmd::Stop => {
                        if let Some(s) = sink.take() {
                            s.stop();
                        }
                        if let Some(s) = sink2.take() {
                            s.stop();
                        }
                        xfade_start = None;
                        prog_url2 = None;
                        duration = 0.0;
                        audio_data = None;
                        progressive_url = None;
                    }
                    AudioCmd::Seek(t) => {
                        let was_paused = sink.as_ref().map(|s| s.is_paused()).unwrap_or(false);
                        if let Some(url) = progressive_url.clone() {
                            // Progressive: re-open the ranged HTTP stream at the seek position.
                            if let Some(s) = sink.take() {
                                s.stop();
                            }
                            seek_offset = t;
                            play_gen += 1;
                            let gen = play_gen;
                            let stx = source_tx.clone();
                            std::thread::spawn(move || {
                                let built = super::http_source::HttpStream::new(url)
                                    .map_err(|e| e.to_string())
                                    .and_then(|hs| {
                                        super::decoder::StreamingSource::new_streaming(Box::new(hs), t)
                                    });
                                if let Ok(source) = built {
                                    let _ = stx.send((source, gen, was_paused));
                                }
                            });
                        } else if let Some(ref data) = audio_data {
                            if let Some(s) = sink.take() {
                                s.stop();
                            }
                            if let Ok(mut source) = StreamingSource::new_with_seek(data.clone(), t) {
                                seek_offset = t;
                                if let Ok(new_sink) = rodio::Sink::try_new(&handle) {
                                    new_sink.set_volume(volume);
                                    *current_analysis.lock().unwrap() = Some(source.enable_analysis());
                                    new_sink.append(source);
                                    if was_paused {
                                        new_sink.pause();
                                    }
                                    sink = Some(new_sink);
                                    eprintln!("[Audio] Seeked to {t:.1}s");
                                }
                            }
                        }
                    }
                    AudioCmd::SetVolume(v) => {
                        volume = v;
                        // During a crossfade the two sinks are mid-ramp; rescale both to keep
                        // their relative fade. Otherwise just set the single sink.
                        if let Some(start) = xfade_start {
                            let p = (start.elapsed().as_secs_f64() / xfade_dur).clamp(0.0, 1.0) as f32;
                            if let Some(s) = &sink { s.set_volume(v * (1.0 - p)); }
                            if let Some(s) = &sink2 { s.set_volume(v * p); }
                        } else if let Some(s) = &sink {
                            s.set_volume(v);
                        }
                    }
                    AudioCmd::Crossfade { url, seek_to, duration } => {
                        // Only meaningful if something is currently playing to fade from.
                        if sink.is_some() && xfade_start.is_none() {
                            let gen = play_gen;
                            let xtx = xsource_tx.clone();
                            let dl_app = app.clone();
                            std::thread::spawn(move || {
                                match build_streaming_source(&url, seek_to) {
                                    Ok(source) => { let _ = xtx.send((source, url, duration, gen)); }
                                    Err(e) => {
                                        eprintln!("[Audio] Crossfade build error: {e}");
                                        let _ = dl_app.emit("audio-crossfade-failed", ());
                                    }
                                }
                            });
                        }
                    }
                }
            }

            // ── Crossfade ramp + promotion ──
            if let Some(start) = xfade_start {
                let p = (start.elapsed().as_secs_f64() / xfade_dur).clamp(0.0, 1.0) as f32;
                if let Some(s) = &sink { s.set_volume(volume * (1.0 - p)); }
                if let Some(s) = &sink2 { s.set_volume(volume * p); }
                // Done when the ramp completes or the outgoing track runs out.
                let out_ended = sink.as_ref().map(|s| s.empty()).unwrap_or(true);
                if p >= 1.0 || out_ended {
                    if let Some(s) = sink.take() { s.stop(); }
                    sink = sink2.take();
                    if let Some(s) = &sink { s.set_volume(volume); }
                    duration = duration2;
                    seek_offset = 0.0;
                    audio_data = None;
                    progressive_url = prog_url2.take();
                    xfade_start = None;
                    let _ = app.emit("audio-crossfade-done", ());
                    eprintln!("[Audio] Crossfade promoted incoming track");
                }
            }

            // Report progress for whatever the UI is showing: during a crossfade that's the
            // incoming track (sink2); otherwise the primary sink.
            if let Some(s) = sink2.as_ref().filter(|_| xfade_start.is_some()) {
                let _ = app.emit(
                    "audio-progress",
                    serde_json::json!({ "position": s.get_pos().as_secs_f64(), "duration": duration2, "paused": s.is_paused() }),
                );
            } else if let Some(s) = &sink {
                let pos = s.get_pos().as_secs_f64() + seek_offset;
                let paused = s.is_paused();
                let ended = s.empty();
                let _ = app.emit(
                    "audio-progress",
                    serde_json::json!({ "position": pos, "duration": duration, "paused": paused }),
                );
                if ended {
                    sink = None;
                    duration = 0.0;
                    let _ = app.emit("audio-ended", ());
                }
            }

            std::thread::sleep(std::time::Duration::from_millis(100));
        }
    });

    tx
}

pub fn send_audio(state: &tauri::State<AudioPlayer>, cmd: AudioCmd) -> Result<(), String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    guard
        .as_ref()
        .ok_or_else(|| "Audio player not initialized".to_string())?
        .send(cmd)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn audio_play(
    state: tauri::State<AudioPlayer>,
    url: String,
    seek_to: f64,
) -> Result<(), String> {
    let is_local = url.starts_with("file://") || {
        let p = std::path::Path::new(&url);
        p.is_absolute() && url.contains("kiyoshi-audio")
    };
    let is_local_http =
        url.starts_with("http://localhost:") || url.starts_with("http://127.0.0.1:");
    if !is_local && !is_local_http {
        return Err("audio_play: rejected non-local URL".into());
    }
    send_audio(&state, AudioCmd::Play { url, seek_to })
}

#[tauri::command]
pub fn audio_crossfade(
    state: tauri::State<AudioPlayer>,
    url: String,
    seek_to: f64,
    duration: f64,
) -> Result<(), String> {
    let is_local = url.starts_with("file://") || {
        let p = std::path::Path::new(&url);
        p.is_absolute() && url.contains("kiyoshi-audio")
    };
    let is_local_http =
        url.starts_with("http://localhost:") || url.starts_with("http://127.0.0.1:");
    if !is_local && !is_local_http {
        return Err("audio_crossfade: rejected non-local URL".into());
    }
    send_audio(&state, AudioCmd::Crossfade { url, seek_to, duration })
}

#[tauri::command]
pub fn audio_pause(state: tauri::State<AudioPlayer>) -> Result<(), String> {
    send_audio(&state, AudioCmd::Pause)
}

#[tauri::command]
pub fn audio_resume(state: tauri::State<AudioPlayer>) -> Result<(), String> {
    send_audio(&state, AudioCmd::Resume)
}

#[tauri::command]
pub fn audio_stop(state: tauri::State<AudioPlayer>) -> Result<(), String> {
    send_audio(&state, AudioCmd::Stop)
}

#[tauri::command]
pub fn audio_seek(state: tauri::State<AudioPlayer>, position: f64) -> Result<(), String> {
    send_audio(&state, AudioCmd::Seek(position))
}

#[tauri::command]
pub fn audio_set_volume(state: tauri::State<AudioPlayer>, volume: f32) -> Result<(), String> {
    send_audio(&state, AudioCmd::SetVolume(volume))
}
