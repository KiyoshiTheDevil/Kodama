use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, AtomicUsize, Ordering};
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

// Playback rate for ListenTogether: a listener a little behind plays a few per mille faster
// until it has caught up, instead of jumping (a jump rebuilds the sink and is heard as a click).
// One value for every source; 1.0 everywhere else. Stored as f32 bits.
static RATE: AtomicU32 = AtomicU32::new(0x3f80_0000);

pub fn set_rate(rate: f32) {
    let r = if rate.is_finite() { rate.clamp(0.9, 1.1) } else { 1.0 };
    RATE.store(r.to_bits(), Ordering::Relaxed);
}
fn rate() -> f64 {
    f32::from_bits(RATE.load(Ordering::Relaxed)) as f64
}

/// Resamples frame by frame at `rate()`, by 4-point Hermite interpolation: near 1.0 that keeps
/// the treble, where a straight line between two samples would dull it in a way that comes and
/// goes with the fraction. At exactly 1.0 the output is the input, sample for sample.
struct Resampler {
    hist: Vec<f32>,         // four frames, oldest first; the output lies between the 2nd and 3rd
    frac: f64,
    out: Vec<f32>,
    out_i: usize,
    primed: bool,
    src_pos: f64,           // source frames advanced, in output frames' terms
    emitted: u64,
    pad: usize,             // frames held at the end of the stream
    fade_in_left: usize,    // frames of the fade-in still to go
    fade_out: Arc<AtomicBool>,
    fade_out_left: Option<usize>,
    skew: Arc<AtomicU64>,   // (source position - output position) in seconds, as f64 bits
}

impl Default for Resampler {
    fn default() -> Self {
        Resampler { hist: Vec::new(), frac: 0.0, out: Vec::new(), out_i: 0, primed: false, src_pos: 0.0, emitted: 0, pad: 0, fade_in_left: 0, fade_out: Arc::new(AtomicBool::new(false)), fade_out_left: None, skew: Arc::new(AtomicU64::new(0)) }
    }
}

#[inline]
fn hermite(x0: f32, x1: f32, x2: f32, x3: f32, t: f32) -> f32 {
    let c1 = 0.5 * (x2 - x0);
    let c2 = x0 - 2.5 * x1 + 2.0 * x2 - 0.5 * x3;
    let c3 = 0.5 * (x3 - x0) + 1.5 * (x1 - x2);
    ((c3 * t + c2) * t + c1) * t + x1
}

// A seek no longer stops the old sound and waits in silence for the new: the old plays on until
// the new is ready, then the two cross over in this long. Short enough not to be heard as a fade,
// long enough that the jump between them is no click.
const SEEK_FADE_MS: usize = 30;

pub struct StreamingSource {
    ring: Arc<SampleRing>,
    channels: u16,
    sample_rate: u32,
    total_duration: Option<std::time::Duration>,
    analysis: Option<Arc<super::analyzer::AnalysisBuffer>>,
    // Built on first use: every constructor would otherwise have to remember to make one,
    // and the sample rate is only settled once the stream has been probed.
    eq: Option<super::eq::EqChain>,
    mono: super::eq::MonoFold,
    tap_pos: u64,
    rs: Resampler,
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

fn prebuffer_ring(ring: &SampleRing, sample_rate: u32, channels: u16, prebuffer_ms: usize) {
    let want = ((sample_rate as usize) * (channels as usize) * prebuffer_ms / 1000)
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

        prebuffer_ring(&ring, info.sample_rate, info.channels, PREBUFFER_MS);

        Ok(StreamingSource {
            ring,
            channels: info.channels,
            sample_rate: info.sample_rate,
            total_duration: info.total_duration,
            analysis: None,
            eq: None,
            mono: Default::default(),
            tap_pos: 0,
            rs: Resampler::default(),
        })
    }

    // Progressive playback: decode straight from a seekable streaming MediaSource (HTTP) so
    // we start as soon as the header/moov is fetched instead of after a full download.
    pub fn new_streaming(
        source: Box<dyn symphonia::core::io::MediaSource>,
        seek_to_secs: f64,
    ) -> Result<Self, String> {
        Self::new_streaming_prebuffered(source, seek_to_secs, PREBUFFER_MS)
    }

    /// As new_streaming, playing once `prebuffer_ms` of audio is decoded. A seek into what is
    /// already downloaded decodes from memory and can start after much less than the 2 s a
    /// stream needs against a slow connection.
    pub fn new_streaming_prebuffered(
        source: Box<dyn symphonia::core::io::MediaSource>,
        seek_to_secs: f64,
        prebuffer_ms: usize,
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
        prebuffer_ring(&ring, info.sample_rate, info.channels, prebuffer_ms);
        Ok(StreamingSource {
            ring,
            channels: info.channels,
            sample_rate: info.sample_rate,
            total_duration: info.total_duration,
            analysis: None,
            eq: None,
            mono: Default::default(),
            tap_pos: 0,
            rs: Resampler::default(),
        })
    }

    // Attach a visualizer analysis buffer (filled with the left-channel samples as they
    // are pulled by the output). Returns a handle for the analysis thread to read.
    /// How far the source has run ahead of what the sink counted, in seconds, while the rate
    /// was not 1.0. The sink's position plus this is the position in the song.
    pub fn skew_handle(&self) -> Arc<AtomicU64> {
        Arc::clone(&self.rs.skew)
    }

    /// Start silent and come up over SEEK_FADE_MS (the new side of a seek).
    pub fn seek_fade_in(&mut self) {
        self.rs.fade_in_left = self.fade_len();
    }

    /// Set to true, the source fades out over SEEK_FADE_MS and then ends (the old side of a seek).
    pub fn fade_out_handle(&self) -> Arc<AtomicBool> {
        Arc::clone(&self.rs.fade_out)
    }

    fn fade_len(&self) -> usize {
        (self.sample_rate as usize * SEEK_FADE_MS / 1000).max(1)
    }

    // One sample from the decoder, waiting while it catches up; None at the end.
    fn pop_wait(&self) -> Option<f32> {
        loop {
            if let Some(s) = self.ring.pop() {
                return Some(s);
            }
            if self.ring.is_done() {
                return self.ring.pop();
            }
            std::thread::sleep(std::time::Duration::from_micros(50));
        }
    }

    // The next output frame into `rs.out`. False at the end of the stream.
    fn next_frame(&mut self) -> bool {
        let ch = self.channels.max(1) as usize;
        if !self.rs.primed {
            // The first frame twice (there is nothing before it), then the two after it.
            let mut first = Vec::with_capacity(ch);
            for _ in 0..ch { match self.pop_wait() { Some(x) => first.push(x), None => return false } }
            self.rs.hist = [first.clone(), first].concat();
            for _ in 0..2 * ch { match self.pop_wait() { Some(x) => self.rs.hist.push(x), None => return false } }
            self.rs.out = vec![0.0; ch];
            self.rs.primed = true;
        }
        // The frame the output stands on (the 2nd) is padding: the song is over.
        if self.rs.pad >= 3 {
            return false;
        }
        let fl = self.fade_len();
        let mut gain = 1.0f32;
        if self.rs.fade_out.load(Ordering::Relaxed) {
            let left = *self.rs.fade_out_left.get_or_insert(fl);
            if left == 0 {
                return false;
            }
            gain = left as f32 / fl as f32;
            self.rs.fade_out_left = Some(left - 1);
        }
        if self.rs.fade_in_left > 0 {
            gain *= 1.0 - self.rs.fade_in_left as f32 / fl as f32;
            self.rs.fade_in_left -= 1;
        }
        let mut r = rate();
        if r == 1.0 && self.rs.frac != 0.0 {
            // Back at normal speed: drop the leftover fraction of a frame (well under a
            // millisecond) so the output is the input again.
            self.rs.src_pos -= self.rs.frac;
            self.rs.frac = 0.0;
        }
        let t = self.rs.frac as f32;
        let h = &self.rs.hist;
        for c in 0..ch {
            self.rs.out[c] = if t == 0.0 { h[ch + c] } else { hermite(h[c], h[ch + c], h[2 * ch + c], h[3 * ch + c], t) };
        }
        if gain != 1.0 {
            for x in self.rs.out.iter_mut() { *x *= gain; }
        }
        if !r.is_finite() { r = 1.0; }
        self.rs.frac += r;
        self.rs.src_pos += r;
        self.rs.emitted += 1;
        let skew = (self.rs.src_pos - self.rs.emitted as f64) / self.sample_rate.max(1) as f64;
        self.rs.skew.store(skew.to_bits(), Ordering::Relaxed);
        while self.rs.frac >= 1.0 {
            self.rs.hist.drain(0..ch);
            let mut frame = Vec::with_capacity(ch);
            for _ in 0..ch {
                match self.pop_wait() { Some(x) => frame.push(x), None => break }
            }
            if frame.len() < ch {
                // The end: hold the last frame, so the frames still in the history play out.
                frame = self.rs.hist[self.rs.hist.len() - ch..].to_vec();
                self.rs.pad += 1;
            }
            self.rs.hist.extend(frame);
            self.rs.frac -= 1.0;
        }
        self.rs.out_i = 0;
        true
    }

    pub fn enable_analysis(&mut self) -> Arc<super::analyzer::AnalysisBuffer> {
        let a = Arc::new(super::analyzer::AnalysisBuffer::new(self.sample_rate));
        self.analysis = Some(Arc::clone(&a));
        a
    }
}

impl Iterator for StreamingSource {
    type Item = f32;
    fn next(&mut self) -> Option<f32> {
        if self.rs.out_i >= self.rs.out.len() && !self.next_frame() {
            return None;
        }
        let s = self.rs.out[self.rs.out_i];
        self.rs.out_i += 1;
        // Equalise before the visualiser tap, so the bars show what is heard rather
        // than what was decoded.
        let s = self
            .eq
            .get_or_insert_with(|| super::eq::EqChain::new(self.sample_rate, self.channels))
            .process(s);
        let s = self.mono.process(s, self.channels as usize);
        if let Some(a) = &self.analysis {
            // Tap left channel only → mono stream at sample_rate.
            if self.channels <= 1 || self.tap_pos % self.channels as u64 == 0 {
                a.push(s);
            }
            self.tap_pos = self.tap_pos.wrapping_add(1);
        }
        Some(s)
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

#[cfg(test)]
mod rate_tests {
    use super::*;

    fn source(samples: &[f32], channels: u16) -> StreamingSource {
        let ring = Arc::new(SampleRing::new(samples.len() + 16));
        for &x in samples { ring.push(x); }
        ring.set_done();
        StreamingSource { ring, channels, sample_rate: 1000, total_duration: None, analysis: None, eq: None, mono: Default::default(), tap_pos: 0, rs: Resampler::default() }
    }
    fn skew(s: &StreamingSource) -> f64 { f64::from_bits(s.skew_handle().load(Ordering::Relaxed)) }

    // One test, not several: RATE is shared, and tests run in parallel.
    #[test]
    fn rate_changes_speed_and_reports_the_skew() {
        let _serial = super::super::eq::tests::lock();
        // Stereo ramp: left n, right -n.
        let input: Vec<f32> = (0..2000).flat_map(|i| [i as f32, -(i as f32)]).collect();

        set_rate(1.0);
        let out: Vec<f32> = source(&input, 2).collect();
        assert_eq!(out, input, "at 1.0 the output is the input, all of it");

        set_rate(1.01);
        let mut s = source(&input, 2);
        let out: Vec<f32> = s.by_ref().collect();
        let frames = out.len() / 2;
        assert!((frames as f64 - 2000.0 / 1.01).abs() < 4.0, "1% faster plays 1% fewer frames: {frames}");
        // A ramp stays a ramp under Hermite: each frame is where the source stood.
        for (k, f) in out.chunks(2).enumerate().take(frames - 4) {
            let want = k as f32 * 1.01;
            assert!((f[0] - want).abs() < 0.01 && (f[1] + want).abs() < 0.01, "frame {k}: {f:?} vs {want}");
        }
        // 1980 output frames at 1000 Hz moved the source 19.8 frames further: 0.0198 s.
        assert!((skew(&s) - frames as f64 * 0.01 / 1000.0).abs() < 0.002, "skew {}", skew(&s));

        set_rate(0.99);
        let out: Vec<f32> = source(&input, 2).collect();
        assert!(((out.len() / 2) as f64 - 2000.0 / 0.99).abs() < 4.0);

        set_rate(1.0);

        // Seek fades: in over 30 ms (30 frames at 1000 Hz), out over 30 ms and then the end.
        let mono: Vec<f32> = vec![1.0; 200];
        let mut s = source(&mono, 1);
        s.seek_fade_in();
        let out: Vec<f32> = s.by_ref().take(40).collect();
        assert_eq!(out[0], 0.0);
        assert!((out[15] - 0.5).abs() < 0.01 && out[30] == 1.0, "{:?}", &out[..32]);
        s.fade_out_handle().store(true, Ordering::Relaxed);
        let rest: Vec<f32> = s.collect();
        assert_eq!(rest.len(), 30, "fades out over 30 frames, then ends");
        assert!(rest[0] == 1.0 && rest[29] < 0.05);
    }
}
