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

    let config = RecordingConfig {
        screen_id,
        camera_id,
        mic_id,
        output_path,
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

/// Mark a smooth zoom in/out at the current mouse position during recording.
#[tauri::command]
pub fn mark_zoom_point(
    scale: Option<f64>,
    duration_ms: Option<u64>,
    state: tauri::State<'_, Mutex<RecordingManager>>,
) -> Result<ZoomMarker, String> {
    let mut manager = state.lock().map_err(|e| e.to_string())?;
    manager.mark_zoom_point(scale.unwrap_or(2.0), duration_ms.unwrap_or(1500))
}
