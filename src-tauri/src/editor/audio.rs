//! Pure-Rust WAV reader and silence detection.
//!
//! Replicates the algorithm from Python's `pydub.silence.detect_nonsilent`
//! so we have zero external dependencies beyond FFmpeg for audio extraction.

use std::io::Read;

// ---------------------------------------------------------------------------
// WAV data
// ---------------------------------------------------------------------------

/// Raw WAV audio loaded into memory.
pub struct WavData {
    pub sample_rate: u32,
    pub channels: u16,
    pub samples: Vec<i16>,
    pub duration_ms: u64,
}

// ---------------------------------------------------------------------------
// WAV reader (16-bit PCM only – matches our FFmpeg extraction)
// ---------------------------------------------------------------------------

/// Read a 16-bit PCM WAV file into memory.
///
/// We only support the format produced by our own FFmpeg extraction
/// (`pcm_s16le`, 44 100 Hz, mono/stereo).
pub fn read_wav(path: &str) -> Result<WavData, String> {
    let mut file =
        std::fs::File::open(path).map_err(|e| format!("open wav {path}: {e}"))?;
    let mut buf = Vec::new();
    file.read_to_end(&mut buf)
        .map_err(|e| format!("read wav: {e}"))?;
    if buf.len() < 44 {
        return Err("WAV file too small".into());
    }
    // RIFF header
    if &buf[0..4] != b"RIFF" || &buf[8..12] != b"WAVE" {
        return Err("Not a valid WAV file".into());
    }
    // Find "fmt " and "data" chunks
    let mut pos: usize = 12;
    let mut sample_rate: u32 = 0;
    let mut channels: u16 = 0;
    let mut bits_per_sample: u16 = 0;
    let mut data_start: usize = 0;
    let mut data_size: usize = 0;
    while pos + 8 <= buf.len() {
        let chunk_id = &buf[pos..pos + 4];
        let chunk_size =
            u32::from_le_bytes([buf[pos + 4], buf[pos + 5], buf[pos + 6], buf[pos + 7]])
                as usize;
        if chunk_id == b"fmt " {
            if chunk_size < 16 || pos + 8 + 16 > buf.len() {
                return Err("Invalid fmt chunk".into());
            }
            let fmt = &buf[pos + 8..];
            let audio_format = u16::from_le_bytes([fmt[0], fmt[1]]);
            if audio_format != 1 {
                return Err(format!("Unsupported WAV format {audio_format} (only PCM)"));
            }
            channels = u16::from_le_bytes([fmt[2], fmt[3]]);
            sample_rate =
                u32::from_le_bytes([fmt[4], fmt[5], fmt[6], fmt[7]]);
            bits_per_sample = u16::from_le_bytes([fmt[14], fmt[15]]);
        } else if chunk_id == b"data" {
            data_start = pos + 8;
            data_size = chunk_size;
            break;
        }
        // Advance to next chunk (size is padded to even)
        pos += 8 + chunk_size + (chunk_size & 1);
    }
    if data_start == 0 || sample_rate == 0 || channels == 0 {
        return Err("WAV missing fmt/data chunks".into());
    }
    if bits_per_sample != 16 {
        return Err(format!(
            "Only 16-bit WAV supported, got {bits_per_sample}-bit"
        ));
    }
    // Clamp data_size to available bytes
    let available = buf.len().saturating_sub(data_start);
    let actual_size = data_size.min(available);
    // Parse i16 samples (little-endian)
    let sample_count = actual_size / 2;
    let mut samples = Vec::with_capacity(sample_count);
    let data = &buf[data_start..data_start + actual_size];
    for i in (0..actual_size).step_by(2) {
        if i + 1 < actual_size {
            samples.push(i16::from_le_bytes([data[i], data[i + 1]]));
        }
    }
    let total_frames = samples.len() as u64 / channels as u64;
    let duration_ms = total_frames * 1000 / sample_rate as u64;
    Ok(WavData {
        sample_rate,
        channels,
        samples,
        duration_ms,
    })
}

// ---------------------------------------------------------------------------
// Silence detection  (replicates pydub.silence.detect_nonsilent)
// ---------------------------------------------------------------------------

/// Number of samples per millisecond of audio.
fn samples_per_ms(wav: &WavData) -> usize {
    (wav.sample_rate as usize * wav.channels as usize) / 1000
}

/// Compute RMS of a slice of i16 samples, returned as dBFS.
///
/// `dBFS = 20 * log10(rms / max_amplitude)`
/// For 16-bit audio `max_amplitude = 32 768`.
#[allow(dead_code)]
fn rms_dbfs(samples: &[i16]) -> f64 {
    if samples.is_empty() {
        return f64::NEG_INFINITY;
    }
    let sum_sq: f64 = samples.iter().map(|&s| (s as f64) * (s as f64)).sum();
    let rms = (sum_sq / samples.len() as f64).sqrt();
    if rms < 1.0 {
        return f64::NEG_INFINITY;
    }
    20.0 * (rms / 32768.0).log10()
}

/// Detect non-silent time ranges in a WAV file.
///
/// This mirrors `pydub.silence.detect_nonsilent`:
/// 1. Slide a window of `min_silence_ms` across the audio.
/// 2. If the window's dBFS ≤ `threshold_db`, mark it as silent.
/// 3. Collect silent ranges, then invert to produce non-silent ranges.
///
/// Returns `Vec<(start_ms, end_ms)>`.
pub fn detect_nonsilent_ranges(
    wav: &WavData,
    min_silence_ms: u64,
    threshold_db: f64,
) -> Vec<(u64, u64)> {
    let spm = samples_per_ms(wav);
    if spm == 0 {
        return vec![];
    }
    let total_ms = wav.duration_ms;
    let chunk_samples = (min_silence_ms as usize) * spm;
    if chunk_samples == 0 || total_ms <= min_silence_ms {
        return vec![(0, total_ms)];
    }
    // Use a seek step of 10 ms for efficiency (pydub defaults to 1 ms).
    // 10 ms gives great accuracy while being 10× faster.
    let seek_step_ms: u64 = 10;
    // seek_step in samples is not needed – we index via pos_ms * spm.
    // ── Build cumulative sum-of-squares for O(1) RMS per window ─────────
    //
    // cum_sq[i] = sum of sample[0..i]^2   (cum_sq[0] = 0)
    //
    // rms(a..b) = sqrt( (cum_sq[b] - cum_sq[a]) / (b - a) )
    let n = wav.samples.len();
    let mut cum_sq: Vec<f64> = Vec::with_capacity(n + 1);
    cum_sq.push(0.0);
    for &s in &wav.samples {
        let sq = (s as f64) * (s as f64);
        cum_sq.push(cum_sq.last().unwrap() + sq);
    }
    // Helper: dBFS for sample range [a, b)
    let range_dbfs = |a: usize, b: usize| -> f64 {
        let b = b.min(n);
        if b <= a {
            return f64::NEG_INFINITY;
        }
        let sum_sq = cum_sq[b] - cum_sq[a];
        let rms = (sum_sq / (b - a) as f64).sqrt();
        if rms < 1.0 {
            return f64::NEG_INFINITY;
        }
        20.0 * (rms / 32768.0).log10()
    };
    // ── Detect silent ranges ────────────────────────────────────────────
    let mut silent_ranges: Vec<(u64, u64)> = Vec::new();
    let mut current_silence_start: Option<u64> = None;
    let mut current_silence_end: u64 = 0;
    let mut pos_ms: u64 = 0;
    while pos_ms + min_silence_ms <= total_ms {
        let sample_start = (pos_ms as usize) * spm;
        let sample_end = sample_start + chunk_samples;
        let db = range_dbfs(sample_start, sample_end);
        if db <= threshold_db {
            if current_silence_start.is_none() {
                current_silence_start = Some(pos_ms);
            }
            current_silence_end = pos_ms + min_silence_ms;
        } else if let Some(start) = current_silence_start.take() {
            silent_ranges.push((start, current_silence_end));
        }
        pos_ms += seek_step_ms;
    }
    if let Some(start) = current_silence_start {
        silent_ranges.push((start, current_silence_end));
    }
    // ── Invert: silent → non-silent ─────────────────────────────────────
    if silent_ranges.is_empty() {
        return vec![(0, total_ms)];
    }
    let mut nonsilent: Vec<(u64, u64)> = Vec::new();
    let mut prev_end: u64 = 0;
    for (s_start, s_end) in &silent_ranges {
        if *s_start > prev_end {
            nonsilent.push((prev_end, *s_start));
        }
        prev_end = *s_end;
    }
    if prev_end < total_ms {
        nonsilent.push((prev_end, total_ms));
    }
    nonsilent
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rms_dbfs_silence() {
        let silence = vec![0i16; 1000];
        assert_eq!(rms_dbfs(&silence), f64::NEG_INFINITY);
    }

    #[test]
    fn rms_dbfs_full_scale() {
        // Full-scale 16-bit = 32767 → dBFS ≈ 0
        let full = vec![32767i16; 1000];
        let db = rms_dbfs(&full);
        assert!((db - 0.0).abs() < 0.01, "expected ~0 dBFS, got {db}");
    }
}
