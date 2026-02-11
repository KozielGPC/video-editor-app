use crate::models::{
    CameraInfo, MicrophoneInfo, RecordingConfig, RecordingState, ScreenInfo, ZoomMarker,
};
use crate::recording::RecordingManager;
use std::sync::Mutex;

// ---------------------------------------------------------------------------
// Device enumeration
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn list_screens() -> Result<Vec<ScreenInfo>, String> {
    crate::recording::screen::enumerate_screens()
}

#[tauri::command]
pub fn list_cameras() -> Result<Vec<CameraInfo>, String> {
    crate::recording::camera::enumerate_cameras()
}

#[tauri::command]
pub fn list_microphones() -> Result<Vec<MicrophoneInfo>, String> {
    crate::recording::audio::enumerate_microphones()
}

// ---------------------------------------------------------------------------
// Recording lifecycle
// ---------------------------------------------------------------------------

/// Generate a timestamped output path in ~/Movies/AutoEditor/
fn generate_output_path() -> Result<String, String> {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    let dir = format!("{home}/Movies/AutoEditor");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Cannot create output dir: {e}"))?;
    let ts = chrono::Local::now().format("%Y%m%d_%H%M%S");
    Ok(format!("{dir}/recording_{ts}.mp4"))
}

/// Start recording. Accepts flat arguments matching the frontend invoke call.
#[tauri::command]
pub fn start_recording(
    screen_id: Option<String>,
    camera_id: Option<String>,
    mic_id: Option<String>,
    state: tauri::State<'_, Mutex<RecordingManager>>,
) -> Result<String, String> {
    let output_path = generate_output_path()?;

    let (screen_width, screen_height) = screen_id
        .as_ref()
        .and_then(|id| {
            crate::recording::screen::enumerate_screens().ok().and_then(|screens| {
                screens
                    .into_iter()
                    .find(|s| s.id == *id)
                    .map(|s| (s.width, s.height))
            })
        })
        .unwrap_or((1920, 1080));

    let config = RecordingConfig {
        screen_id,
        camera_id,
        mic_id,
        output_path,
        screen_width,
        screen_height,
    };

    let mut manager = state.lock().map_err(|e| e.to_string())?;
    manager.start_recording(&config)
}

#[tauri::command]
pub fn pause_recording(
    state: tauri::State<'_, Mutex<RecordingManager>>,
) -> Result<(), String> {
    let mut manager = state.lock().map_err(|e| e.to_string())?;
    manager.pause_recording()
}

#[tauri::command]
pub fn resume_recording(
    state: tauri::State<'_, Mutex<RecordingManager>>,
) -> Result<(), String> {
    let mut manager = state.lock().map_err(|e| e.to_string())?;
    manager.resume_recording()
}

#[tauri::command]
pub fn stop_recording(
    state: tauri::State<'_, Mutex<RecordingManager>>,
) -> Result<String, String> {
    let mut manager = state.lock().map_err(|e| e.to_string())?;
    manager.stop_recording()
}

#[tauri::command]
pub fn get_recording_state(
    state: tauri::State<'_, Mutex<RecordingManager>>,
) -> Result<RecordingState, String> {
    let manager = state.lock().map_err(|e| e.to_string())?;
    Ok(manager.state.clone())
}

/// Toggle zoom during recording: first call zooms in at mouse position, second call zooms out.
#[tauri::command]
pub fn toggle_zoom(
    scale: Option<f64>,
    state: tauri::State<'_, Mutex<RecordingManager>>,
) -> Result<Option<ZoomMarker>, String> {
    let mut manager = state.lock().map_err(|e| e.to_string())?;
    manager.toggle_zoom(scale.unwrap_or(2.0))
}

/// Legacy zoom marker format (old "add marker each time" behavior).
#[derive(serde::Deserialize)]
struct LegacyZoomMarker {
    x: f64,
    y: f64,
    timestamp_ms: u64,
    scale: f64,
    duration_ms: u64,
}

/// Read zoom markers from the sidecar file next to a recording.
/// Supports both new (start_ms/end_ms) and legacy (timestamp_ms/duration_ms) formats.
#[tauri::command]
pub fn read_zoom_markers(recording_path: String) -> Result<Vec<ZoomMarker>, String> {
    let zoom_path = format!("{recording_path}.zoom.json");
    let json = match std::fs::read_to_string(&zoom_path) {
        Ok(s) => s,
        Err(_) => return Ok(vec![]),
    };
    if let Ok(markers) = serde_json::from_str::<Vec<ZoomMarker>>(&json) {
        return Ok(markers);
    }
    if let Ok(legacy) = serde_json::from_str::<Vec<LegacyZoomMarker>>(&json) {
        let converted: Vec<ZoomMarker> = legacy
            .into_iter()
            .map(|m| ZoomMarker {
                start_ms: m.timestamp_ms,
                end_ms: m.timestamp_ms + m.duration_ms,
                x: m.x,
                y: m.y,
                scale: m.scale,
            })
            .collect();
        return Ok(converted);
    }
    Ok(vec![])
}
