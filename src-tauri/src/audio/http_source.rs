// A seekable HTTP audio source for symphonia: progressive playback without downloading the
// whole file first, and without a new HTTP round-trip per buffer refill.
//
// One background thread downloads the file sequentially over a SINGLE connection into a
// growing in-memory buffer. read()/seek() are served from that buffer — seeks anywhere within
// the downloaded region are instant, and a read past the download point blocks until the
// downloader catches up. This keeps playback in the Rust process (OBS + visualizer) and gives
// a fast start for fast-start (moov-at-front) files: the decoder reads the header + first
// samples as soon as they arrive while the rest streams in. (For moov-at-end files it ends up
// waiting for the full download, same as classic — but still correct.)
use std::io::{self, Read, Seek, SeekFrom};
use std::sync::{Arc, Condvar, Mutex};

use symphonia::core::io::MediaSource;

struct Shared {
    data: Vec<u8>,
    total: Option<u64>,
    complete: bool,
    errored: bool,
}

pub struct HttpStream {
    shared: Arc<(Mutex<Shared>, Condvar)>,
    pos: u64,
}

impl HttpStream {
    pub fn new(url: String) -> io::Result<Self> {
        let client = reqwest::blocking::Client::builder()
            .timeout(std::time::Duration::from_secs(60))
            .build()
            .map_err(|e| io::Error::new(io::ErrorKind::Other, e))?;

        // Open the stream and learn the total length before returning so byte_len() is known.
        let resp = client
            .get(&url)
            .header(reqwest::header::RANGE, "bytes=0-")
            .send()
            .map_err(|e| io::Error::new(io::ErrorKind::Other, e))?;
        let status = resp.status();
        if !(status.is_success() || status.as_u16() == 206) {
            return Err(io::Error::new(io::ErrorKind::Other, format!("HTTP {}", status)));
        }
        let total = resp
            .headers()
            .get(reqwest::header::CONTENT_RANGE)
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.rsplit('/').next().map(str::trim))
            .and_then(|t| t.parse::<u64>().ok())
            .or_else(|| resp.content_length());

        let shared = Arc::new((
            Mutex::new(Shared {
                data: Vec::with_capacity(total.unwrap_or(1 << 20) as usize),
                total,
                complete: false,
                errored: false,
            }),
            Condvar::new(),
        ));

        // Background downloader: sequential, single connection.
        {
            let shared = Arc::clone(&shared);
            std::thread::spawn(move || {
                let mut resp = resp;
                let mut buf = [0u8; 65536];
                loop {
                    match resp.read(&mut buf) {
                        Ok(0) => {
                            let (m, cv) = &*shared;
                            m.lock().unwrap().complete = true;
                            cv.notify_all();
                            break;
                        }
                        Ok(n) => {
                            let (m, cv) = &*shared;
                            m.lock().unwrap().data.extend_from_slice(&buf[..n]);
                            cv.notify_all();
                        }
                        Err(_) => {
                            let (m, cv) = &*shared;
                            let mut g = m.lock().unwrap();
                            g.errored = true;
                            g.complete = true;
                            cv.notify_all();
                            break;
                        }
                    }
                }
            });
        }

        Ok(HttpStream { shared, pos: 0 })
    }

    /// A read-only view of how much has arrived, cloned out before the decoder takes ownership
    /// of the stream itself. Cheap to hold and safe to read from the audio thread.
    pub fn progress(&self) -> DownloadProgress {
        DownloadProgress(Arc::clone(&self.shared))
    }
}

#[derive(Clone)]
pub struct DownloadProgress(Arc<(Mutex<Shared>, Condvar)>);

impl DownloadProgress {
    /// How much of the stream is buffered, 0.0..=1.0. `None` while the total length is unknown
    /// (the server sent neither Content-Range nor Content-Length), so callers can hide the
    /// indicator rather than draw a bar that means nothing.
    pub fn fraction(&self) -> Option<f64> {
        let (m, _) = &*self.0;
        let g = m.lock().unwrap();
        if g.complete {
            return Some(1.0);
        }
        let total = g.total?;
        if total == 0 {
            return None;
        }
        Some((g.data.len() as f64 / total as f64).clamp(0.0, 1.0))
    }
}

impl Read for HttpStream {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        let (m, cv) = &*self.shared;
        let mut g = m.lock().unwrap();
        loop {
            let have = g.data.len() as u64;
            if self.pos < have {
                let start = self.pos as usize;
                let n = (have - self.pos).min(buf.len() as u64) as usize;
                buf[..n].copy_from_slice(&g.data[start..start + n]);
                self.pos += n as u64;
                return Ok(n);
            }
            if g.complete {
                if g.errored && have == 0 {
                    return Err(io::Error::new(io::ErrorKind::Other, "download failed"));
                }
                return Ok(0); // genuine EOF
            }
            // Read is ahead of the download — wait for more bytes.
            g = cv.wait(g).unwrap();
        }
    }
}

impl Seek for HttpStream {
    fn seek(&mut self, from: SeekFrom) -> io::Result<u64> {
        let total = { self.shared.0.lock().unwrap().total };
        let target = match from {
            SeekFrom::Start(p) => p,
            SeekFrom::Current(d) => (self.pos as i64 + d).max(0) as u64,
            SeekFrom::End(d) => {
                let l = total.ok_or_else(|| io::Error::new(io::ErrorKind::Other, "unknown length"))?;
                (l as i64 + d).max(0) as u64
            }
        };
        // Pure position update — bytes are served from the growing buffer (no re-request).
        self.pos = target;
        Ok(target)
    }
}

impl MediaSource for HttpStream {
    fn is_seekable(&self) -> bool {
        true
    }
    fn byte_len(&self) -> Option<u64> {
        self.shared.0.lock().unwrap().total
    }
}
