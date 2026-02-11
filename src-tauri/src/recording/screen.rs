use crate::models::ScreenInfo;
use std::process::Command;

/// Enumerate available screens using FFmpeg's avfoundation device listing.
pub fn enumerate_screens() -> Result<Vec<ScreenInfo>, String> {
    let output = Command::new("ffmpeg")
        .args(["-f", "avfoundation", "-list_devices", "true", "-i", ""])
        .output()
        .map_err(|e| format!("Failed to run ffmpeg: {e}"))?;

    // FFmpeg prints device list to stderr.
    // Format: [AVFoundation indev @ 0x...] [0] Capture screen 0
    let stderr = String::from_utf8_lossy(&output.stderr);
    let mut screens = Vec::new();
    let mut in_video_section = false;

    for line in stderr.lines() {
        if line.contains("AVFoundation video devices:") {
            in_video_section = true;
            continue;
        }
        if line.contains("AVFoundation audio devices:") {
            break;
        }
        if !in_video_section {
            continue;
        }

        // Parse lines like: [AVFoundation indev @ 0x...] [0] Capture screen 0
        // Find the SECOND bracket pair which has the device index.
        if let Some(parsed) = parse_device_line(line) {
            let lower = parsed.1.to_lowercase();
            if lower.contains("screen") || lower.contains("display") || lower.contains("capture") {
                screens.push(ScreenInfo {
                    id: parsed.0.to_string(),
                    name: parsed.1,
                    width: 1920,
                    height: 1080,
                });
            }
        }
    }

    // Always provide at least one default screen
    if screens.is_empty() {
        screens.push(ScreenInfo {
            id: "0".to_string(),
            name: "Default Screen".to_string(),
            width: 1920,
            height: 1080,
        });
    }

    Ok(screens)
}

/// Parse an avfoundation device line and extract (index, name).
/// Input: `[AVFoundation indev @ 0x7f8...] [0] FaceTime HD Camera`
/// Returns: Some((0, "FaceTime HD Camera"))
fn parse_device_line(line: &str) -> Option<(u32, String)> {
    // Find all `[...]` bracket pairs in the line
    let mut brackets: Vec<&str> = Vec::new();
    let mut rest = line;
    while let Some(start) = rest.find('[') {
        let after = &rest[start + 1..];
        if let Some(end) = after.find(']') {
            brackets.push(&after[..end]);
            rest = &after[end + 1..];
        } else {
            break;
        }
    }

    // We need at least 2 bracket pairs: [AVFoundation...] [index]
    if brackets.len() < 2 {
        return None;
    }

    let idx: u32 = brackets[1].trim().parse().ok()?;

    // The device name is everything after the second `]`
    let second_bracket_close = line.find(']').and_then(|first| {
        line[first + 1..].find(']').map(|second| first + 1 + second + 1)
    })?;
    let name = line[second_bracket_close..].trim().to_string();

    Some((idx, name))
}

/// Placeholder screen recorder (capture handled by FFmpeg in RecordingManager).
pub struct ScreenRecorder;

impl ScreenRecorder {
    pub fn new() -> Self {
        Self
    }
}
