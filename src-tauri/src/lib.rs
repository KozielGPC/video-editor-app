pub mod capture;
mod commands;
mod editor;
pub mod models;
pub mod recording;

use std::sync::Mutex;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .manage(Mutex::new(recording::RecordingManager::new()))
        .manage(Mutex::new(commands::export::ExportManager::new()))
        // Capture streaming manager for live preview
        .manage(Mutex::new(capture::CaptureManager::new()))
        // Custom protocol for serving local video files with range-request support
        .register_uri_scheme_protocol("stream", |_app, request| {
            use std::io::{Read, Seek, SeekFrom};
            use tauri::http::Response;

            let uri = request.uri().to_string();
            // URL format: stream://localhost/<encoded_path>
            let path = uri
                .strip_prefix("stream://localhost/")
                .or_else(|| uri.strip_prefix("stream://localhost"))
                .unwrap_or("");
            let path = percent_encoding::percent_decode_str(path)
                .decode_utf8_lossy()
                .into_owned();
            // Ensure leading slash on macOS
            let path = if !path.starts_with('/') {
                format!("/{path}")
            } else {
                path
            };

            let mime = if path.ends_with(".mp4") || path.ends_with(".m4v") {
                "video/mp4"
            } else if path.ends_with(".mov") {
                "video/quicktime"
            } else if path.ends_with(".webm") {
                "video/webm"
            } else if path.ends_with(".mkv") {
                "video/x-matroska"
            } else if path.ends_with(".wav") {
                "audio/wav"
            } else if path.ends_with(".mp3") {
                "audio/mpeg"
            } else if path.ends_with(".aac") || path.ends_with(".m4a") {
                "audio/aac"
            } else if path.ends_with(".png") {
                "image/png"
            } else if path.ends_with(".jpg") || path.ends_with(".jpeg") {
                "image/jpeg"
            } else {
                "application/octet-stream"
            };

            let mut file = match std::fs::File::open(&path) {
                Ok(f) => f,
                Err(_) => {
                    return Response::builder()
                        .status(404)
                        .header("Content-Type", "text/plain")
                        .body(format!("File not found: {path}").into_bytes())
                        .unwrap();
                }
            };

            let total_size = file.metadata().map(|m| m.len()).unwrap_or(0);

            // Check for Range header (required for video seeking)
            let range_header = request
                .headers()
                .get("range")
                .and_then(|v| v.to_str().ok())
                .map(String::from);

            if let Some(range) = range_header {
                let range = range.strip_prefix("bytes=").unwrap_or(&range);
                let parts: Vec<&str> = range.split('-').collect();
                let start: u64 = parts[0].parse().unwrap_or(0);
                let end: u64 = if parts.len() > 1 && !parts[1].is_empty() {
                    parts[1].parse().unwrap_or(total_size - 1)
                } else {
                    let chunk_size: u64 = 1024 * 1024; // 1 MB chunks
                    std::cmp::min(start + chunk_size - 1, total_size - 1)
                };

                let length = end - start + 1;
                file.seek(SeekFrom::Start(start)).ok();
                let mut buf = vec![0u8; length as usize];
                file.read_exact(&mut buf).ok();

                Response::builder()
                    .status(206)
                    .header("Content-Type", mime)
                    .header("Content-Length", length.to_string())
                    .header(
                        "Content-Range",
                        format!("bytes {start}-{end}/{total_size}"),
                    )
                    .header("Accept-Ranges", "bytes")
                    .body(buf)
                    .unwrap()
            } else {
                let mut buf = Vec::with_capacity(total_size as usize);
                file.read_to_end(&mut buf).ok();

                Response::builder()
                    .header("Content-Type", mime)
                    .header("Content-Length", total_size.to_string())
                    .header("Accept-Ranges", "bytes")
                    .body(buf)
                    .unwrap()
            }
        })
        .invoke_handler(tauri::generate_handler![
            // Core Graphics-based source enumeration
            capture::list_capturable_windows,
            capture::list_capturable_screens,
            // Core Graphics-based live capture streaming
            capture::get_capture_capabilities,
            capture::start_source_capture,
            capture::stop_source_capture,
            capture::stop_all_captures,
            capture::get_source_frame,
            capture::is_source_capturing,
            capture::get_active_captures,
            capture::get_capture_frame_count,
            // Recording
            commands::recording::list_screens,
            commands::recording::list_cameras,
            commands::recording::list_microphones,
            commands::recording::start_recording,
            commands::recording::pause_recording,
            commands::recording::resume_recording,
            commands::recording::stop_recording,
            commands::recording::get_recording_state,
            commands::recording::toggle_zoom,
            commands::recording::read_zoom_markers,
            commands::recording::merge_camera_overlay,
            // Media
            commands::media::probe_media,
            commands::media::generate_thumbnails,
            commands::media::extract_audio,
            // Editor
            commands::editor::create_project,
            commands::editor::save_project,
            commands::editor::load_project,
            commands::editor::detect_silence,
            // Export
            commands::export::start_export,
            commands::export::cancel_export,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
