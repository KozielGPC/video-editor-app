use crate::models::{Segment, SilenceConfig};
use std::process::{Command, Stdio};

// ---------------------------------------------------------------------------
// Silence detection via FFmpeg's silencedetect filter
// ---------------------------------------------------------------------------

/// Run FFmpeg silencedetect on a **WAV file** and return the **silent**
/// regions as `(start_ms, end_ms)`.
fn detect_raw_silence(
    wav_path: &str,
    threshold_db: f64,
    min_silence_ms: u64,
) -> Result<Vec<(u64, u64)>, String> {
    let min_duration_sec = min_silence_ms as f64 / 1000.0;

    let output = Command::new("ffmpeg")
        .args([
            "-i",
            wav_path,
            "-af",
            &format!(
                "silencedetect=noise={threshold_db}dB:d={min_duration_sec:.3}"
            ),
            "-f",
            "null",
            "-",
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("ffmpeg silencedetect spawn: {e}"))?;

    let stderr = String::from_utf8_lossy(&output.stderr);

    // Parse silence_start / silence_end pairs from FFmpeg stderr.
    // Lines look like:
    //   [silencedetect @ 0x...] silence_start: 1.234
    //   [silencedetect @ 0x...] silence_end: 5.678 | silence_duration: 4.444

    let mut silences: Vec<(u64, u64)> = Vec::new();
    let mut current_start: Option<f64> = None;

    for line in stderr.lines() {
        if let Some(idx) = line.find("silence_start: ") {
            let val_str = &line[idx + "silence_start: ".len()..];
            let val_str = val_str
                .split_whitespace()
                .next()
                .unwrap_or(val_str);
            if let Ok(val) = val_str.parse::<f64>() {
                current_start = Some(val);
            }
        } else if let Some(idx) = line.find("silence_end: ") {
            let val_str = &line[idx + "silence_end: ".len()..];
            let val_str = val_str
                .split_whitespace()
                .next()
                .unwrap_or(val_str);
            if let Ok(end_val) = val_str.parse::<f64>() {
                if let Some(start_val) = current_start.take() {
                    silences.push((
                        (start_val * 1000.0) as u64,
                        (end_val * 1000.0) as u64,
                    ));
                }
            }
        }
    }

    Ok(silences)
}

// ---------------------------------------------------------------------------
// Segment building (ported from autoeditor.py)
// ---------------------------------------------------------------------------

/// Detect silence regions, then return the **non-silent** segments with
/// optional padding around each cut.
///
/// Matches the Python autoeditor.py pipeline:
/// 1. Extract audio to a clean WAV (PCM s16le, 44100 Hz, stereo)
/// 2. Run silencedetect on the WAV
/// 3. Invert → non-silent ranges
/// 4. Pad, merge close gaps, merge overlapping
pub fn detect_silence_regions(
    audio_path: &str,
    config: &SilenceConfig,
) -> Result<Vec<Segment>, String> {
    // Step 1 – Extract audio to a temp WAV (matching autoeditor.py).
    //
    // Running silencedetect on a decoded WAV avoids codec-related
    // artefacts that can produce hundreds of spurious silence edges
    // on compressed formats (AAC, Opus, etc.).
    let temp_dir = std::env::temp_dir();
    let temp_wav = temp_dir.join(format!(
        "autoeditor_silence_{}.wav",
        std::process::id()
    ));
    let temp_wav_str = temp_wav
        .to_str()
        .ok_or_else(|| "invalid temp path".to_string())?;

    crate::editor::ffmpeg::extract_audio_to_wav(audio_path, temp_wav_str)?;

    // Step 2 – Get total duration from the clean WAV
    let info = crate::editor::ffmpeg::run_ffprobe(temp_wav_str)?;
    let total_duration_ms = info.duration_ms;

    // Step 3 – Detect silent regions on the WAV
    let result = detect_raw_silence(
        temp_wav_str,
        config.threshold_db,
        config.min_silence_ms,
    );

    // Clean up temp file regardless of detection result
    let _ = std::fs::remove_file(&temp_wav);

    let silences = result?;

    // Step 4 – Invert: compute non-silent ranges
    let mut nonsilent: Vec<(u64, u64)> = Vec::new();
    let mut pos: u64 = 0;

    for (s_start, s_end) in &silences {
        if *s_start > pos {
            nonsilent.push((pos, *s_start));
        }
        pos = *s_end;
    }
    if pos < total_duration_ms {
        nonsilent.push((pos, total_duration_ms));
    }

    // Step 5 – Merge non-silent ranges that are very close together.
    //
    // pydub's chunk-based detection naturally smooths brief dips in
    // audio level.  FFmpeg's sample-level silencedetect does not, so
    // two speech segments separated by a tiny gap (< min_silence_ms)
    // can appear as separate ranges even though the gap was shorter
    // than the configured minimum.  Merging here prevents that.
    let nonsilent = merge_close_ranges(&nonsilent, config.min_silence_ms);

    // Step 6 – Build padded & merged segments (matches Python algorithm)
    let segments = build_segments(&nonsilent, total_duration_ms, config.padding_ms);
    Ok(segments)
}

/// Merge non-silent ranges whose gap is smaller than `min_gap_ms`.
fn merge_close_ranges(
    ranges: &[(u64, u64)],
    min_gap_ms: u64,
) -> Vec<(u64, u64)> {
    if ranges.is_empty() {
        return Vec::new();
    }
    let mut merged: Vec<(u64, u64)> = vec![ranges[0]];
    for &(start, end) in &ranges[1..] {
        let last = merged.last_mut().unwrap();
        if start <= last.1 + min_gap_ms {
            last.1 = last.1.max(end);
        } else {
            merged.push((start, end));
        }
    }
    merged
}

/// Add padding around each non-silent range, then merge overlapping segments.
pub fn build_segments(
    nonsilent_ranges: &[(u64, u64)],
    total_duration_ms: u64,
    padding_ms: u64,
) -> Vec<Segment> {
    if nonsilent_ranges.is_empty() {
        return Vec::new();
    }

    let padded: Vec<Segment> = nonsilent_ranges
        .iter()
        .map(|&(start, end)| {
            let padded_start = start.saturating_sub(padding_ms);
            let padded_end = (end + padding_ms).min(total_duration_ms);
            Segment {
                start_ms: padded_start,
                end_ms: padded_end,
            }
        })
        .collect();

    merge_overlapping_segments(&padded)
}

fn merge_overlapping_segments(segments: &[Segment]) -> Vec<Segment> {
    if segments.is_empty() {
        return Vec::new();
    }

    let mut sorted = segments.to_vec();
    sorted.sort_by_key(|s| s.start_ms);

    let mut merged: Vec<Segment> = vec![sorted[0].clone()];

    for current in &sorted[1..] {
        let last = merged.last_mut().unwrap();
        if current.start_ms <= last.end_ms {
            last.end_ms = last.end_ms.max(current.end_ms);
        } else {
            merged.push(current.clone());
        }
    }

    merged
}
