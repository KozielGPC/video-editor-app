use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// ---------------------------------------------------------------------------
// Recording types
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ScreenInfo {
    pub id: String,
    pub name: String,
    pub width: u32,
    pub height: u32,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct CameraInfo {
    pub id: String,
    pub name: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MicrophoneInfo {
    pub id: String,
    pub name: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct RecordingConfig {
    pub screen_id: Option<String>,
    pub camera_id: Option<String>,
    pub mic_id: Option<String>,
    pub output_path: String,
}

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
pub enum RecordingState {
    Idle,
    Recording,
    Paused,
}

// ---------------------------------------------------------------------------
// Media types
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MediaInfo {
    pub path: String,
    pub duration_ms: u64,
    pub width: u32,
    pub height: u32,
    pub codec: String,
    pub has_audio: bool,
    pub has_video: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Segment {
    pub start_ms: u64,
    pub end_ms: u64,
}

impl Segment {
    pub fn duration_ms(&self) -> u64 {
        self.end_ms - self.start_ms
    }

    pub fn start_seconds(&self) -> f64 {
        self.start_ms as f64 / 1000.0
    }

    pub fn end_seconds(&self) -> f64 {
        self.end_ms as f64 / 1000.0
    }
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SilenceConfig {
    pub threshold_db: f64,
    pub min_silence_ms: u64,
    pub padding_ms: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct MousePosition {
    pub x: f64,
    pub y: f64,
    pub timestamp_ms: u64,
}

/// A user-placed "zoom here" marker recorded via shortcut during recording.
#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ZoomMarker {
    pub x: f64,
    pub y: f64,
    pub timestamp_ms: u64,
    /// Default zoom scale to apply (e.g. 2.0 = 2x zoom)
    pub scale: f64,
    /// Duration of the smooth zoom in+out in milliseconds
    pub duration_ms: u64,
}

// ---------------------------------------------------------------------------
// Project / Editor types
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProjectData {
    pub id: String,
    pub name: String,
    pub resolution: (u32, u32),
    pub frame_rate: f64,
    pub tracks: Vec<TrackData>,
    pub assets: Vec<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct TrackData {
    pub id: String,
    pub track_type: String,
    pub clips: Vec<ClipData>,
    pub muted: bool,
    pub locked: bool,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ClipData {
    pub id: String,
    pub asset_id: String,
    pub track_position: u64,
    pub source_start: u64,
    pub source_end: u64,
    pub volume: f64,
    pub effects: Vec<EffectData>,
    pub overlays: Vec<OverlayData>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct EffectData {
    pub effect_type: String,
    pub start_time: u64,
    pub duration: u64,
    pub params: HashMap<String, serde_json::Value>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct OverlayData {
    pub overlay_type: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    pub content: String,
    pub start_time: u64,
    pub duration: u64,
}

// ---------------------------------------------------------------------------
// Export types
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ExportConfig {
    pub project: ProjectData,
    pub output_path: String,
    pub format: String,
    pub width: u32,
    pub height: u32,
    pub video_bitrate: String,
    pub audio_bitrate: String,
    pub fps: f64,
}
