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
    // Built on first use: every constructor would otherwise have to remember to make one,
    // and the sample rate is only settled once the stream has been probed.
    eq: Option<super::eq::EqChain>,
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

    let channels = channels_of(&track.codec_params);
    let sample_rate = track.codec_params.sample_rate.unwrap_or(48000);
    let track_id = track.id;

    let total_duration = duration_of(&track.codec_params);

    Ok(ProbeResult {
        channels,
        sample_rate,
        total_duration,
        track_id,
    })
}

/// The largest number of frames an Opus packet can carry: 120 ms at 48 kHz.
const MAX_OPUS_FRAMES: usize = 5760;

/// Channel count for a track.
///
/// symphonia leaves `codec_params.channels` empty for Opus in WebM/Ogg — the count lives in
/// the OpusHead identification header instead, which arrives as extra data. Read it from
/// there before falling back to assuming stereo, otherwise a mono track would be played at
/// the wrong speed.
fn channels_of(params: &symphonia::core::codecs::CodecParameters) -> u16 {
    if let Some(c) = params.channels {
        return c.count() as u16;
    }
    let head = params.extra_data.as_deref().unwrap_or(&[]);
    if head.len() > 9 && head.starts_with(b"OpusHead") {
        return (head[9] as u16).max(1);
    }
    2
}

/// Playing time of a track.
///
/// `n_frames` is counted in the track's own time base, and that base is not the same across
/// containers: MP4 uses 1/sample_rate, so dividing by the sample rate happens to be right,
/// while MKV/WebM uses milliseconds, where the same division comes out 48x too short. A
/// 219 s track then reported 4.6 s, the player believed it and skipped to the next song.
fn duration_of(params: &symphonia::core::codecs::CodecParameters) -> Option<std::time::Duration> {
    let n_frames = params.n_frames?;
    if let Some(tb) = params.time_base {
        let t = tb.calc_time(n_frames);
        return Some(std::time::Duration::from_secs_f64(t.seconds as f64 + t.frac));
    }
    let rate = params.sample_rate?;
    Some(std::time::Duration::from_secs_f64(n_frames as f64 / rate as f64))
}

/// Decoding for one track: symphonia's own codecs, plus Opus, which symphonia does not have.
///
/// Opus is still absent from symphonia (checked 2026-08-19, including 0.6.1), and rodio pins
/// symphonia to 0.5 regardless. The one crate offering Opus as a symphonia codec,
/// moosicbox_opus 0.4.0, cannot decode a single packet: it allocates its output AudioBuffer
/// with capacity only, clears it at the top of decode(), then writes into it without ever
/// rendering frames, so the first sample indexes an empty slice. Since symphonia already
/// demuxes WebM and Ogg, we only bring our own decoder and leave everything else untouched.
enum Codec {
    Symphonia(Box<dyn symphonia::core::codecs::Decoder>),
    Opus {
        dec: audiopus::coder::Decoder,
        channels: usize,
        pcm: Vec<i16>,
        /// Encoder delay the OpusHead asks us to drop before the real audio starts, in frames.
        skip: usize,
    },
}

impl Codec {
    fn new(params: &symphonia::core::codecs::CodecParameters) -> Result<Self, String> {
        use symphonia::core::codecs::{DecoderOptions, CODEC_TYPE_OPUS};

        if params.codec != CODEC_TYPE_OPUS {
            return symphonia::default::get_codecs()
                .make(params, &DecoderOptions::default())
                .map(Codec::Symphonia)
                .map_err(|e| format!("codec error: {e}"));
        }

        let head = params.extra_data.as_deref().unwrap_or(&[]);
        let (channels, skip) = if head.len() > 11 && head.starts_with(b"OpusHead") {
            (
                head[9] as usize,
                u16::from_le_bytes([head[10], head[11]]) as usize,
            )
        } else {
            (2, 0)
        };
        // libopus decodes to mono or stereo here; anything wider would need a surround
        // downmix we have no use for, so say so rather than emit interleaved nonsense.
        let layout = match channels {
            1 => audiopus::Channels::Mono,
            2 => audiopus::Channels::Stereo,
            n => return Err(format!("unsupported opus channel count: {n}")),
        };
        let dec = audiopus::coder::Decoder::new(audiopus::SampleRate::Hz48000, layout)
            .map_err(|e| format!("opus decoder error: {e}"))?;
        Ok(Codec::Opus {
            dec,
            channels,
            pcm: vec![0i16; MAX_OPUS_FRAMES * channels],
            skip,
        })
    }

    /// After a seek the stream no longer starts at the encoder delay, so nothing must be
    /// dropped — doing it anyway would clip audio at every seek target.
    fn seeked(&mut self) {
        if let Codec::Opus { skip, .. } = self {
            *skip = 0;
        }
    }

    /// Decode one packet into interleaved f32, reusing `out`. Returns false for a packet that
    /// produced nothing, which the callers skip exactly as they did before.
    fn decode_into(&mut self, packet: &symphonia::core::formats::Packet, out: &mut Vec<f32>) -> bool {
        out.clear();
        match self {
            Codec::Symphonia(dec) => {
                let decoded = match dec.decode(packet) {
                    Ok(d) => d,
                    Err(_) => return false,
                };
                let spec = *decoded.spec();
                let num_frames = decoded.frames();
                let mut sample_buf =
                    symphonia::core::audio::SampleBuffer::<f32>::new(num_frames as u64, spec);
                sample_buf.copy_interleaved_ref(decoded);
                out.extend_from_slice(sample_buf.samples());
                true
            }
            Codec::Opus { dec, channels, pcm, skip } => {
                let frames = match dec.decode(Some(&packet.data[..]), &mut pcm[..], false) {
                    Ok(n) => n,
                    Err(_) => return false,
                };
                let dropped = (*skip).min(frames);
                *skip -= dropped;
                let from = dropped * *channels;
                let to = frames * *channels;
                out.extend(pcm[from..to].iter().map(|&s| f32::from(s) / 32768.0));
                true
            }
        }
    }
}

pub fn spawn_decoder(data: Vec<u8>, track_id: u32, ring: Arc<SampleRing>, seek_to_secs: f64) {
    std::thread::spawn(move || {
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

        let mut decoder = match Codec::new(&track.codec_params) {
            Ok(d) => d,
            Err(e) => {
                eprintln!("[Audio] decoder thread codec error: {e}");
                ring.set_done();
                return;
            }
        };

        if seek_to_secs > 0.05 {
            decoder.seeked();
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

        let mut pcm: Vec<f32> = Vec::new();
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

            if !decoder.decode_into(&packet, &mut pcm) {
                continue;
            }

            for &s in pcm.iter() {
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

// Like spawn_decoder but reads from a seekable streaming MediaSource (HTTP). Probes once,
// hands the format info back over `info_tx`, then decodes progressively into the ring.
pub fn spawn_decoder_streaming(
    source: Box<dyn symphonia::core::io::MediaSource>,
    ring: Arc<SampleRing>,
    seek_to_secs: f64,
    info_tx: std::sync::mpsc::SyncSender<Result<ProbeResult, String>>,
) {
    std::thread::spawn(move || {
        use symphonia::core::formats::{FormatOptions, SeekMode, SeekTo};
        use symphonia::core::io::MediaSourceStream;
        use symphonia::core::meta::MetadataOptions;
        use symphonia::core::probe::Hint;
        use symphonia::core::units::Time;

        let mss = MediaSourceStream::new(source, Default::default());
        let probed = match symphonia::default::get_probe().format(
            &Hint::new(),
            mss,
            &FormatOptions::default(),
            &MetadataOptions::default(),
        ) {
            Ok(p) => p,
            Err(e) => {
                let _ = info_tx.send(Err(format!("probe error: {e}")));
                ring.set_done();
                return;
            }
        };

        let mut format = probed.format;
        let (channels, sample_rate, track_id, total_duration, codec_params) = {
            let track = match format.default_track() {
                Some(t) => t,
                None => {
                    let _ = info_tx.send(Err("no default track".to_string()));
                    ring.set_done();
                    return;
                }
            };
            let sr = track.codec_params.sample_rate.unwrap_or(48000);
            (
                channels_of(&track.codec_params),
                sr,
                track.id,
                duration_of(&track.codec_params),
                track.codec_params.clone(),
            )
        };
        let _ = info_tx.send(Ok(ProbeResult { channels, sample_rate, total_duration, track_id }));

        let mut decoder = match Codec::new(&codec_params) {
            Ok(d) => d,
            Err(e) => {
                eprintln!("[Audio] streaming codec error: {e}");
                ring.set_done();
                return;
            }
        };

        if seek_to_secs > 0.05 {
            decoder.seeked();
            let _ = format.seek(
                SeekMode::Coarse,
                SeekTo::Time { time: Time::from(seek_to_secs), track_id: None },
            );
        }

        let mut pcm: Vec<f32> = Vec::new();
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
            if !decoder.decode_into(&packet, &mut pcm) {
                continue;
            }
            for &s in pcm.iter() {
                while !ring.push(s) {
                    std::thread::sleep(std::time::Duration::from_micros(100));
                }
            }
        }
        ring.set_done();
    });
}

// Wait until the ring holds a small cushion of decoded audio before playback starts. rodio pulls
// samples on its mixer thread the moment the source is appended; if the ring is still filling
// (decode/download racing realtime), the blocking next() stalls the mixer → cpal underruns →
// audible crackle at the start. A ~2 s head start lets the decoder pull ahead so the ring then
// stays near-full for the rest of the track. Bounded by a timeout so a slow stream still starts.
const PREBUFFER_MS: usize = 2000;
const PREBUFFER_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(6);

fn prebuffer_ring(ring: &SampleRing, sample_rate: u32, channels: u16) {
    let want = ((sample_rate as usize) * (channels as usize) * PREBUFFER_MS / 1000)
        .min(ring.capacity().saturating_sub(1));
    let deadline = std::time::Instant::now() + PREBUFFER_TIMEOUT;
    while ring.write_pos() < want && !ring.is_done() && std::time::Instant::now() < deadline {
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
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

        prebuffer_ring(&ring, info.sample_rate, info.channels);

        Ok(StreamingSource {
            ring,
            channels: info.channels,
            sample_rate: info.sample_rate,
            total_duration: info.total_duration,
            analysis: None,
            eq: None,
            tap_pos: 0,
        })
    }

    // Progressive playback: decode straight from a seekable streaming MediaSource (HTTP) so
    // we start as soon as the header/moov is fetched instead of after a full download.
    pub fn new_streaming(
        source: Box<dyn symphonia::core::io::MediaSource>,
        seek_to_secs: f64,
    ) -> Result<Self, String> {
        let ring_cap = 48000usize * 2 * 12; // ~12 s stereo buffer (generous; exact rate unknown yet)
        let ring = Arc::new(SampleRing::new(ring_cap));
        let (info_tx, info_rx) =
            std::sync::mpsc::sync_channel::<Result<ProbeResult, String>>(1);

        spawn_decoder_streaming(source, Arc::clone(&ring), seek_to_secs, info_tx);

        // Block only until the format is probed (header/moov), not the whole file.
        let info = info_rx.recv().map_err(|e| format!("probe channel: {e}"))??;
        eprintln!(
            "[Audio] Streaming(HTTP) decoder started: {}ch, {}Hz, seek={seek_to_secs:.1}s",
            info.channels, info.sample_rate
        );
        prebuffer_ring(&ring, info.sample_rate, info.channels);
        Ok(StreamingSource {
            ring,
            channels: info.channels,
            sample_rate: info.sample_rate,
            total_duration: info.total_duration,
            analysis: None,
            eq: None,
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
                // Equalise before the visualiser tap, so the bars show what is heard rather
                // than what was decoded.
                let s = self
                    .eq
                    .get_or_insert_with(|| super::eq::EqChain::new(self.sample_rate, self.channels))
                    .process(s);
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
