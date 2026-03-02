use crate::models::MediaInfo;

#[tauri::command]
pub fn probe_media(path: String) -> Result<MediaInfo, String> {
    crate::editor::ffmpeg::run_ffprobe(&path)
}

#[tauri::command]
pub fn generate_thumbnails(
    path: String,
    count: u32,
    output_dir: String,
) -> Result<Vec<String>, String> {
    crate::editor::ffmpeg::extract_thumbnails(&path, count, &output_dir)
}

#[tauri::command]
pub fn extract_audio(video_path: String, output_path: String) -> Result<(), String> {
    crate::editor::ffmpeg::extract_audio_to_wav(&video_path, &output_path)
}

/// Open a file with the default application (macOS `open`).
#[tauri::command]
pub fn open_file(path: String) -> Result<(), String> {
    std::process::Command::new("open")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("Failed to open file: {e}"))?;
    Ok(())
}

/// Reveal a file in Finder (macOS `open -R`).
#[tauri::command]
pub fn reveal_in_finder(path: String) -> Result<(), String> {
    std::process::Command::new("open")
        .arg("-R")
        .arg(&path)
        .spawn()
        .map_err(|e| format!("Failed to reveal in Finder: {e}"))?;
    Ok(())
}
