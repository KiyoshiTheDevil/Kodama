use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::Arc;

pub struct SampleRing {
    buf: Vec<std::sync::atomic::AtomicU32>,
    write_pos: AtomicUsize,
    read_pos: AtomicUsize,
    done: AtomicBool,
}

impl SampleRing {
    pub fn new(cap: usize) -> Self {
        let mut buf = Vec::with_capacity(cap);
        for _ in 0..cap {
            buf.push(std::sync::atomic::AtomicU32::new(0));
        }
        SampleRing {
            buf,
            write_pos: AtomicUsize::new(0),
            read_pos: AtomicUsize::new(0),
            done: AtomicBool::new(false),
        }
    }

    #[allow(dead_code)]
    pub fn capacity(&self) -> usize {
        self.buf.len()
    }

    pub fn push(&self, sample: f32) -> bool {
        let wp = self.write_pos.load(Ordering::Relaxed);
        let rp = self.read_pos.load(Ordering::Acquire);
        if wp - rp >= self.buf.len() {
            return false;
        }
        self.buf[wp % self.buf.len()].store(sample.to_bits(), Ordering::Relaxed);
        self.write_pos.store(wp + 1, Ordering::Release);
        true
    }

    pub fn pop(&self) -> Option<f32> {
        let rp = self.read_pos.load(Ordering::Relaxed);
        let wp = self.write_pos.load(Ordering::Acquire);
        if rp >= wp {
            return None;
        }
        let val = f32::from_bits(self.buf[rp % self.buf.len()].load(Ordering::Relaxed));
        self.read_pos.store(rp + 1, Ordering::Release);
        Some(val)
    }

    pub fn set_done(&self) {
        self.done.store(true, Ordering::Release);
    }
    pub fn is_done(&self) -> bool {
        self.done.load(Ordering::Acquire)
    }
    pub fn write_pos(&self) -> usize {
        self.write_pos.load(Ordering::Relaxed)
    }
}

pub struct StreamingSource {
    ring: Arc<SampleRing>,
    channels: u16,
    sample_rate: u32,
    total_duration: Option<std::time::Duration>,
    analysis: Option<Arc<super::analyzer::AnalysisBuffer>>,
    tap_pos: u64,
}

pub struct ProbeResult {
    pub channels: u16,
    pub sample_rate: u32,
    pub total_duration: Option<std::time::Duration>,
    pub track_id: u32,
}

pub fn probe_audio(data: &[u8]) -> Result<ProbeResult, String> {
    use symphonia::core::formats::FormatOptions;
    use symphonia::core::io::MediaSourceStream;
    use symphonia::core::meta::MetadataOptions;
    use symphonia::core::probe::Hint;

    let cursor = std::io::Cursor::new(data.to_vec());
    let mss = MediaSourceStream::new(Box::new(cursor), Default::default());

    let probed = symphonia::default::get_probe()
        .format(
            &Hint::new(),
            mss,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        )
        .map_err(|e| format!("probe error: {e}"))?;

    let track = probed
        .format
        .default_track()
        .ok_or_else(|| "no default track".to_string())?;

    let channels = track
        .codec_params
        .channels
        .map(|c| c.count() as u16)
        .unwrap_or(2);
    let sample_rate = track.codec_params.sample_rate.unwrap_or(48000);
    let track_id = track.id;

    let total_duration = track
        .codec_params
        .n_frames
        .map(|frames| std::time::Duration::from_secs_f64(frames as f64 / sample_rate as f64));

    Ok(ProbeResult {
        channels,
        sample_rate,
        total_duration,
        track_id,
    })
}

pub fn spawn_decoder(data: Vec<u8>, track_id: u32, ring: Arc<SampleRing>, seek_to_secs: f64) {
    std::thread::spawn(move || {
        use symphonia::core::codecs::DecoderOptions;
        use symphonia::core::formats::{FormatOptions, SeekMode, SeekTo};
        use symphonia::core::io::MediaSourceStream;
        use symphonia::core::meta::MetadataOptions;
        use symphonia::core::probe::Hint;
        use symphonia::core::units::Time;

        let cursor = std::io::Cursor::new(data);
        let mss = MediaSourceStream::new(Box::new(cursor), Default::default());

        let probed = match symphonia::default::get_probe().format(
            &Hint::new(),
            mss,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        ) {
            Ok(p) => p,
            Err(e) => {
                eprintln!("[Audio] decoder thread probe error: {e}");
                ring.set_done();
                return;
            }
        };

        let mut format = probed.format;
        let track = match format.default_track() {
            Some(t) => t,
            None => {
                ring.set_done();
                return;
            }
        };

        let mut decoder = match symphonia::default::get_codecs()
            .make(&track.codec_params, &DecoderOptions::default())
        {
            Ok(d) => d,
            Err(e) => {
                eprintln!("[Audio] decoder thread codec error: {e}");
                ring.set_done();
                return;
            }
        };

        if seek_to_secs > 0.05 {
            let seek_to = SeekTo::Time {
                time: Time::from(seek_to_secs),
                track_id: None,
            };
            match format.seek(SeekMode::Coarse, seek_to) {
                Ok(_) => {
                    eprintln!("[Audio] decoder seeked to {seek_to_secs:.1}s");
                }
                Err(e) => {
                    eprintln!("[Audio] decoder seek failed: {e}, decoding from start");
                }
            }
        }

        loop {
            let packet = match format.next_packet() {
                Ok(p) => p,
                Err(symphonia::core::errors::Error::IoError(ref e))
                    if e.kind() == std::io::ErrorKind::UnexpectedEof =>
                {
                    break
                }
                Err(symphonia::core::errors::Error::ResetRequired) => break,
                Err(_) => break,
            };
            if packet.track_id() != track_id {
                continue;
            }

            let decoded = match decoder.decode(&packet) {
                Ok(d) => d,
                Err(_) => continue,
            };

            let spec = *decoded.spec();
            let num_frames = decoded.frames();
            let mut sample_buf =
                symphonia::core::audio::SampleBuffer::<f32>::new(num_frames as u64, spec);
            sample_buf.copy_interleaved_ref(decoded);

            for &s in sample_buf.samples() {
                while !ring.push(s) {
                    std::thread::sleep(std::time::Duration::from_micros(100));
                }
            }
        }

        ring.set_done();
        eprintln!(
            "[Audio] decoder thread finished, wrote {} samples",
            ring.write_pos()
        );
    });
}

impl StreamingSource {
    pub fn new(data: Vec<u8>) -> Result<Self, String> {
        Self::new_with_seek(data, 0.0)
    }

    pub fn new_with_seek(data: Vec<u8>, seek_to_secs: f64) -> Result<Self, String> {
        let info = probe_audio(&data)?;

        let ring_cap = (info.sample_rate as usize) * (info.channels as usize) * 10;
        let ring = Arc::new(SampleRing::new(ring_cap));

        spawn_decoder(data, info.track_id, Arc::clone(&ring), seek_to_secs);

        eprintln!(
            "[Audio] Streaming decoder started: {}ch, {}Hz, seek={seek_to_secs:.1}s",
            info.channels, info.sample_rate
        );

        Ok(StreamingSource {
            ring,
            channels: info.channels,
            sample_rate: info.sample_rate,
            total_duration: info.total_duration,
            analysis: None,
            tap_pos: 0,
        })
    }

    // Attach a visualizer analysis buffer (filled with the left-channel samples as they
    // are pulled by the output). Returns a handle for the analysis thread to read.
    pub fn enable_analysis(&mut self) -> Arc<super::analyzer::AnalysisBuffer> {
        let a = Arc::new(super::analyzer::AnalysisBuffer::new(self.sample_rate));
        self.analysis = Some(Arc::clone(&a));
        a
    }
}

impl Iterator for StreamingSource {
    type Item = f32;
    fn next(&mut self) -> Option<f32> {
        loop {
            if let Some(s) = self.ring.pop() {
                if let Some(a) = &self.analysis {
                    // Tap left channel only → mono stream at sample_rate.
                    if self.channels <= 1 || self.tap_pos % self.channels as u64 == 0 {
                        a.push(s);
                    }
                    self.tap_pos = self.tap_pos.wrapping_add(1);
                }
                return Some(s);
            }
            if self.ring.is_done() {
                return self.ring.pop();
            }
            std::thread::sleep(std::time::Duration::from_micros(50));
        }
    }
}

impl rodio::Source for StreamingSource {
    fn current_frame_len(&self) -> Option<usize> {
        None
    }
    fn channels(&self) -> u16 {
        self.channels
    }
    fn sample_rate(&self) -> u32 {
        self.sample_rate
    }
    fn total_duration(&self) -> Option<std::time::Duration> {
        self.total_duration
    }
}
