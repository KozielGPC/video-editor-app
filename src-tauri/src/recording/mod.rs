pub mod audio;
pub mod camera;
pub mod encoder;
pub mod mouse_tracker;
pub mod screen;

use crate::models::{RecordingConfig, RecordingState, ZoomMarker};
use std::time::Instant;

/// Central manager that coordinates FFmpeg-based recording and mouse tracking.
pub struct RecordingManager {
    pub state: RecordingState,
    pub encoder: Option<encoder::RecordingEncoder>,
    pub mouse_tracker: Option<mouse_tracker::MouseTracker>,
    pub output_path: Option<String>,
    /// Zoom markers placed by the user during recording (Cmd+Shift+Z)
    pub zoom_markers: Vec<ZoomMarker>,
    /// When the recording started (for computing marker timestamps)
    pub recording_start: Option<Instant>,
}

impl RecordingManager {
    pub fn new() -> Self {
        Self {
            state: RecordingState::Idle,
            encoder: None,
            mouse_tracker: None,
            output_path: None,
            zoom_markers: Vec::new(),
            recording_start: None,
        }
    }

    pub fn start_recording(&mut self, config: &RecordingConfig) -> Result<String, String> {
        if self.state != RecordingState::Idle {
            return Err("Recording is already in progress".to_string());
        }

        let screen_idx = config.screen_id.as_deref();
        let mic_idx = config.mic_id.as_deref();

        // Start FFmpeg encoder with avfoundation capture
        let enc = encoder::RecordingEncoder::start(
            &config.output_path,
            screen_idx,
            mic_idx,
            30, // fps
        )?;
        self.encoder = Some(enc);

        // Start mouse tracker for zoom markers
        let mut tracker = mouse_tracker::MouseTracker::new();
        tracker.start();
        self.mouse_tracker = Some(tracker);

        self.output_path = Some(config.output_path.clone());
        self.zoom_markers.clear();
        self.recording_start = Some(Instant::now());
        self.state = RecordingState::Recording;

        Ok(config.output_path.clone())
    }

    pub fn pause_recording(&mut self) -> Result<(), String> {
        if self.state != RecordingState::Recording {
            return Err("Not currently recording".to_string());
        }
        // Note: FFmpeg avfoundation doesn't natively support pause.
        // We track the paused state so the UI reflects it, but the
        // recording continues. A proper implementation would stop and
        // restart FFmpeg, concatenating segments on stop.
        self.state = RecordingState::Paused;
        Ok(())
    }

    pub fn resume_recording(&mut self) -> Result<(), String> {
        if self.state != RecordingState::Paused {
            return Err("Not currently paused".to_string());
        }
        self.state = RecordingState::Recording;
        Ok(())
    }

    pub fn stop_recording(&mut self) -> Result<String, String> {
        if self.state == RecordingState::Idle {
            return Err("No recording in progress".to_string());
        }

        // Stop FFmpeg encoder
        if let Some(enc) = self.encoder.take() {
            enc.stop()?;
        }

        // Stop mouse tracker and persist data
        if let Some(mut tracker) = self.mouse_tracker.take() {
            tracker.stop();
            if let Some(ref out) = self.output_path {
                let mouse_path = format!("{}.mouse.json", out);
                tracker.save_to_file(&mouse_path).ok();
            }
        }

        // Save zoom markers if any
        if !self.zoom_markers.is_empty() {
            if let Some(ref out) = self.output_path {
                let zoom_path = format!("{}.zoom.json", out);
                if let Ok(json) = serde_json::to_string_pretty(&self.zoom_markers) {
                    std::fs::write(&zoom_path, json).ok();
                }
            }
        }

        self.recording_start = None;
        self.state = RecordingState::Idle;
        let path = self.output_path.take().unwrap_or_default();
        Ok(path)
    }

    /// Mark a smooth zoom in/out at the current mouse position.
    pub fn mark_zoom_point(
        &mut self,
        scale: f64,
        duration_ms: u64,
    ) -> Result<ZoomMarker, String> {
        if self.state != RecordingState::Recording {
            return Err("Not currently recording".to_string());
        }
        let timestamp_ms = self
            .recording_start
            .map(|s| s.elapsed().as_millis() as u64)
            .unwrap_or(0);

        let (x, y) = mouse_tracker::get_current_mouse_position();

        let marker = ZoomMarker {
            x,
            y,
            timestamp_ms,
            scale,
            duration_ms,
        };
        self.zoom_markers.push(marker.clone());
        Ok(marker)
    }
}
