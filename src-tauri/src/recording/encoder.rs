use std::process::{Child, Command, Stdio};

/// Parse a hex color string (e.g. "#ffffff" or "ffffff") into (r, g, b).
fn parse_hex_color(hex: &str) -> (u8, u8, u8) {
    let hex = hex.trim_start_matches('#');
    if hex.len() >= 6 {
        let r = u8::from_str_radix(&hex[0..2], 16).unwrap_or(255);
        let g = u8::from_str_radix(&hex[2..4], 16).unwrap_or(255);
        let b = u8::from_str_radix(&hex[4..6], 16).unwrap_or(255);
        (r, g, b)
    } else {
        (255, 255, 255)
    }
}

/// Camera overlay configuration with percentage-based positioning (used by merge step)
#[derive(Debug, Clone)]
pub struct CameraOverlayConfig {
    /// X position as percentage of screen width (0-100)
    pub x_percent: f64,
    /// Y position as percentage of screen height (0-100)
    pub y_percent: f64,
    /// Width as percentage of screen width (0-100)
    pub width_percent: f64,
    /// Height as percentage of screen height (0-100)
    pub height_percent: f64,
    /// Shape: "rectangle" | "rounded" | "circle"
    pub shape: Option<String>,
    /// Border radius percentage (0-50) for "rounded" shape
    pub border_radius: Option<f64>,
    /// Border width in pixels
    pub border_width: Option<u32>,
    /// Border color as hex string (e.g. "#ffffff")
    pub border_color: Option<String>,
    /// Whether to add a drop shadow
    pub shadow: Option<bool>,
    /// Crop X offset as percentage of camera native width (0-100)
    pub crop_x: Option<f64>,
    /// Crop Y offset as percentage of camera native height (0-100)
    pub crop_y: Option<f64>,
    /// Crop width as percentage of camera native width (0-100)
    pub crop_width: Option<f64>,
    /// Crop height as percentage of camera native height (0-100)
    pub crop_height: Option<f64>,
}

/// FFmpeg-based recording encoder for screen + microphone capture.
///
/// Camera is recorded separately by the browser via MediaRecorder and merged
/// in post-processing using `merge_with_camera()`. This avoids camera device
/// conflicts between the browser (preview) and FFmpeg (recording).
pub struct RecordingEncoder {
    ffmpeg_process: Child,
}

impl RecordingEncoder {
    /// Start screen-only recording (video, no audio).
    ///
    /// Audio is captured separately via cpal (CoreAudio) and muxed after
    /// recording stops, producing clean pop-free audio.
    pub fn start(
        output_path: &str,
        screen_idx: Option<&str>,
        _mic_idx: Option<&str>,
        fps: u32,
    ) -> Result<Self, String> {
        let mut args: Vec<String> = Vec::new();
        args.push("-y".to_string());

        // ── Input 0: Screen capture (video only) ──
        let screen_part = screen_idx.unwrap_or("none");
        args.extend([
            "-f".to_string(),
            "avfoundation".to_string(),
            "-thread_queue_size".to_string(),
            "1024".to_string(),
            "-framerate".to_string(),
            fps.to_string(),
            "-capture_cursor".to_string(),
            "1".to_string(),
            "-capture_mouse_clicks".to_string(),
            "1".to_string(),
            "-i".to_string(),
            format!("{screen_part}:none"),
        ]);

        // ── Video codec ──
        args.extend([
            "-c:v".to_string(),
            "h264_videotoolbox".to_string(),
            "-b:v".to_string(),
            "12M".to_string(),
            "-maxrate".to_string(),
            "15M".to_string(),
            "-bufsize".to_string(),
            "24M".to_string(),
            "-pix_fmt".to_string(),
            "yuv420p".to_string(),
            "-r".to_string(),
            fps.to_string(),
            // No audio — captured separately via cpal
            "-an".to_string(),
        ]);

        args.push(output_path.to_string());

        eprintln!("[encoder] FFmpeg args: {:?}", args);

        let child = Command::new("ffmpeg")
            .args(&args)
            .stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn FFmpeg: {e}"))?;

        Ok(Self {
            ffmpeg_process: child,
        })
    }

    /// Mux a video file (no audio) with a WAV audio file into a final MP4.
    ///
    /// Uses `-c:v copy` (no re-encode) and `-c:a aac` for the audio.
    pub fn mux_audio(video_path: &str, wav_path: &str, output_path: &str) -> Result<(), String> {
        let args = [
            "-y",
            "-i", video_path,
            "-i", wav_path,
            "-c:v", "copy",
            "-c:a", "aac",
            "-b:a", "256k",
            "-shortest",
            output_path,
        ];

        eprintln!("[encoder] Mux audio args: {:?}", args);

        let output = Command::new("ffmpeg")
            .args(&args)
            .output()
            .map_err(|e| format!("FFmpeg mux failed to run: {e}"))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let tail = if stderr.len() > 500 {
                &stderr[stderr.len() - 500..]
            } else {
                &stderr
            };
            return Err(format!("FFmpeg mux failed: {tail}"));
        }

        eprintln!("[encoder] Audio mux completed: {output_path}");
        Ok(())
    }

    /// Gracefully stop recording by sending 'q' to FFmpeg's stdin.
    pub fn stop(mut self) -> Result<(), String> {
        // Send 'q' to FFmpeg to stop recording gracefully
        if let Some(mut stdin) = self.ffmpeg_process.stdin.take() {
            use std::io::Write;
            stdin.write_all(b"q").ok();
            drop(stdin);
        }

        // Read stderr in a background thread to avoid pipe buffer deadlock
        let stderr_handle = self.ffmpeg_process.stderr.take().map(|stderr| {
            std::thread::spawn(move || {
                use std::io::Read;
                let mut output = String::new();
                let mut reader = std::io::BufReader::new(stderr);
                reader.read_to_string(&mut output).ok();
                output
            })
        });

        // Wait for FFmpeg to finish
        match self.ffmpeg_process.wait() {
            Ok(status) => {
                let stderr_output = stderr_handle
                    .and_then(|h| h.join().ok())
                    .unwrap_or_default();

                if !stderr_output.is_empty() {
                    let tail = if stderr_output.len() > 1000 {
                        &stderr_output[stderr_output.len() - 1000..]
                    } else {
                        &stderr_output
                    };
                    eprintln!("[encoder] FFmpeg stderr (last 1000 chars):\n{tail}");
                }

                if status.success() || status.code() == Some(255) {
                    // 255 is normal for 'q' quit
                    Ok(())
                } else {
                    let tail = if stderr_output.len() > 500 {
                        &stderr_output[stderr_output.len() - 500..]
                    } else {
                        &stderr_output
                    };
                    Err(format!(
                        "FFmpeg exited with status: {status}\nFFmpeg output: {tail}"
                    ))
                }
            }
            Err(e) => Err(format!("Failed to wait for FFmpeg: {e}")),
        }
    }

    /// Force-kill the FFmpeg process.
    pub fn kill(&mut self) {
        self.ffmpeg_process.kill().ok();
    }

    /// Probe a video file to get its actual resolution.
    pub fn probe_resolution(path: &str) -> Result<(u32, u32), String> {
        let output = Command::new("ffprobe")
            .args([
                "-v",
                "error",
                "-select_streams",
                "v:0",
                "-show_entries",
                "stream=width,height",
                "-of",
                "csv=p=0:s=x",
                path,
            ])
            .output()
            .map_err(|e| format!("ffprobe failed: {e}"))?;

        let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
        let parts: Vec<&str> = stdout.split('x').collect();
        if parts.len() != 2 {
            return Err(format!("Unexpected ffprobe output: '{stdout}'"));
        }

        let w: u32 = parts[0]
            .trim()
            .parse()
            .map_err(|_| format!("Bad width: {}", parts[0]))?;
        let h: u32 = parts[1]
            .trim()
            .parse()
            .map_err(|_| format!("Bad height: {}", parts[1]))?;
        Ok((w, h))
    }

    /// Merge screen recording with camera recording using overlay.
    ///
    /// This is called after both recordings stop. Uses `ffprobe` to detect
    /// the actual screen capture resolution so overlay positioning is exact.
    ///
    /// Supports camera shape masking (circle, rounded rectangle) with optional
    /// border and shadow effects. An optional `sync_offset_sec` shifts the
    /// camera stream to compensate for start-time differences.
    pub fn merge_with_camera(
        screen_path: &str,
        camera_path: &str,
        output_path: &str,
        overlay: &CameraOverlayConfig,
        sync_offset_sec: f64,
    ) -> Result<(), String> {
        // Detect actual screen capture resolution (handles retina automatically)
        let (screen_w, screen_h) = Self::probe_resolution(screen_path)?;
        eprintln!(
            "[encoder] Screen capture resolution: {}x{}",
            screen_w, screen_h
        );

        // Calculate pixel positions from percentages (ensure even dimensions)
        let cam_w = ((overlay.width_percent / 100.0 * screen_w as f64) as i32 / 2 * 2).max(2);
        let cam_h = ((overlay.height_percent / 100.0 * screen_h as f64) as i32 / 2 * 2).max(2);
        let cam_x = (overlay.x_percent / 100.0 * screen_w as f64) as i32;
        let cam_y = (overlay.y_percent / 100.0 * screen_h as f64) as i32;

        let shape = overlay.shape.as_deref().unwrap_or("rectangle");
        let border_width = overlay.border_width.unwrap_or(0) as i32;
        let border_color = overlay
            .border_color
            .as_deref()
            .unwrap_or("#ffffff");
        let has_shadow = overlay.shadow.unwrap_or(false);

        // Camera input crop (percentage-based, applied before scaling)
        let crop_x_pct = overlay.crop_x.unwrap_or(0.0) / 100.0;
        let crop_y_pct = overlay.crop_y.unwrap_or(0.0) / 100.0;
        let crop_w_pct = overlay.crop_width.unwrap_or(100.0) / 100.0;
        let crop_h_pct = overlay.crop_height.unwrap_or(100.0) / 100.0;
        // Build input crop filter (no-op when using full frame: 0,0,100,100)
        let input_crop = if (crop_x_pct - 0.0).abs() < 0.001
            && (crop_y_pct - 0.0).abs() < 0.001
            && (crop_w_pct - 1.0).abs() < 0.001
            && (crop_h_pct - 1.0).abs() < 0.001
        {
            String::new()
        } else {
            format!(
                "crop=iw*{crop_w_pct:.4}:ih*{crop_h_pct:.4}:iw*{crop_x_pct:.4}:ih*{crop_y_pct:.4},"
            )
        };

        // Build filter chain based on shape
        let filter = match shape {
            "circle" => {
                // Circle mask using geq alpha filter
                let mut parts = Vec::new();

                // Crop input, then scale camera to fit bounding box
                parts.push(format!(
                    "[1:v]{input_crop}scale={cam_w}:{cam_h}:force_original_aspect_ratio=increase,crop={cam_w}:{cam_h},\
                     format=rgba,\
                     geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':\
                     a='if(lte(pow(X-W/2,2)+pow(Y-H/2,2),pow(min(W,H)/2,2)),255,0)'[cam]"
                ));

                // Optional border: slightly larger circle behind camera
                if border_width > 0 {
                    let border_w = cam_w + border_width * 2;
                    let border_h = cam_h + border_width * 2;
                    let bx = cam_x - border_width;
                    let by = cam_y - border_width;

                    // Parse hex color to RGB
                    let (r, g, b) = parse_hex_color(border_color);
                    parts.push(format!(
                        "color=c=0x{r:02x}{g:02x}{b:02x}:s={border_w}x{border_h},format=rgba,\
                         geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':\
                         a='if(lte(pow(X-W/2,2)+pow(Y-H/2,2),pow(min(W,H)/2,2)),255,0)'[border]"
                    ));

                    if has_shadow {
                        let shadow_w = cam_w + border_width * 2 + 8;
                        let shadow_h = cam_h + border_width * 2 + 8;
                        let sx = cam_x - border_width - 2;
                        let sy = cam_y - border_width + 2;
                        parts.push(format!(
                            "color=c=black:s={shadow_w}x{shadow_h},format=rgba,\
                             geq=lum='0':cb='128':cr='128':\
                             a='if(lte(pow(X-W/2,2)+pow(Y-H/2,2),pow(min(W,H)/2,2)),180,0)',\
                             gblur=sigma=4[shadow]"
                        ));
                        parts.push(format!("[0:v][shadow]overlay={sx}:{sy}[s1]"));
                        parts.push(format!("[s1][border]overlay={bx}:{by}[s2]"));
                        parts.push(format!("[s2][cam]overlay={cam_x}:{cam_y}[vout]"));
                    } else {
                        parts.push(format!("[0:v][border]overlay={bx}:{by}[s1]"));
                        parts.push(format!("[s1][cam]overlay={cam_x}:{cam_y}[vout]"));
                    }
                } else if has_shadow {
                    let shadow_w = cam_w + 8;
                    let shadow_h = cam_h + 8;
                    let sx = cam_x - 2;
                    let sy = cam_y + 2;
                    parts.push(format!(
                        "color=c=black:s={shadow_w}x{shadow_h},format=rgba,\
                         geq=lum='0':cb='128':cr='128':\
                         a='if(lte(pow(X-W/2,2)+pow(Y-H/2,2),pow(min(W,H)/2,2)),180,0)',\
                         gblur=sigma=4[shadow]"
                    ));
                    parts.push(format!("[0:v][shadow]overlay={sx}:{sy}[s1]"));
                    parts.push(format!("[s1][cam]overlay={cam_x}:{cam_y}[vout]"));
                } else {
                    parts.push(format!("[0:v][cam]overlay={cam_x}:{cam_y}[vout]"));
                }

                parts.join(";\n")
            }
            "rounded" => {
                // Rounded rectangle using distance-from-corner geq
                let border_radius = overlay.border_radius.unwrap_or(20.0).clamp(0.0, 50.0);
                let radius_px_w = (border_radius / 100.0 * cam_w as f64) as i32;
                let radius_px_h = (border_radius / 100.0 * cam_h as f64) as i32;
                let r = radius_px_w.min(radius_px_h).max(1);

                // Alpha expression for rounded rectangle
                let rounded_alpha = format!(
                    "if(gt(X,W-{r})*gt(Y,H-{r}),\
                     if(lte(pow(X-(W-{r}),2)+pow(Y-(H-{r}),2),pow({r},2)),255,0),\
                     if(lt(X,{r})*gt(Y,H-{r}),\
                     if(lte(pow(X-{r},2)+pow(Y-(H-{r}),2),pow({r},2)),255,0),\
                     if(gt(X,W-{r})*lt(Y,{r}),\
                     if(lte(pow(X-(W-{r}),2)+pow(Y-{r},2),pow({r},2)),255,0),\
                     if(lt(X,{r})*lt(Y,{r}),\
                     if(lte(pow(X-{r},2)+pow(Y-{r},2),pow({r},2)),255,0),\
                     255))))"
                );

                let mut parts = Vec::new();
                parts.push(format!(
                    "[1:v]{input_crop}scale={cam_w}:{cam_h}:force_original_aspect_ratio=increase,crop={cam_w}:{cam_h},\
                     format=rgba,\
                     geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='{rounded_alpha}'[cam]"
                ));

                if border_width > 0 {
                    let bw = cam_w + border_width * 2;
                    let bh = cam_h + border_width * 2;
                    let bx = cam_x - border_width;
                    let by = cam_y - border_width;
                    let br = r + border_width;
                    let (red, green, blue) = parse_hex_color(border_color);
                    let border_alpha = format!(
                        "if(gt(X,W-{br})*gt(Y,H-{br}),\
                         if(lte(pow(X-(W-{br}),2)+pow(Y-(H-{br}),2),pow({br},2)),255,0),\
                         if(lt(X,{br})*gt(Y,H-{br}),\
                         if(lte(pow(X-{br},2)+pow(Y-(H-{br}),2),pow({br},2)),255,0),\
                         if(gt(X,W-{br})*lt(Y,{br}),\
                         if(lte(pow(X-(W-{br}),2)+pow(Y-{br},2),pow({br},2)),255,0),\
                         if(lt(X,{br})*lt(Y,{br}),\
                         if(lte(pow(X-{br},2)+pow(Y-{br},2),pow({br},2)),255,0),\
                         255))))"
                    );
                    parts.push(format!(
                        "color=c=0x{red:02x}{green:02x}{blue:02x}:s={bw}x{bh},format=rgba,\
                         geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='{border_alpha}'[border]"
                    ));
                    parts.push(format!("[0:v][border]overlay={bx}:{by}[s1]"));
                    parts.push(format!("[s1][cam]overlay={cam_x}:{cam_y}[vout]"));
                } else {
                    parts.push(format!("[0:v][cam]overlay={cam_x}:{cam_y}[vout]"));
                }

                parts.join(";\n")
            }
            _ => {
                // Rectangle (default) — simple scale + overlay, with optional border
                if border_width > 0 {
                    let bw = cam_w + border_width * 2;
                    let bh = cam_h + border_width * 2;
                    let bx = cam_x - border_width;
                    let by = cam_y - border_width;
                    let (r, g, b) = parse_hex_color(border_color);
                    format!(
                        "[1:v]{input_crop}scale={cam_w}:{cam_h}:force_original_aspect_ratio=increase,crop={cam_w}:{cam_h}[cam];\
                         color=c=0x{r:02x}{g:02x}{b:02x}:s={bw}x{bh}[border];\
                         [0:v][border]overlay={bx}:{by}[s1];\
                         [s1][cam]overlay={cam_x}:{cam_y}[vout]"
                    )
                } else {
                    format!(
                        "[1:v]{input_crop}scale={cam_w}:{cam_h}:force_original_aspect_ratio=increase,crop={cam_w}:{cam_h}[cam];\
                         [0:v][cam]overlay={cam_x}:{cam_y}[vout]"
                    )
                }
            }
        };

        let mut args: Vec<String> = vec![
            "-y".to_string(),
            "-i".to_string(),
            screen_path.to_string(),
        ];

        // Apply sync offset to camera input if non-zero
        if sync_offset_sec.abs() > 0.001 {
            args.extend([
                "-itsoffset".to_string(),
                format!("{sync_offset_sec:.3}"),
            ]);
        }

        args.extend([
            "-i".to_string(),
            camera_path.to_string(),
            "-filter_complex".to_string(),
            filter.clone(),
            "-map".to_string(),
            "[vout]".to_string(),
            "-map".to_string(),
            "0:a?".to_string(),
            "-c:v".to_string(),
            "h264_videotoolbox".to_string(),
            "-b:v".to_string(),
            "12M".to_string(),
            "-c:a".to_string(),
            "copy".to_string(),
            "-shortest".to_string(),
            output_path.to_string(),
        ]);

        eprintln!("[encoder] Merge filter: {filter}");
        eprintln!("[encoder] Merge args: {:?}", args);

        let output = Command::new("ffmpeg")
            .args(&args)
            .output()
            .map_err(|e| format!("FFmpeg merge failed to run: {e}"))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            let tail = if stderr.len() > 500 {
                &stderr[stderr.len() - 500..]
            } else {
                &stderr
            };
            return Err(format!("FFmpeg merge failed: {tail}"));
        }

        eprintln!("[encoder] Merge completed successfully");
        Ok(())
    }
}
