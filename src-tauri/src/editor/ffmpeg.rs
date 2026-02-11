use crate::models::{ClipData, MediaInfo, ProjectData};
use std::process::{Command, Stdio};

// ---------------------------------------------------------------------------
// FFmpeg availability
// ---------------------------------------------------------------------------

/// Returns `true` if `ffmpeg` and `ffprobe` are on PATH.
pub fn check_ffmpeg_installed() -> bool {
    Command::new("ffmpeg")
        .arg("-version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
        && Command::new("ffprobe")
            .arg("-version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
}

// ---------------------------------------------------------------------------
// ffprobe
// ---------------------------------------------------------------------------

/// Probe a media file and return structured info.
pub fn run_ffprobe(path: &str) -> Result<MediaInfo, String> {
    let output = Command::new("ffprobe")
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            path,
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("ffprobe spawn: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffprobe failed: {stderr}"));
    }

    let json: serde_json::Value =
        serde_json::from_slice(&output.stdout).map_err(|e| format!("ffprobe json: {e}"))?;

    let duration_ms = json["format"]["duration"]
        .as_str()
        .and_then(|s| s.parse::<f64>().ok())
        .map(|d| (d * 1000.0) as u64)
        .unwrap_or(0);

    let streams = json["streams"].as_array();

    let mut width = 0u32;
    let mut height = 0u32;
    let mut codec = String::new();
    let mut has_video = false;
    let mut has_audio = false;

    if let Some(streams) = streams {
        for stream in streams {
            let codec_type = stream["codec_type"].as_str().unwrap_or("");
            match codec_type {
                "video" => {
                    has_video = true;
                    width = stream["width"].as_u64().unwrap_or(0) as u32;
                    height = stream["height"].as_u64().unwrap_or(0) as u32;
                    codec = stream["codec_name"]
                        .as_str()
                        .unwrap_or("unknown")
                        .to_string();
                }
                "audio" => {
                    has_audio = true;
                }
                _ => {}
            }
        }
    }

    Ok(MediaInfo {
        path: path.to_string(),
        duration_ms,
        width,
        height,
        codec,
        has_audio,
        has_video,
    })
}

// ---------------------------------------------------------------------------
// Generic FFmpeg runner
// ---------------------------------------------------------------------------

/// Run an arbitrary FFmpeg command and return combined output.
pub fn run_ffmpeg(args: &[&str]) -> Result<String, String> {
    let output = Command::new("ffmpeg")
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("ffmpeg spawn: {e}"))?;

    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        return Err(format!("ffmpeg failed: {stderr}"));
    }

    Ok(stderr) // FFmpeg writes progress / info to stderr
}

// ---------------------------------------------------------------------------
// Export filter_complex builder
// ---------------------------------------------------------------------------

/// Build a `filter_complex` string that trims, concatenates, and overlays
/// every clip in the project.
///
/// Each asset file is an FFmpeg input (`-i`).  The returned struct includes
/// the ordered input paths and the filter graph string.
pub struct ExportGraph {
    pub input_paths: Vec<String>,
    pub filter_complex: String,
    pub has_audio: bool,
}

pub fn build_export_filter_complex(project: &ProjectData) -> ExportGraph {
    let mut input_paths: Vec<String> = Vec::new();
    let mut asset_to_input: std::collections::HashMap<String, usize> = Default::default();
    let mut filter_parts: Vec<String> = Vec::new();
    let mut concat_video_labels: Vec<String> = Vec::new();
    let mut concat_audio_labels: Vec<String> = Vec::new();
    let mut label_counter: usize = 0;

    // Collect all clips across all tracks (flatten; sorted by track_position)
    let mut all_clips: Vec<&ClipData> = Vec::new();
    for track in &project.tracks {
        if track.muted || track.locked {
            continue;
        }
        for clip in &track.clips {
            all_clips.push(clip);
        }
    }
    all_clips.sort_by_key(|c| c.track_position);

    for clip in &all_clips {
        // Register asset as FFmpeg input (deduplicate)
        let input_idx = *asset_to_input.entry(clip.asset_id.clone()).or_insert_with(|| {
            let idx = input_paths.len();
            input_paths.push(clip.asset_id.clone());
            idx
        });

        let start_sec = clip.source_start as f64 / 1000.0;
        let end_sec = clip.source_end as f64 / 1000.0;

        let vl = format!("v{label_counter}");
        let al = format!("a{label_counter}");
        label_counter += 1;

        // Trim video
        filter_parts.push(format!(
            "[{input_idx}:v]trim=start={start_sec:.3}:end={end_sec:.3},setpts=PTS-STARTPTS[{vl}]"
        ));

        // Trim audio
        filter_parts.push(format!(
            "[{input_idx}:a]atrim=start={start_sec:.3}:end={end_sec:.3},asetpts=PTS-STARTPTS,volume={vol}[{al}]",
            vol = clip.volume,
        ));

        concat_video_labels.push(format!("[{vl}]"));
        concat_audio_labels.push(format!("[{al}]"));
    }

    let n = concat_video_labels.len();
    let has_audio = !concat_audio_labels.is_empty();

    if n > 0 {
        let concat_inputs: String = concat_video_labels
            .iter()
            .zip(concat_audio_labels.iter())
            .map(|(v, a)| format!("{v}{a}"))
            .collect();

        filter_parts.push(format!(
            "{concat_inputs}concat=n={n}:v=1:a=1[outv][outa]"
        ));
    }

    ExportGraph {
        input_paths,
        filter_complex: filter_parts.join(";\n"),
        has_audio,
    }
}

// ---------------------------------------------------------------------------
// FFmpeg progress parser
// ---------------------------------------------------------------------------

/// Parse an FFmpeg stderr progress line and return the current time in seconds.
/// FFmpeg writes lines like: `out_time_us=12345678`
pub fn parse_ffmpeg_progress(line: &str) -> Option<f64> {
    // Standard progress output: `out_time_us=<microseconds>`
    if let Some(rest) = line.strip_prefix("out_time_us=") {
        if let Ok(us) = rest.trim().parse::<i64>() {
            return Some(us as f64 / 1_000_000.0);
        }
    }
    // Fallback: parse `time=HH:MM:SS.ms` from stderr
    if let Some(idx) = line.find("time=") {
        let time_str = &line[idx + 5..];
        let end = time_str.find(' ').unwrap_or(time_str.len());
        let t = &time_str[..end];
        return parse_time_string(t);
    }
    None
}

fn parse_time_string(t: &str) -> Option<f64> {
    let parts: Vec<&str> = t.split(':').collect();
    if parts.len() == 3 {
        let h = parts[0].parse::<f64>().ok()?;
        let m = parts[1].parse::<f64>().ok()?;
        let s = parts[2].parse::<f64>().ok()?;
        Some(h * 3600.0 + m * 60.0 + s)
    } else {
        None
    }
}

// ---------------------------------------------------------------------------
// Thumbnail extraction
// ---------------------------------------------------------------------------

/// Extract `count` evenly-spaced thumbnails from a video file.
pub fn extract_thumbnails(
    video_path: &str,
    count: u32,
    output_dir: &str,
) -> Result<Vec<String>, String> {
    std::fs::create_dir_all(output_dir).map_err(|e| format!("mkdir: {e}"))?;

    let info = run_ffprobe(video_path)?;
    if info.duration_ms == 0 {
        return Err("Video has zero duration".to_string());
    }

    let interval_sec = (info.duration_ms as f64 / 1000.0) / count as f64;
    let mut paths = Vec::new();

    for i in 0..count {
        let ts = interval_sec * i as f64;
        let out_path = format!("{output_dir}/thumb_{i:04}.jpg");

        let status = Command::new("ffmpeg")
            .args([
                "-y",
                "-ss",
                &format!("{ts:.3}"),
                "-i",
                video_path,
                "-frames:v",
                "1",
                "-q:v",
                "2",
                &out_path,
            ])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map_err(|e| format!("ffmpeg thumbnail: {e}"))?;

        if status.success() {
            paths.push(out_path);
        }
    }

    Ok(paths)
}

// ---------------------------------------------------------------------------
// Audio extraction
// ---------------------------------------------------------------------------

/// Extract audio from a video file as WAV (PCM s16le, 44100 Hz, stereo).
pub fn extract_audio_to_wav(video_path: &str, output_path: &str) -> Result<(), String> {
    let status = Command::new("ffmpeg")
        .args([
            "-y",
            "-i",
            video_path,
            "-vn",
            "-acodec",
            "pcm_s16le",
            "-ar",
            "44100",
            "-ac",
            "2",
            output_path,
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|e| format!("ffmpeg extract audio: {e}"))?;

    if !status.success() {
        return Err("ffmpeg extract audio failed".to_string());
    }

    Ok(())
}
