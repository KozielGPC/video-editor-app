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

/// Result of generating the output path: project folder + screen file.
struct OutputPaths {
    /// The project directory, e.g. `~/Movies/AutoEditor/Recording_20260303_141500/`
    project_dir: String,
    /// The screen recording file, e.g. `.../media/screen.mp4`
    screen_path: String,
}

/// Generate a timestamped project folder in ~/Movies/AutoEditor/
fn generate_output_path() -> Result<OutputPaths, String> {
    let home = std::env::var("HOME").unwrap_or_else(|_| "/tmp".to_string());
    let base_dir = format!("{home}/Movies/AutoEditor");
    let ts = chrono::Local::now().format("%Y%m%d_%H%M%S");
    let project_dir = format!("{base_dir}/Recording_{ts}");
    let media_dir = format!("{project_dir}/media");
    std::fs::create_dir_all(&media_dir)
        .map_err(|e| format!("Cannot create output dir: {e}"))?;
    let screen_path = format!("{media_dir}/screen.mp4");
    Ok(OutputPaths {
        project_dir,
        screen_path,
    })
}

/// Camera layout for overlay positioning (percentages 0-100)
#[derive(serde::Deserialize)]
pub struct CameraLayoutInput {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
    #[serde(default)]
    pub shape: Option<String>,
    #[serde(default)]
    pub border_radius: Option<f64>,
    #[serde(default)]
    pub border_width: Option<u32>,
    #[serde(default)]
    pub border_color: Option<String>,
    #[serde(default)]
    pub shadow: Option<bool>,
    #[serde(default)]
    pub crop_x: Option<f64>,
    #[serde(default)]
    pub crop_y: Option<f64>,
    #[serde(default)]
    pub crop_width: Option<f64>,
    #[serde(default)]
    pub crop_height: Option<f64>,
}

/// Find the FFmpeg avfoundation device index for a screen.
///
/// The frontend may pass a Core Graphics display ID (like "1" for main display),
/// but FFmpeg needs the avfoundation device index. This function maps between them.
fn resolve_screen_index(screen_id: &str) -> String {
    // Get the list of FFmpeg screen devices
    let screens = match crate::recording::screen::enumerate_screens() {
        Ok(s) => s,
        Err(_) => return screen_id.to_string(), // Fallback to passed ID
    };

    // If the screen_id matches an existing FFmpeg screen ID directly, use it
    if screens.iter().any(|s| s.id == screen_id) {
        return screen_id.to_string();
    }

    // If we have screens, use the first one (most common case)
    // The Core Graphics display ID doesn't map directly to FFmpeg indices
    if let Some(first_screen) = screens.first() {
        eprintln!(
            "[recording] Mapping screen_id '{}' to FFmpeg device '{}'",
            screen_id, first_screen.id
        );
        return first_screen.id.clone();
    }

    // Fallback
    screen_id.to_string()
}

/// Find the FFmpeg avfoundation device index for a camera.
///
/// The frontend may pass a browser device ID or index, but FFmpeg needs
/// the avfoundation device index.
fn resolve_camera_index(camera_id: &str) -> String {
    // Get the list of FFmpeg camera devices
    let cameras = match crate::recording::camera::enumerate_cameras() {
        Ok(c) => c,
        Err(_) => return camera_id.to_string(),
    };

    // If the camera_id matches an existing FFmpeg camera ID directly, use it
    if cameras.iter().any(|c| c.id == camera_id) {
        return camera_id.to_string();
    }

    // Try to parse as an index
    if let Ok(idx) = camera_id.parse::<usize>() {
        if idx < cameras.len() {
            return cameras[idx].id.clone();
        }
    }

    // If we have cameras, use the first one
    if let Some(first_camera) = cameras.first() {
        eprintln!(
            "[recording] Mapping camera_id '{}' to FFmpeg device '{}'",
            camera_id, first_camera.id
        );
        return first_camera.id.clone();
    }

    camera_id.to_string()
}

/// Return value from start_recording so the frontend knows both paths.
#[derive(serde::Serialize)]
pub struct StartRecordingResult {
    /// The screen recording file path (media/screen.mp4)
    pub screen_path: String,
    /// The project directory (Recording_YYYYMMDD_HHMMSS/)
    pub project_dir: String,
}

/// Start recording. Screen + mic only; camera is recorded by the browser and merged later.
#[tauri::command]
pub fn start_recording(
    screen_id: Option<String>,
    mic_id: Option<String>,
    state: tauri::State<'_, Mutex<RecordingManager>>,
) -> Result<StartRecordingResult, String> {
    let paths = generate_output_path()?;

    // Resolve the screen ID to an FFmpeg avfoundation device index
    let resolved_screen_id = screen_id.as_ref().map(|id| resolve_screen_index(id));

    // Look up actual screen dimensions + origin from the enumerated screen list
    let screens = crate::recording::screen::enumerate_screens().unwrap_or_default();
    let selected_screen = screen_id
        .as_ref()
        .and_then(|sid| screens.iter().find(|s| s.id == *sid))
        .or_else(|| screens.first());
    let (sw, sh, sox, soy) = selected_screen
        .map(|s| (s.width, s.height, s.origin_x, s.origin_y))
        .unwrap_or((1920, 1080, 0.0, 0.0));

    eprintln!(
        "[recording] Starting with screen={:?}, mic={:?}, dims={}x{}, origin=({},{})",
        resolved_screen_id, mic_id, sw, sh, sox, soy
    );

    let config = RecordingConfig {
        screen_id: resolved_screen_id,
        camera_id: None,
        mic_id,
        output_path: paths.screen_path.clone(),
        screen_width: sw,
        screen_height: sh,
        screen_origin_x: sox,
        screen_origin_y: soy,
        camera_layout: None,
    };

    let mut manager = state.lock().map_err(|e| e.to_string())?;
    manager.project_dir = Some(paths.project_dir.clone());
    manager.start_recording(&config)?;

    Ok(StartRecordingResult {
        screen_path: paths.screen_path,
        project_dir: paths.project_dir,
    })
}

/// Merge screen recording with a camera recording captured by the browser.
///
/// The camera file is saved by the frontend via the fs plugin, then this
/// command composites it onto the screen recording using the scene layout.
#[tauri::command]
pub fn merge_camera_overlay(
    screen_path: String,
    camera_path: String,
    camera_layout: CameraLayoutInput,
    sync_offset_sec: Option<f64>,
) -> Result<String, String> {
    let overlay = crate::recording::encoder::CameraOverlayConfig {
        x_percent: camera_layout.x,
        y_percent: camera_layout.y,
        width_percent: camera_layout.width,
        height_percent: camera_layout.height,
        shape: camera_layout.shape,
        border_radius: camera_layout.border_radius,
        border_width: camera_layout.border_width,
        border_color: camera_layout.border_color,
        shadow: camera_layout.shadow,
        crop_x: camera_layout.crop_x,
        crop_y: camera_layout.crop_y,
        crop_width: camera_layout.crop_width,
        crop_height: camera_layout.crop_height,
    };

    // Merge into a temp file, then replace the original screen recording
    let merged_path = format!(
        "{}_merged.mp4",
        screen_path.trim_end_matches(".mp4")
    );

    crate::recording::encoder::RecordingEncoder::merge_with_camera(
        &screen_path,
        &camera_path,
        &merged_path,
        &overlay,
        sync_offset_sec.unwrap_or(0.0),
    )?;

    // Keep originals for editor (zoom needs screen-only + camera separate).
    // Return merged path; screen_path and camera_path remain on disk.
    eprintln!("[recording] Camera overlay merged into {}", merged_path);
    Ok(merged_path)
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
/// Also checks the project directory layout (project_dir/zoom.json).
#[tauri::command]
pub fn read_zoom_markers(recording_path: String) -> Result<Vec<ZoomMarker>, String> {
    // Try project-dir layout first: look for zoom.json in parent's parent
    // e.g. Recording_xxx/media/screen.mp4 -> Recording_xxx/zoom.json
    let project_dir_path = std::path::Path::new(&recording_path)
        .parent()
        .and_then(|p| p.parent())
        .map(|p| p.join("zoom.json"));
    let legacy_path = format!("{recording_path}.zoom.json");

    let zoom_path = if let Some(ref pd) = project_dir_path {
        if pd.exists() {
            pd.to_string_lossy().to_string()
        } else {
            legacy_path
        }
    } else {
        legacy_path
    };

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
                positions: Vec::new(),
            })
            .collect();
        return Ok(converted);
    }
    Ok(vec![])
}
