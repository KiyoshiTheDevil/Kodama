//! Ten-band graphic equaliser, applied to the decoded stream just before it reaches the
//! output (and before the visualiser tap, so the bars show what is actually heard).
//!
//! Shape of the thing: one global configuration that the UI writes and every playing source
//! reads, plus per-source filter state that must NOT be shared — two sinks run at once during
//! a crossfade, and they are at different points in their signal.
//!
//! Cost matters here: `process` runs once per sample, so ~88_200 times a second for stereo at
//! 44.1 kHz. It therefore does no locking and no allocation on the hot path. A relaxed load of
//! a generation counter tells it whether the configuration changed; only then does it take the
//! lock and recompute coefficients. With the equaliser off, or with every band at zero, it
//! returns the sample untouched.
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Mutex;

pub const BANDS: usize = 10;

/// Octave-spaced centres, the conventional ten-band layout.
pub const FREQS: [f32; BANDS] = [
    32.0, 64.0, 125.0, 250.0, 500.0, 1000.0, 2000.0, 4000.0, 8000.0, 16000.0,
];

/// Q for a one-octave bandwidth: 1 / (2 * sinh(ln2 / 2)). Wider would make neighbouring
/// bands fight each other, narrower would leave audible gaps between them.
const Q: f32 = 1.414_213_6;

/// Below this a band is treated as flat. A slider at 0.0 must cost nothing at all, and a
/// twentieth of a decibel is inaudible.
const EPS_DB: f32 = 0.05;

#[derive(Clone, Copy, Debug)]
pub struct EqConfig {
    pub enabled: bool,
    pub preamp_db: f32,
    pub gains_db: [f32; BANDS],
}

impl EqConfig {
    pub const fn flat() -> Self {
        EqConfig { enabled: false, preamp_db: 0.0, gains_db: [0.0; BANDS] }
    }
    /// Nothing to do: switched off, or switched on but with every control at zero.
    fn is_noop(&self) -> bool {
        !self.enabled
            || (self.preamp_db.abs() < EPS_DB && self.gains_db.iter().all(|g| g.abs() < EPS_DB))
    }
}

static CONFIG: Mutex<EqConfig> = Mutex::new(EqConfig::flat());
/// Bumped on every write. Readers compare it against what they last applied, which keeps the
/// hot path to a single relaxed load instead of a lock per sample.
static GENERATION: AtomicU64 = AtomicU64::new(1);

pub fn set_config(cfg: EqConfig) {
    if let Ok(mut c) = CONFIG.lock() {
        *c = cfg;
    }
    GENERATION.fetch_add(1, Ordering::Release);
}

pub fn config() -> EqConfig {
    CONFIG.lock().map(|c| *c).unwrap_or_else(|e| *e.into_inner())
}

/// One peaking filter's coefficients, already normalised by a0.
#[derive(Clone, Copy, Default)]
struct Coeffs {
    b0: f32,
    b1: f32,
    b2: f32,
    a1: f32,
    a2: f32,
}

/// Transposed direct form II: two state words per filter, and it keeps its precision better
/// than the direct form when several sections are chained.
#[derive(Clone, Copy, Default)]
struct Mem {
    z1: f32,
    z2: f32,
}

/// RBJ audio cookbook peaking EQ.
fn peaking(freq: f32, gain_db: f32, q: f32, sample_rate: f32) -> Coeffs {
    // Above roughly nine tenths of Nyquist the bilinear transform warps the curve into
    // something that no longer resembles a bell, so the highest band is pulled down rather
    // than left to misbehave at low sample rates.
    let f0 = freq.min(sample_rate * 0.45).max(10.0);
    let a = 10f32.powf(gain_db / 40.0);
    let w0 = 2.0 * std::f32::consts::PI * f0 / sample_rate;
    let (sin_w0, cos_w0) = w0.sin_cos();
    let alpha = sin_w0 / (2.0 * q);

    let b0 = 1.0 + alpha * a;
    let b1 = -2.0 * cos_w0;
    let b2 = 1.0 - alpha * a;
    let a0 = 1.0 + alpha / a;
    let a1 = -2.0 * cos_w0;
    let a2 = 1.0 - alpha / a;

    Coeffs { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 }
}

/// Per-source filter bank. Interleaved samples arrive one at a time, so it keeps its own
/// channel cursor and a separate set of filter memories per channel.
pub struct EqChain {
    sample_rate: f32,
    channels: usize,
    gen_seen: u64,
    bypass: bool,
    preamp: f32,
    /// Which bands actually do something, so a chain with one band raised runs one filter.
    active: Vec<usize>,
    coeffs: [Coeffs; BANDS],
    mem: Vec<[Mem; BANDS]>, // [channel][band]
    ch: usize,
}

impl EqChain {
    pub fn new(sample_rate: u32, channels: u16) -> Self {
        let channels = channels.max(1) as usize;
        let mut chain = EqChain {
            sample_rate: sample_rate.max(8000) as f32,
            channels,
            gen_seen: 0, // never equal to GENERATION, so the first sample configures it
            bypass: true,
            preamp: 1.0,
            active: Vec::with_capacity(BANDS),
            coeffs: [Coeffs::default(); BANDS],
            mem: vec![[Mem::default(); BANDS]; channels],
            ch: 0,
        };
        chain.refresh();
        chain
    }

    fn refresh(&mut self) {
        let cfg = config();
        self.gen_seen = GENERATION.load(Ordering::Acquire);
        self.bypass = cfg.is_noop();
        if self.bypass {
            // Leaving stale memory behind would pop the moment the equaliser is switched back
            // on, so the filters start from silence every time.
            for ch in self.mem.iter_mut() {
                *ch = [Mem::default(); BANDS];
            }
            self.active.clear();
            self.preamp = 1.0;
            return;
        }
        self.preamp = 10f32.powf(cfg.preamp_db / 20.0);
        self.active.clear();
        for (i, &g) in cfg.gains_db.iter().enumerate() {
            if g.abs() >= EPS_DB {
                self.coeffs[i] = peaking(FREQS[i], g, Q, self.sample_rate);
                self.active.push(i);
            }
        }
    }

    #[inline]
    pub fn process(&mut self, sample: f32) -> f32 {
        // One relaxed load per sample. Everything else only happens when the user moved
        // something.
        if self.gen_seen != GENERATION.load(Ordering::Relaxed) {
            self.refresh();
        }
        if self.bypass {
            return sample;
        }

        let ch = self.ch;
        self.ch += 1;
        if self.ch >= self.channels {
            self.ch = 0;
        }

        let mut x = sample * self.preamp;
        let mem = &mut self.mem[ch];
        for &i in &self.active {
            let c = self.coeffs[i];
            let m = &mut mem[i];
            let y = c.b0 * x + m.z1;
            m.z1 = c.b1 * x - c.a1 * y + m.z2;
            m.z2 = c.b2 * x - c.a2 * y;
            x = y;
        }

        // Filter memory decaying towards zero produces denormal floats, and those cost tens of
        // times a normal multiply on x86. Flushing them keeps a silent passage from being more
        // expensive than a loud one.
        if x.abs() < 1e-15 {
            x = 0.0;
            for m in mem.iter_mut() {
                m.z1 = 0.0;
                m.z2 = 0.0;
            }
        }

        // A boosted band can push past full scale. Clamping is not pretty, but it is a great
        // deal less ugly than the wrap-around the output would otherwise produce, and the
        // preamp exists precisely so it can be avoided.
        x.clamp(-1.0, 1.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The configuration these tests exercise is deliberately global — that is the whole
    /// design, one curve for every source. Cargo runs tests in parallel threads, so without
    /// this they overwrite each other's settings and every measurement comes back as bypass.
    static SERIAL: Mutex<()> = Mutex::new(());
    fn lock() -> std::sync::MutexGuard<'static, ()> {
        SERIAL.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Gain the chain applies at one frequency, in dB. A sine is pushed through, the first
    /// half discarded so the filters have settled, and the RMS of the rest compared with the
    /// RMS going in.
    fn gain_at(chain: &mut EqChain, freq: f32, sample_rate: f32) -> f32 {
        let n = 32_768;
        let mut sum_in = 0.0f64;
        let mut sum_out = 0.0f64;
        for i in 0..n {
            let x = (2.0 * std::f32::consts::PI * freq * i as f32 / sample_rate).sin() * 0.25;
            let y = chain.process(x);
            if i >= n / 2 {
                sum_in += (x * x) as f64;
                sum_out += (y * y) as f64;
            }
        }
        20.0 * ((sum_out / sum_in).sqrt() as f32).log10()
    }

    fn chain_with(preamp: f32, gains: [f32; BANDS]) -> EqChain {
        set_config(EqConfig { enabled: true, preamp_db: preamp, gains_db: gains });
        EqChain::new(44100, 1)
    }

    #[test]
    fn boosts_the_band_it_is_told_to() {
        let _g = lock();
        let mut g = [0.0; BANDS];
        g[5] = 6.0; // 1 kHz
        let mut c = chain_with(0.0, g);
        let at_1k = gain_at(&mut c, 1000.0, 44100.0);
        assert!((at_1k - 6.0).abs() < 0.4, "1 kHz should be about +6 dB, was {at_1k}");
    }

    #[test]
    fn leaves_distant_bands_alone() {
        let _g = lock();
        let mut g = [0.0; BANDS];
        g[5] = 6.0; // 1 kHz
        let mut c = chain_with(0.0, g);
        // Five octaves down: the bell has long since fallen away.
        let at_32 = gain_at(&mut c, 32.0, 44100.0);
        assert!(at_32.abs() < 0.5, "32 Hz should be untouched, was {at_32}");
    }

    #[test]
    fn cuts_as_well_as_boosts() {
        let _g = lock();
        let mut g = [0.0; BANDS];
        g[2] = -8.0; // 125 Hz
        let mut c = chain_with(0.0, g);
        let at_125 = gain_at(&mut c, 125.0, 44100.0);
        assert!((at_125 + 8.0).abs() < 0.4, "125 Hz should be about -8 dB, was {at_125}");
    }

    #[test]
    fn preamp_moves_everything() {
        let _g = lock();
        let mut c = chain_with(-6.0, [0.0; BANDS]);
        // Preamp alone is not a no-op even with every band flat.
        let at_1k = gain_at(&mut c, 1000.0, 44100.0);
        assert!((at_1k + 6.0).abs() < 0.1, "preamp should be about -6 dB, was {at_1k}");
    }

    #[test]
    fn disabled_is_bit_identical() {
        let _g = lock();
        set_config(EqConfig { enabled: false, preamp_db: 9.0, gains_db: [9.0; BANDS] });
        let mut c = EqChain::new(44100, 2);
        for i in 0..1000 {
            let x = (i as f32 * 0.01).sin() * 0.5;
            assert_eq!(c.process(x), x, "switched off, the sample must come back untouched");
        }
    }

    #[test]
    fn flat_and_enabled_is_bit_identical() {
        let _g = lock();
        set_config(EqConfig { enabled: true, preamp_db: 0.0, gains_db: [0.0; BANDS] });
        let mut c = EqChain::new(44100, 2);
        for i in 0..1000 {
            let x = (i as f32 * 0.01).sin() * 0.5;
            assert_eq!(c.process(x), x, "every control at zero must cost nothing");
        }
    }

    #[test]
    fn channels_keep_separate_state() {
        let _g = lock();
        let mut g = [0.0; BANDS];
        g[5] = 12.0;
        set_config(EqConfig { enabled: true, preamp_db: 0.0, gains_db: g });
        let mut stereo = EqChain::new(44100, 2);
        // Left carries a sine, right is silent. If the two shared filter memory, the silent
        // channel would leak the other one's ringing.
        let mut worst_right = 0.0f32;
        for i in 0..8000 {
            let x = (2.0 * std::f32::consts::PI * 1000.0 * i as f32 / 44100.0).sin() * 0.5;
            stereo.process(x);              // left
            let r = stereo.process(0.0);    // right
            worst_right = worst_right.max(r.abs());
        }
        assert!(worst_right < 1e-6, "silence on the right leaked {worst_right}");
    }

    #[test]
    fn top_band_survives_a_low_sample_rate() {
        let _g = lock();
        let mut g = [0.0; BANDS];
        g[9] = 6.0; // 16 kHz, above Nyquist at 22.05 kHz
        set_config(EqConfig { enabled: true, preamp_db: 0.0, gains_db: g });
        let mut c = EqChain::new(22050, 1);
        for i in 0..4000 {
            let y = c.process((i as f32 * 0.05).sin() * 0.3);
            assert!(y.is_finite(), "filter blew up at a low sample rate");
        }
    }
}
