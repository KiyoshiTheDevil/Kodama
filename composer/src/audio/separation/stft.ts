const N_FFT = 4096;
const HOP_LENGTH = 1024;
const WIN_LENGTH = N_FFT;

// Periodic Hann window: divisor is `size` (not `size - 1`). Matches PyTorch's
// `torch.hann_window(size, periodic=True)`, which is what `torch.stft` uses by
// default. The symmetric variant (divisor `size - 1`) introduces a small but
// consistent shape error across every frame that gets amplified through the
// HTDemucs magnitude branch — audible as distortion in the separated stems.
function hannWindow(size: number): Float32Array {
  const w = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / size));
  }
  return w;
}

function bitReverse(value: number, bits: number): number {
  let reversed = 0;
  let v = value;
  for (let i = 0; i < bits; i++) {
    reversed = (reversed << 1) | (v & 1);
    v >>>= 1;
  }
  return reversed;
}

function fftRadix2(real: Float32Array, imag: Float32Array): void {
  const n = real.length;
  const bits = Math.log2(n);
  if (!Number.isInteger(bits)) throw new Error("FFT length must be power of 2");

  for (let i = 0; i < n; i++) {
    const j = bitReverse(i, bits);
    if (j > i) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }

  for (let size = 2; size <= n; size *= 2) {
    const halfsize = size / 2;
    const angleStep = (-2 * Math.PI) / size;
    for (let i = 0; i < n; i += size) {
      for (let k = 0; k < halfsize; k++) {
        const angle = angleStep * k;
        const wr = Math.cos(angle);
        const wi = Math.sin(angle);
        const idx = i + k;
        const jdx = idx + halfsize;
        const tr = wr * real[jdx] - wi * imag[jdx];
        const ti = wr * imag[jdx] + wi * real[jdx];
        real[jdx] = real[idx] - tr;
        imag[jdx] = imag[idx] - ti;
        real[idx] += tr;
        imag[idx] += ti;
      }
    }
  }
}

function ifftRadix2(real: Float32Array, imag: Float32Array): void {
  const n = real.length;
  for (let i = 0; i < n; i++) imag[i] = -imag[i];
  fftRadix2(real, imag);
  const invN = 1 / n;
  for (let i = 0; i < n; i++) {
    real[i] *= invN;
    imag[i] = -imag[i] * invN;
  }
}

interface Spectrogram {
  real: Float32Array;
  imag: Float32Array;
  numFrames: number;
  numBins: number;
}

function reflectPad(signal: Float32Array, padLeft: number, padRight: number): Float32Array {
  const out = new Float32Array(signal.length + padLeft + padRight);
  out.set(signal, padLeft);
  // Left reflect: out[padLeft - 1 - i] = signal[1 + i]  (mirror around index 0)
  for (let i = 0; i < padLeft; i++) {
    const src = i + 1;
    out[padLeft - 1 - i] = signal[src < signal.length ? src : signal.length - 1];
  }
  // Right reflect: out[padLeft + signal.length + i] = signal[signal.length - 2 - i]
  for (let i = 0; i < padRight; i++) {
    const src = signal.length - 2 - i;
    out[padLeft + signal.length + i] = signal[src >= 0 ? src : 0];
  }
  return out;
}

interface StftOptions {
  /** Center-pad the signal (reflect, n_fft/2 each side) before framing. Default true. */
  center?: boolean;
  /** Divide each complex coefficient by sqrt(n_fft). Default false. */
  normalized?: boolean;
}

function stft(signal: Float32Array, opts: StftOptions = {}): Spectrogram {
  const { center = true, normalized = false } = opts;
  const window = hannWindow(WIN_LENGTH);

  const framed = center ? reflectPad(signal, WIN_LENGTH / 2, WIN_LENGTH / 2) : signal;
  const numFrames = 1 + Math.floor((framed.length - WIN_LENGTH) / HOP_LENGTH);
  const numBins = N_FFT / 2 + 1;
  const real = new Float32Array(numFrames * numBins);
  const imag = new Float32Array(numFrames * numBins);

  const frameReal = new Float32Array(N_FFT);
  const frameImag = new Float32Array(N_FFT);
  const scale = normalized ? 1 / Math.sqrt(N_FFT) : 1;

  for (let f = 0; f < numFrames; f++) {
    const start = f * HOP_LENGTH;
    for (let i = 0; i < WIN_LENGTH; i++) {
      frameReal[i] = framed[start + i] * window[i];
    }
    if (N_FFT > WIN_LENGTH) frameReal.fill(0, WIN_LENGTH);
    frameImag.fill(0);
    fftRadix2(frameReal, frameImag);
    for (let b = 0; b < numBins; b++) {
      real[f * numBins + b] = frameReal[b] * scale;
      imag[f * numBins + b] = frameImag[b] * scale;
    }
  }

  return { real, imag, numFrames, numBins };
}

interface IstftOptions {
  /** Invert coefficients produced with normalized=true. Default false. */
  normalized?: boolean;
}

function istft(spec: Spectrogram, outputLength: number, opts: IstftOptions = {}): Float32Array {
  const { normalized = false } = opts;
  const window = hannWindow(WIN_LENGTH);
  const halfWin = WIN_LENGTH / 2;
  const paddedLength = outputLength + WIN_LENGTH;
  const out = new Float32Array(paddedLength);
  const norm = new Float32Array(paddedLength);

  const frameReal = new Float32Array(N_FFT);
  const frameImag = new Float32Array(N_FFT);
  const scale = normalized ? Math.sqrt(N_FFT) : 1;

  for (let f = 0; f < spec.numFrames; f++) {
    frameReal.fill(0);
    frameImag.fill(0);
    for (let b = 0; b < spec.numBins; b++) {
      frameReal[b] = spec.real[f * spec.numBins + b];
      frameImag[b] = spec.imag[f * spec.numBins + b];
    }
    for (let b = 1; b < spec.numBins - 1; b++) {
      frameReal[N_FFT - b] = frameReal[b];
      frameImag[N_FFT - b] = -frameImag[b];
    }
    ifftRadix2(frameReal, frameImag);
    const start = f * HOP_LENGTH;
    for (let i = 0; i < WIN_LENGTH; i++) {
      out[start + i] += frameReal[i] * scale * window[i];
      norm[start + i] += window[i] * window[i];
    }
  }

  const result = new Float32Array(outputLength);
  for (let i = 0; i < outputLength; i++) {
    const idx = i + halfWin;
    result[i] = norm[idx] > 1e-8 ? out[idx] / norm[idx] : 0;
  }
  return result;
}

export { N_FFT, HOP_LENGTH, WIN_LENGTH, hannWindow, fftRadix2, ifftRadix2, reflectPad, stft, istft };
export type { Spectrogram, StftOptions, IstftOptions };
