pub mod audio;
pub mod audio_capture;
pub mod camera;
pub mod encoder;
pub mod mouse_tracker;
pub mod screen;

use crate::models::{RecordingConfig, RecordingState, ZoomMarker};
use std::time::Instant;

/// Central manager that coordinates FFmpeg-based recording, cpal audio capture,
/// and mouse tracking.
pub struct RecordingManager {
    pub state: RecordingState,
    pub encoder: Option<encoder::RecordingEncoder>,
    pub audio: Option<audio_capture::AudioCapture>,
    pub mouse_tracker: Option<mouse_tracker::MouseTracker>,
    pub output_path: Option<String>,
    /// Project directory for organized folder output (e.g. Recording_YYYYMMDD_HHMMSS/)
    pub project_dir: Option<String>,
    pub zoom_markers: Vec<ZoomMarker>,
    pub recording_start: Option<Instant>,
    pub is_zoomed_in: bool,
    pub screen_width: u32,
    pub screen_height: u32,
    /// Display origin X in the global coordinate space (for multi-monitor)
    pub screen_origin_x: f64,
    /// Display origin Y in the global coordinate space (for multi-monitor)
    pub screen_origin_y: f64,
}

impl RecordingManager {
    pub fn new() -> Self {
        Self {
            state: RecordingState::Idle,
            encoder: None,
            audio: None,
            mouse_tracker: None,
            output_path: None,
            project_dir: None,
            zoom_markers: Vec::new(),
            recording_start: None,
            is_zoomed_in: false,
            screen_width: 1920,
            screen_height: 1080,
            screen_origin_x: 0.0,
            screen_origin_y: 0.0,
        }
    }

    pub fn start_recording(&mut self, config: &RecordingConfig) -> Result<String, String> {
        if self.state != RecordingState::Idle {
            return Err("Recording is already in progress".to_string());
        }

        let screen_idx = config.screen_id.as_deref();
        let mic_idx = config.mic_id.as_deref();

        // Start FFmpeg for screen capture only (video, no audio)
        let enc = encoder::RecordingEncoder::start(
            &config.output_path,
            screen_idx,
            mic_idx,
            30,
        )?;
        self.encoder = Some(enc);

        // Start cpal audio capture if a mic is selected
        let has_mic = mic_idx.is_some() && mic_idx != Some("none");
        if has_mic {
            // Write audio into media/ directory if project_dir is set
            let wav_path = if let Some(ref pd) = self.project_dir {
                format!("{pd}/media/audio.wav")
            } else {
                format!("{}.audio.wav", config.output_path)
            };
            match audio_capture::AudioCapture::start(mic_idx.unwrap(), &wav_path) {
                Ok(capture) => {
                    self.audio = Some(capture);
                    eprintln!("[recording] cpal audio capture started → {wav_path}");
                }
                Err(e) => {
                    eprintln!("[recording] WARNING: cpal audio failed, continuing without audio: {e}");
                }
            }
        }

        let mut tracker = mouse_tracker::MouseTracker::new();
        tracker.start();
        self.mouse_tracker = Some(tracker);

        self.output_path = Some(config.output_path.clone());
        self.zoom_markers.clear();
        self.recording_start = Some(Instant::now());
        self.is_zoomed_in = false;
        self.screen_width = config.screen_width.max(1);
        self.screen_height = config.screen_height.max(1);
        self.screen_origin_x = config.screen_origin_x;
        self.screen_origin_y = config.screen_origin_y;
        self.state = RecordingState::Recording;

        Ok(config.output_path.clone())
    }

    pub fn pause_recording(&mut self) -> Result<(), String> {
        if self.state != RecordingState::Recording {
            return Err("Not currently recording".to_string());
        }
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

        // Stop FFmpeg encoder (video only)
        if let Some(enc) = self.encoder.take() {
            enc.stop()?;
        }

        // Stop cpal audio capture and mux into the video file
        let wav_path = if let Some(audio) = self.audio.take() {
            match audio.stop() {
                Ok(path) => Some(path),
                Err(e) => {
                    eprintln!("[recording] WARNING: Failed to stop audio capture: {e}");
                    None
                }
            }
        } else {
            None
        };

        // Mux audio into the video if we have a WAV file
        if let (Some(ref video_path), Some(ref wav)) = (&self.output_path, &wav_path) {
            let muxed_path = format!(
                "{}_muxed.mp4",
                video_path.trim_end_matches(".mp4")
            );
            match encoder::RecordingEncoder::mux_audio(video_path, wav, &muxed_path) {
                Ok(()) => {
                    // Replace original video-only file with muxed version
                    if let Err(e) = std::fs::rename(&muxed_path, video_path) {
                        eprintln!("[recording] WARNING: rename failed, keeping muxed file: {e}");
                        self.output_path = Some(muxed_path);
                    }
                    // Clean up WAV file
                    std::fs::remove_file(wav).ok();
                    eprintln!("[recording] Audio muxed successfully");
                }
                Err(e) => {
                    eprintln!("[recording] WARNING: Audio mux failed, video has no audio: {e}");
                }
            }
        }

        // Close any open zoom segment (user zoomed in but didn't zoom out)
        if self.is_zoomed_in {
            if let Some(last) = self.zoom_markers.last_mut() {
                if last.end_ms == 0 {
                    last.end_ms = self
                        .recording_start
                        .map(|s| s.elapsed().as_millis() as u64)
                        .unwrap_or(0);
                }
            }
            self.is_zoomed_in = false;
        }

        // Stop mouse tracker, enrich zoom markers with mouse positions, then persist
        if let Some(mut tracker) = self.mouse_tracker.take() {
            tracker.stop();

            // Enrich each zoom marker with sampled mouse positions (screen-relative %)
            let sw = self.screen_width as f64;
            let sh = self.screen_height as f64;
            let ox = self.screen_origin_x;
            let oy = self.screen_origin_y;
            for marker in &mut self.zoom_markers {
                if marker.end_ms <= marker.start_ms {
                    continue;
                }
                let raw_positions = tracker.get_positions_in_range(marker.start_ms, marker.end_ms);
                marker.positions = raw_positions
                    .into_iter()
                    .map(|p| crate::models::MousePosition {
                        x: ((p.x - ox) / sw * 100.0).clamp(0.0, 100.0),
                        y: ((p.y - oy) / sh * 100.0).clamp(0.0, 100.0),
                        timestamp_ms: p.timestamp_ms,
                    })
                    .collect();
            }

            // Save sidecar files into project_dir if available, else next to recording
            if let Some(ref pd) = self.project_dir {
                let mouse_path = format!("{pd}/mouse.json");
                tracker.save_to_file(&mouse_path).ok();
                let clicks_path = format!("{pd}/clicks.json");
                tracker.save_clicks_to_file(&clicks_path).ok();
            } else if let Some(ref out) = self.output_path {
                let mouse_path = format!("{}.mouse.json", out);
                tracker.save_to_file(&mouse_path).ok();
                let clicks_path = format!("{}.clicks.json", out);
                tracker.save_clicks_to_file(&clicks_path).ok();
            }
        }

        // Save zoom markers (filter out incomplete segments)
        let complete: Vec<_> = self
            .zoom_markers
            .iter()
            .filter(|m| m.end_ms > m.start_ms)
            .cloned()
            .collect();
        if !complete.is_empty() {
            let zoom_path = if let Some(ref pd) = self.project_dir {
                Some(format!("{pd}/zoom.json"))
            } else {
                self.output_path.as_ref().map(|out| format!("{out}.zoom.json"))
            };
            if let Some(zoom_path) = zoom_path {
                if let Ok(json) = serde_json::to_string_pretty(&complete) {
                    std::fs::write(&zoom_path, json).ok();
                }
            }
        }

        self.recording_start = None;
        self.state = RecordingState::Idle;
        self.project_dir = None;
        let path = self.output_path.take().unwrap_or_default();
        Ok(path)
    }

    /// Toggle zoom: first call zooms in at mouse position, second call zooms out.
    pub fn toggle_zoom(&mut self, scale: f64) -> Result<Option<ZoomMarker>, String> {
        if self.state != RecordingState::Recording {
            return Err("Not currently recording".to_string());
        }
        let now_ms = self
            .recording_start
            .map(|s| s.elapsed().as_millis() as u64)
            .unwrap_or(0);

        let (mx, my) = mouse_tracker::get_current_mouse_position();
        // Convert global mouse coordinates to screen-relative by subtracting display origin
        let rel_x = mx - self.screen_origin_x;
        let rel_y = my - self.screen_origin_y;
        let x = (rel_x / self.screen_width as f64 * 100.0).clamp(0.0, 100.0);
        let y = (rel_y / self.screen_height as f64 * 100.0).clamp(0.0, 100.0);

        if self.is_zoomed_in {
            if let Some(last) = self.zoom_markers.last_mut() {
                if last.end_ms == 0 {
                    last.end_ms = now_ms;
                }
            }
            self.is_zoomed_in = false;
            Ok(None)
        } else {
            let marker = ZoomMarker {
                start_ms: now_ms,
                end_ms: 0,
                x,
                y,
                scale,
                positions: Vec::new(),
            };
            self.zoom_markers.push(marker.clone());
            self.is_zoomed_in = true;
            Ok(Some(marker))
        }
    }
}
