use crate::models::{ProjectData, Segment, SilenceConfig};

#[tauri::command]
pub fn create_project(
    name: String,
    width: u32,
    height: u32,
    fps: f64,
) -> Result<ProjectData, String> {
    Ok(crate::editor::project::create_new_project(
        &name, width, height, fps,
    ))
}

#[tauri::command]
pub fn save_project(project: ProjectData, path: String) -> Result<(), String> {
    crate::editor::project::save_project_to_file(&project, &path)
}

#[tauri::command]
pub fn load_project(path: String) -> Result<ProjectData, String> {
    crate::editor::project::load_project_from_file(&path)
}

#[tauri::command]
pub fn detect_silence(
    audio_path: String,
    config: SilenceConfig,
) -> Result<Vec<Segment>, String> {
    crate::editor::silence::detect_silence_regions(&audio_path, &config)
}
