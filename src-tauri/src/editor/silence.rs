use crate::models::{Segment, SilenceConfig};
use std::process::{Command, Stdio};

// ---------------------------------------------------------------------------
// Silence detection via FFmpeg's silencedetect filter
// ---------------------------------------------------------------------------

/// Run FFmpeg silencedetect and return the **silent** regions as `(start_ms, end_ms)`.
fn detect_raw_silence(
    audio_path: &str,
    threshold_db: f64,
    min_silence_ms: u64,
) -> Result<Vec<(u64, u64)>, String> {
    let min_duration_sec = min_silence_ms as f64 / 1000.0;

    let output = Command::new("ffmpeg")
        .args([
            "-i",
            audio_path,
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
pub fn detect_silence_regions(
    audio_path: &str,
    config: &SilenceConfig,
) -> Result<Vec<Segment>, String> {
    // Get total duration via ffprobe
    let info = crate::editor::ffmpeg::run_ffprobe(audio_path)?;
    let total_duration_ms = info.duration_ms;

    // Detect silent regions
    let silences = detect_raw_silence(
        audio_path,
        config.threshold_db,
        config.min_silence_ms,
    )?;

    // Invert: compute non-silent ranges
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

    // Build padded & merged segments (matches the Python algorithm)
    let segments = build_segments(&nonsilent, total_duration_ms, config.padding_ms);
    Ok(segments)
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
