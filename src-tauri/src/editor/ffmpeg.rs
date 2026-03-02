use crate::models::{CameraOverlayData, ClipData, EffectData, MediaInfo, ProjectData};
use std::process::{Command, Stdio};

// ---------------------------------------------------------------------------
// FFmpeg availability
// ---------------------------------------------------------------------------

/// Returns `true` if `ffmpeg` and `ffprobe` are on PATH.
pub fn check_ffmpeg_installed() -> bool {
    Command::new("ffmpeg")
        .arg("-version")
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
        && Command::new("ffprobe")
            .arg("-version")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
}

// ---------------------------------------------------------------------------
// ffprobe
// ---------------------------------------------------------------------------

/// Probe a media file and return structured info.
pub fn run_ffprobe(path: &str) -> Result<MediaInfo, String> {
    let output = Command::new("ffprobe")
        .args([
            "-v",
            "quiet",
            "-print_format",
            "json",
            "-show_format",
            "-show_streams",
            path,
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("ffprobe spawn: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffprobe failed: {stderr}"));
    }

    let json: serde_json::Value =
        serde_json::from_slice(&output.stdout).map_err(|e| format!("ffprobe json: {e}"))?;

    let duration_ms = json["format"]["duration"]
        .as_str()
        .and_then(|s| s.parse::<f64>().ok())
        .map(|d| (d * 1000.0) as u64)
        .unwrap_or(0);

    let streams = json["streams"].as_array();

    let mut width = 0u32;
    let mut height = 0u32;
    let mut codec = String::new();
    let mut has_video = false;
    let mut has_audio = false;

    if let Some(streams) = streams {
        for stream in streams {
            let codec_type = stream["codec_type"].as_str().unwrap_or("");
            match codec_type {
                "video" => {
                    has_video = true;
                    width = stream["width"].as_u64().unwrap_or(0) as u32;
                    height = stream["height"].as_u64().unwrap_or(0) as u32;
                    codec = stream["codec_name"]
                        .as_str()
                        .unwrap_or("unknown")
                        .to_string();
                }
                "audio" => {
                    has_audio = true;
                }
                _ => {}
            }
        }
    }

    Ok(MediaInfo {
        path: path.to_string(),
        duration_ms,
        width,
        height,
        codec,
        has_audio,
        has_video,
    })
}

// ---------------------------------------------------------------------------
// Generic FFmpeg runner
// ---------------------------------------------------------------------------

/// Run an arbitrary FFmpeg command and return combined output.
pub fn run_ffmpeg(args: &[&str]) -> Result<String, String> {
    let output = Command::new("ffmpeg")
        .args(args)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("ffmpeg spawn: {e}"))?;

    let stderr = String::from_utf8_lossy(&output.stderr).to_string();

    if !output.status.success() {
        return Err(format!("ffmpeg failed: {stderr}"));
    }

    Ok(stderr) // FFmpeg writes progress / info to stderr
}

// ---------------------------------------------------------------------------
// Export filter_complex builder
// ---------------------------------------------------------------------------

/// Build a `filter_complex` string that trims, concatenates, and overlays
/// every clip in the project.
///
/// Each asset file is an FFmpeg input (`-i`).  The returned struct includes
/// the ordered input paths and the filter graph string.
pub struct ExportGraph {
    pub input_paths: Vec<String>,
    pub filter_complex: String,
    pub has_audio: bool,
}

/// Generate an FFmpeg expression for an easing curve applied to `t_expr`.
///
/// `t_expr` should be a normalized 0-1 progress value.
fn ffmpeg_easing_expr(t_expr: &str, easing: &str) -> String {
    match easing {
        "ease-in" => format!("pow({t_expr},3)"),
        "ease-out" => format!("(1-pow(1-({t_expr}),3))"),
        "linear" => t_expr.to_string(),
        // Default: ease-in-out (Hermite smoothstep: 3t²-2t³)
        _ => format!("(3*pow({t_expr},2)-2*pow({t_expr},3))"),
    }
}

/// Build a zoompan filter chain that applies zoom effects within a clip
/// with smooth easing transitions.
///
/// Uses FFmpeg's `zoompan` filter instead of `crop` because `crop` evaluates
/// `w` and `h` only at init time — the `t` variable does NOT work for
/// dynamic width/height in crop. The `zoompan` filter evaluates `z`, `x`,
/// `y` expressions per-frame via the `in_time` variable.
///
/// Each zoom effect has three phases:
/// - **Ramp-in**: smooth transition from scale=1 to target scale
/// - **Hold**: maintain target scale
/// - **Ramp-out**: smooth transition back to scale=1
///
/// Zoom effects use params: `scale` (zoom factor), `x` (0-100), `y` (0-100).
/// Optional params: `rampIn`, `rampOut` (seconds), `easing` (string).
fn build_zoom_crop_chain(
    effects: &[&EffectData],
    out_w: u32,
    out_h: u32,
    fps: f64,
) -> String {
    if effects.is_empty() {
        return format!("scale={out_w}:{out_h}");
    }

    let fps_int = (fps.round() as u32).max(1);

    let param_f64 = |params: &std::collections::HashMap<String, serde_json::Value>,
                      key: &str,
                      default: f64| {
        params
            .get(key)
            .and_then(|v| v.as_f64())
            .unwrap_or(default)
    };

    let param_str = |params: &std::collections::HashMap<String, serde_json::Value>,
                      key: &str,
                      default: &str| -> String {
        params
            .get(key)
            .and_then(|v| v.as_str())
            .unwrap_or(default)
            .to_string()
    };

    // Build from inside out: start with "no zoom" defaults, wrap with conditions.
    // NOTE: zoompan uses `in_time` instead of `t` for time-based expressions.
    let mut scale_expr = "1".to_string();

    for effect in effects.iter().rev() {
        let s = param_f64(&effect.params, "scale", 2.0);
        let ramp_in = param_f64(&effect.params, "rampIn", 0.3);
        let ramp_out = param_f64(&effect.params, "rampOut", 0.3);
        let easing = param_str(&effect.params, "easing", "ease-in-out");

        let zs = effect.start_time as f64 / 1000.0;
        let total_dur = effect.duration as f64 / 1000.0;
        let ze = zs + total_dur;

        // Clamp ramp durations to not exceed total duration
        let ramp_in_clamped = ramp_in.min(total_dur / 2.0);
        let ramp_out_clamped = ramp_out.min(total_dur / 2.0);

        let ramp_in_end = zs + ramp_in_clamped;
        let ramp_out_start = ze - ramp_out_clamped;

        // Build three-phase scale factor expression:
        // if in ramp-in: 1 + (target-1) * easing(progress)
        // if in hold: target
        // if in ramp-out: 1 + (target-1) * (1 - easing(progress))
        // else: previous scale expression (no zoom)

        let scale_delta = s - 1.0;

        // Ramp-in progress: (in_time - zs) / ramp_in_duration
        let ramp_in_progress = format!("(in_time-{zs:.4})/{ramp_in_clamped:.4}");
        let ramp_in_eased = ffmpeg_easing_expr(&ramp_in_progress, &easing);
        let ramp_in_scale = format!("(1+{scale_delta:.4}*{ramp_in_eased})");

        // Ramp-out progress: (in_time - ramp_out_start) / ramp_out_duration
        let ramp_out_progress = format!("(in_time-{ramp_out_start:.4})/{ramp_out_clamped:.4}");
        let ramp_out_eased = ffmpeg_easing_expr(&ramp_out_progress, &easing);
        let ramp_out_scale = format!("(1+{scale_delta:.4}*(1-{ramp_out_eased}))");

        // Nested conditional: ramp-in → hold → ramp-out → previous
        scale_expr = format!(
            "if(between(in_time,{zs:.4},{ramp_in_end:.4}),{ramp_in_scale},\
             if(between(in_time,{ramp_in_end:.4},{ramp_out_start:.4}),{s:.4},\
             if(between(in_time,{ramp_out_start:.4},{ze:.4}),{ramp_out_scale},\
             {scale_expr})))"
        );
    }

    // Focus point expressions (cx, cy in 0-1 range).
    // If an effect has `positions` (keyframed mouse path), generate piecewise
    // smoothstep interpolation expressions instead of a static value.
    let mut cx_expr = "0.5".to_string();
    let mut cy_expr = "0.5".to_string();

    for effect in effects.iter().rev() {
        let cx = param_f64(&effect.params, "x", 50.0) / 100.0;
        let cy = param_f64(&effect.params, "y", 50.0) / 100.0;
        let zs = effect.start_time as f64 / 1000.0;
        let ze = zs + (effect.duration as f64 / 1000.0);

        // Check if this effect has keyframed positions for mouse-following zoom
        let positions: Vec<(f64, f64, f64)> = effect
            .params
            .get("positions")
            .and_then(|v| v.as_array())
            .map(|arr| {
                // Positions are already EMA-smoothed by the recorder.
                // Keep at ~5 Hz (200 ms) — smoothstep interpolation fills gaps.
                let mut result = Vec::new();
                let mut last_t: Option<f64> = None;
                for item in arr {
                    let t = item.get("t").and_then(|v| v.as_f64()).unwrap_or(0.0);
                    let px = item.get("x").and_then(|v| v.as_f64()).unwrap_or(50.0) / 100.0;
                    let py = item.get("y").and_then(|v| v.as_f64()).unwrap_or(50.0) / 100.0;
                    if let Some(prev) = last_t {
                        if t - prev < 0.2 && !result.is_empty() {
                            continue;
                        }
                    }
                    result.push((t, px, py));
                    last_t = Some(t);
                }
                result
            })
            .unwrap_or_default();

        if positions.len() >= 2 {
            // Build piecewise smoothstep interpolation for cx and cy.
            // Uses Hermite smoothstep (3p²-2p³) instead of linear lerp
            // for smooth acceleration/deceleration at each keyframe.
            let mut local_cx = format!("{:.4}", positions.last().unwrap().1);
            let mut local_cy = format!("{:.4}", positions.last().unwrap().2);

            for i in (0..positions.len() - 1).rev() {
                let (t_a, x_a, y_a) = positions[i];
                let (t_b, x_b, y_b) = positions[i + 1];
                let abs_a = zs + t_a;
                let abs_b = zs + t_b;
                let dt = t_b - t_a;
                if dt < 0.001 {
                    continue;
                }
                // p = normalized progress [0,1] within this segment
                let p_expr = format!("(in_time-{abs_a:.4})/{dt:.4}");
                // smoothstep: 3p²-2p³
                let smooth = format!(
                    "(3*pow({p},2)-2*pow({p},3))",
                    p = p_expr,
                );
                // smoothed lerp: a + (b - a) * smoothstep(p)
                let cx_lerp = format!(
                    "({x_a:.4}+{dx:.4}*{smooth})",
                    dx = x_b - x_a,
                );
                let cy_lerp = format!(
                    "({y_a:.4}+{dy:.4}*{smooth})",
                    dy = y_b - y_a,
                );
                local_cx = format!(
                    "if(between(in_time,{abs_a:.4},{abs_b:.4}),{cx_lerp},{local_cx})"
                );
                local_cy = format!(
                    "if(between(in_time,{abs_a:.4},{abs_b:.4}),{cy_lerp},{local_cy})"
                );
            }

            cx_expr = format!("if(between(in_time,{zs:.4},{ze:.4}),{local_cx},{cx_expr})");
            cy_expr = format!("if(between(in_time,{zs:.4},{ze:.4}),{local_cy},{cy_expr})");
        } else {
            cx_expr = format!("if(between(in_time,{zs:.4},{ze:.4}),{cx:.4},{cx_expr})");
            cy_expr = format!("if(between(in_time,{zs:.4},{ze:.4}),{cy:.4},{cy_expr})");
        }
    }

    // Use zoompan instead of crop+scale.
    // zoompan evaluates z, x, y per-frame (unlike crop which evaluates w/h once).
    // - z: zoom factor (1 = no zoom, 2 = 2x zoom)
    // - x: top-left x of visible area = (iw - iw/zoom) * cx
    // - y: top-left y of visible area = (ih - ih/zoom) * cy
    //   (`zoom` refers to the z value just computed for this frame)
    // - d=1: each input frame → 1 output frame (real-time, not Ken Burns)
    // - s: output resolution
    // - fps: match input video fps to avoid frame drops or duplication
    let x_expr = format!("(iw-iw/zoom)*({cx_expr})");
    let y_expr = format!("(ih-ih/zoom)*({cy_expr})");

    format!(
        "zoompan=z='{scale_expr}':x='{x_expr}':y='{y_expr}':d=1:s={out_w}x{out_h}:fps={fps_int}"
    )
}

/// Build a camera overlay filter chain for the export pipeline.
///
/// Applies crop, scale, and shape masking (circle / rounded / rectangle)
/// to the camera input. Returns the filter string for a pre-shaped camera
/// stream that can then be trimmed per-segment.
fn build_camera_shape_filter(
    cam_input_idx: usize,
    cam: &CameraOverlayData,
    proj_w: u32,
    proj_h: u32,
    out_label: &str,
) -> String {
    let cam_w = ((cam.width / 100.0 * proj_w as f64) as i32 / 2 * 2).max(2);
    let cam_h = ((cam.height / 100.0 * proj_h as f64) as i32 / 2 * 2).max(2);

    // Camera input crop (percentage-based, applied before scaling)
    let crop_x_pct = cam.crop_x.unwrap_or(0.0) / 100.0;
    let crop_y_pct = cam.crop_y.unwrap_or(0.0) / 100.0;
    let crop_w_pct = cam.crop_width.unwrap_or(100.0) / 100.0;
    let crop_h_pct = cam.crop_height.unwrap_or(100.0) / 100.0;

    let input_crop = if (crop_x_pct).abs() < 0.001
        && (crop_y_pct).abs() < 0.001
        && (crop_w_pct - 1.0).abs() < 0.001
        && (crop_h_pct - 1.0).abs() < 0.001
    {
        String::new()
    } else {
        format!(
            "crop=iw*{crop_w_pct:.4}:ih*{crop_h_pct:.4}:iw*{crop_x_pct:.4}:ih*{crop_y_pct:.4},"
        )
    };

    let shape = cam.shape.as_deref().unwrap_or("rectangle");

    match shape {
        "circle" => {
            format!(
                "[{cam_input_idx}:v]{input_crop}scale={cam_w}:{cam_h}:force_original_aspect_ratio=increase,crop={cam_w}:{cam_h},\
                 format=rgba,\
                 geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':\
                 a='if(lte(pow(X-W/2,2)+pow(Y-H/2,2),pow(min(W,H)/2,2)),255,0)'[{out_label}]"
            )
        }
        "rounded" => {
            let border_radius = cam.border_radius.unwrap_or(20.0).clamp(0.0, 50.0);
            let radius_px_w = (border_radius / 100.0 * cam_w as f64) as i32;
            let radius_px_h = (border_radius / 100.0 * cam_h as f64) as i32;
            let r = radius_px_w.min(radius_px_h).max(1);
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
            format!(
                "[{cam_input_idx}:v]{input_crop}scale={cam_w}:{cam_h}:force_original_aspect_ratio=increase,crop={cam_w}:{cam_h},\
                 format=rgba,\
                 geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='{rounded_alpha}'[{out_label}]"
            )
        }
        _ => {
            // Rectangle: simple crop + scale
            format!(
                "[{cam_input_idx}:v]{input_crop}scale={cam_w}:{cam_h}:force_original_aspect_ratio=increase,crop={cam_w}:{cam_h}[{out_label}]"
            )
        }
    }
}

pub fn build_export_filter_complex(project: &ProjectData) -> ExportGraph {
    let mut input_paths: Vec<String> = Vec::new();
    let mut asset_to_input: std::collections::HashMap<String, usize> = Default::default();
    let mut filter_parts: Vec<String> = Vec::new();
    let mut concat_video_labels: Vec<String> = Vec::new();
    let mut concat_audio_labels: Vec<String> = Vec::new();
    let mut label_counter: usize = 0;

    let (proj_w, proj_h) = project.resolution;

    // Collect zoom clips from zoom tracks (absolute timeline positions)
    let mut zoom_track_clips: Vec<&ClipData> = Vec::new();
    for track in &project.tracks {
        if track.muted || track.locked {
            continue;
        }
        if track.track_type == "zoom" {
            for clip in &track.clips {
                if clip.asset_id == "__zoom__" {
                    zoom_track_clips.push(clip);
                }
            }
        }
    }

    eprintln!(
        "[export] Found {} zoom track clips across {} zoom tracks",
        zoom_track_clips.len(),
        project.tracks.iter().filter(|t| t.track_type == "zoom").count(),
    );
    for (i, zc) in zoom_track_clips.iter().enumerate() {
        let zc_dur = zc.source_end - zc.source_start;
        eprintln!(
            "[export]   zoom clip {i}: trackPos={}ms, dur={}ms, effects={}, asset_id='{}'",
            zc.track_position, zc_dur, zc.effects.len(), zc.asset_id,
        );
    }

    // If camera overlay exists, add camera file as an additional FFmpeg input
    let cam_overlay = project.camera_overlay.as_ref();
    let cam_input_idx = if let Some(cam) = cam_overlay {
        let idx = input_paths.len();
        input_paths.push(cam.path.clone());
        Some(idx)
    } else {
        None
    };

    // Collect clips from VIDEO tracks only.
    let mut all_clips: Vec<&ClipData> = Vec::new();
    for track in &project.tracks {
        if track.muted || track.locked {
            continue;
        }
        if track.track_type != "video" {
            continue;
        }
        for clip in &track.clips {
            all_clips.push(clip);
        }
    }
    all_clips.sort_by_key(|c| c.track_position);

    // Pre-process camera: apply shape + crop + scale once, then split for each segment
    let num_clips = all_clips.len();
    if let (Some(cam_idx), Some(cam)) = (cam_input_idx, cam_overlay) {
        if num_clips > 0 {
            // Shape the camera input once
            let shaped_label = "cam_shaped";
            let shape_filter = build_camera_shape_filter(cam_idx, cam, proj_w, proj_h, shaped_label);
            filter_parts.push(shape_filter);

            // Split into N copies, one for each video segment
            if num_clips > 1 {
                let split_outputs: String = (0..num_clips)
                    .map(|i| format!("[cam_s{i}]"))
                    .collect();
                filter_parts.push(format!(
                    "[{shaped_label}]split={num_clips}{split_outputs}"
                ));
            }
        }
    }

    // Camera overlay pixel position (same for all segments)
    let cam_x = cam_overlay
        .map(|c| (c.x / 100.0 * proj_w as f64) as i32)
        .unwrap_or(0);
    let cam_y = cam_overlay
        .map(|c| (c.y / 100.0 * proj_h as f64) as i32)
        .unwrap_or(0);
    let cam_sync_offset = cam_overlay.map(|c| c.sync_offset).unwrap_or(0.0);

    for (clip_idx, clip) in all_clips.iter().enumerate() {
        // Register asset as FFmpeg input (deduplicate)
        let input_idx = *asset_to_input.entry(clip.asset_id.clone()).or_insert_with(|| {
            let idx = input_paths.len();
            input_paths.push(clip.asset_id.clone());
            idx
        });

        let start_sec = clip.source_start as f64 / 1000.0;
        let end_sec = clip.source_end as f64 / 1000.0;
        let clip_dur_ms = clip.source_end - clip.source_start;

        label_counter += 1;

        // Collect zoom effects: embedded clip effects + zoom track clips that overlap this clip
        let mut zoom_effects: Vec<&EffectData> = clip
            .effects
            .iter()
            .filter(|e| e.effect_type == "zoom")
            .collect();

        let clip_start_ms = clip.track_position;
        let clip_end_ms = clip.track_position + clip_dur_ms;
        let mut zoom_track_effects_owned: Vec<EffectData> = Vec::new();
        for zc in &zoom_track_clips {
            let zc_dur = zc.source_end - zc.source_start;
            let zc_end = zc.track_position + zc_dur;
            if zc.track_position < clip_end_ms && zc_end > clip_start_ms {
                for ze in &zc.effects {
                    if ze.effect_type != "zoom" { continue; }
                    let abs_start = zc.track_position + ze.start_time;
                    let abs_end = abs_start + ze.duration;
                    let rel_start = (abs_start as i64 - clip_start_ms as i64).max(0) as u64;
                    let rel_end = ((abs_end as i64 - clip_start_ms as i64) as u64).min(clip_dur_ms);
                    if rel_end > rel_start {
                        zoom_track_effects_owned.push(EffectData {
                            effect_type: "zoom".to_string(),
                            start_time: rel_start,
                            duration: rel_end - rel_start,
                            params: ze.params.clone(),
                        });
                    }
                }
            }
        }
        let zoom_track_refs: Vec<&EffectData> = zoom_track_effects_owned.iter().collect();
        zoom_effects.extend(zoom_track_refs);

        if !zoom_effects.is_empty() {
            eprintln!(
                "[export] Clip {label_counter} (trackPos={}ms, src={}..{}ms): applying {} zoom effect(s)",
                clip.track_position, clip.source_start, clip.source_end, zoom_effects.len(),
            );
            for ze in &zoom_effects {
                let scale = ze.params.get("scale").and_then(|v| v.as_f64()).unwrap_or(0.0);
                eprintln!(
                    "[export]   zoom: start={}ms, dur={}ms, scale={:.2}",
                    ze.start_time, ze.duration, scale,
                );
            }
        }

        let fps = if project.frame_rate > 0.0 { project.frame_rate } else { 30.0 };
        let zoom_filter = build_zoom_crop_chain(&zoom_effects, proj_w, proj_h, fps);

        let al = format!("a{label_counter}");

        if cam_input_idx.is_some() && cam_overlay.is_some() {
            // Camera overlay mode: zoom screen only, overlay camera on top
            let sv_label = format!("sv{label_counter}");
            let cv_label = format!("cv{label_counter}");
            let vl = format!("v{label_counter}");

            // Trim screen video + apply zoom
            filter_parts.push(format!(
                "[{input_idx}:v]trim=start={start_sec:.3}:end={end_sec:.3},setpts=PTS-STARTPTS,{zoom_filter}[{sv_label}]"
            ));

            // Trim camera segment from the pre-shaped split
            let cam_source = if num_clips > 1 {
                format!("[cam_s{clip_idx}]")
            } else {
                "[cam_shaped]".to_string()
            };
            let cam_start = (start_sec + cam_sync_offset).max(0.0);
            let cam_end = end_sec + cam_sync_offset;
            filter_parts.push(format!(
                "{cam_source}trim=start={cam_start:.3}:end={cam_end:.3},setpts=PTS-STARTPTS[{cv_label}]"
            ));

            // Overlay camera on zoomed screen
            filter_parts.push(format!(
                "[{sv_label}][{cv_label}]overlay={cam_x}:{cam_y}:shortest=1[{vl}]"
            ));

            concat_video_labels.push(format!("[{vl}]"));
        } else {
            // No camera overlay — standard pipeline
            let vl = format!("v{label_counter}");
            filter_parts.push(format!(
                "[{input_idx}:v]trim=start={start_sec:.3}:end={end_sec:.3},setpts=PTS-STARTPTS,{zoom_filter}[{vl}]"
            ));
            concat_video_labels.push(format!("[{vl}]"));
        }

        // Trim audio + clean (same regardless of camera overlay)
        // Audio filter chain:
        // - highpass=f=80 → remove low-frequency rumble
        // - lowpass=f=14000 → remove high-frequency hiss
        // - afftdn=nf=-20 → FFT-based noise reduction
        // This cleans audio for all exports, including recordings made before
        // the recording-side audio filter was added.
        filter_parts.push(format!(
            "[{input_idx}:a]atrim=start={start_sec:.3}:end={end_sec:.3},asetpts=PTS-STARTPTS,\
             highpass=f=80,lowpass=f=14000,afftdn=nf=-20,volume={vol}[{al}]",
            vol = clip.volume,
        ));
        concat_audio_labels.push(format!("[{al}]"));
    }

    let n = concat_video_labels.len();
    let has_audio = !concat_audio_labels.is_empty();

    if n > 0 {
        let concat_inputs: String = concat_video_labels
            .iter()
            .zip(concat_audio_labels.iter())
            .map(|(v, a)| format!("{v}{a}"))
            .collect();

        filter_parts.push(format!(
            "{concat_inputs}concat=n={n}:v=1:a=1[outv][outa]"
        ));
    }

    ExportGraph {
        input_paths,
        filter_complex: filter_parts.join(";\n"),
        has_audio,
    }
}

// ---------------------------------------------------------------------------
// FFmpeg progress parser
// ---------------------------------------------------------------------------

/// Parse an FFmpeg stderr progress line and return the current time in seconds.
/// FFmpeg writes lines like: `out_time_us=12345678`
pub fn parse_ffmpeg_progress(line: &str) -> Option<f64> {
    // Standard progress output: `out_time_us=<microseconds>`
    if let Some(rest) = line.strip_prefix("out_time_us=") {
        if let Ok(us) = rest.trim().parse::<i64>() {
            return Some(us as f64 / 1_000_000.0);
        }
    }
    // Fallback: parse `time=HH:MM:SS.ms` from stderr
    if let Some(idx) = line.find("time=") {
        let time_str = &line[idx + 5..];
        let end = time_str.find(' ').unwrap_or(time_str.len());
        let t = &time_str[..end];
        return parse_time_string(t);
    }
    None
}

fn parse_time_string(t: &str) -> Option<f64> {
    let parts: Vec<&str> = t.split(':').collect();
    if parts.len() == 3 {
        let h = parts[0].parse::<f64>().ok()?;
        let m = parts[1].parse::<f64>().ok()?;
        let s = parts[2].parse::<f64>().ok()?;
        Some(h * 3600.0 + m * 60.0 + s)
    } else {
        None
    }
}

// ---------------------------------------------------------------------------
// Thumbnail extraction
// ---------------------------------------------------------------------------

/// Extract `count` evenly-spaced thumbnails from a video file.
pub fn extract_thumbnails(
    video_path: &str,
    count: u32,
    output_dir: &str,
) -> Result<Vec<String>, String> {
    std::fs::create_dir_all(output_dir).map_err(|e| format!("mkdir: {e}"))?;

    let info = run_ffprobe(video_path)?;
    if info.duration_ms == 0 {
        return Err("Video has zero duration".to_string());
    }

    let interval_sec = (info.duration_ms as f64 / 1000.0) / count as f64;
    let mut paths = Vec::new();

    for i in 0..count {
        let ts = interval_sec * i as f64;
        let out_path = format!("{output_dir}/thumb_{i:04}.jpg");

        let status = Command::new("ffmpeg")
            .args([
                "-y",
                "-ss",
                &format!("{ts:.3}"),
                "-i",
                video_path,
                "-frames:v",
                "1",
                "-q:v",
                "2",
                &out_path,
            ])
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .status()
            .map_err(|e| format!("ffmpeg thumbnail: {e}"))?;

        if status.success() {
            paths.push(out_path);
        }
    }

    Ok(paths)
}

// ---------------------------------------------------------------------------
// Audio extraction
// ---------------------------------------------------------------------------

/// Extract audio as a lightweight WAV for silence detection (PCM s16le, 16 kHz, mono).
///
/// This is ~5× smaller than stereo 44.1 kHz and perfectly sufficient for
/// energy-based silence detection. A 17-minute file produces ~32 MB.
pub fn extract_audio_to_wav_light(video_path: &str, output_path: &str) -> Result<(), String> {
    let status = Command::new("ffmpeg")
        .args([
            "-y",
            "-i",
            video_path,
            "-vn",
            "-acodec",
            "pcm_s16le",
            "-ar",
            "16000",
            "-ac",
            "1",
            output_path,
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|e| format!("ffmpeg extract audio: {e}"))?;
    if !status.success() {
        return Err("ffmpeg audio extraction failed".to_string());
    }
    Ok(())
}

/// Extract audio from a video file as WAV (PCM s16le, 44100 Hz, stereo).
pub fn extract_audio_to_wav(video_path: &str, output_path: &str) -> Result<(), String> {
    let status = Command::new("ffmpeg")
        .args([
            "-y",
            "-i",
            video_path,
            "-vn",
            "-acodec",
            "pcm_s16le",
            "-ar",
            "44100",
            "-ac",
            "2",
            output_path,
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map_err(|e| format!("ffmpeg extract audio: {e}"))?;

    if !status.success() {
        return Err("ffmpeg extract audio failed".to_string());
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// Video assembly (silence removal)
// ---------------------------------------------------------------------------

/// Assemble a new video by trimming and concatenating non-silent segments.
///
/// Mirrors the Python `assemble_video` function: builds a single FFmpeg
/// `filter_complex` that trims video+audio for each segment, then concatenates.
pub fn assemble_video_from_segments(
    input_path: &str,
    output_path: &str,
    segments: &[crate::models::Segment],
) -> Result<(), String> {
    use std::io::Read;

    if segments.is_empty() {
        return Err("No segments to assemble".into());
    }

    let mut filter_parts: Vec<String> = Vec::new();
    let mut concat_inputs: Vec<String> = Vec::new();

    for (i, seg) in segments.iter().enumerate() {
        let start = seg.start_seconds();
        let end = seg.end_seconds();
        let vl = format!("v{i}");
        let al = format!("a{i}");

        filter_parts.push(format!(
            "[0:v]trim=start={start:.3}:end={end:.3},setpts=PTS-STARTPTS[{vl}]"
        ));
        filter_parts.push(format!(
            "[0:a]atrim=start={start:.3}:end={end:.3},asetpts=PTS-STARTPTS[{al}]"
        ));
        concat_inputs.push(format!("[{vl}][{al}]"));
    }

    let n = segments.len();
    let concat_filter =
        format!("{}concat=n={n}:v=1:a=1[outv][outa]", concat_inputs.join(""));
    filter_parts.push(concat_filter);

    let filter_complex = filter_parts.join(";\n");

    let mut child = Command::new("ffmpeg")
        .args([
            "-y",
            "-i",
            input_path,
            "-filter_complex",
            &filter_complex,
            "-map",
            "[outv]",
            "-map",
            "[outa]",
            output_path,
        ])
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("ffmpeg assemble spawn: {e}"))?;

    let status = child.wait().map_err(|e| format!("ffmpeg wait: {e}"))?;

    if !status.success() {
        let mut stderr_buf = String::new();
        if let Some(mut stderr) = child.stderr.take() {
            stderr.read_to_string(&mut stderr_buf).ok();
        }
        return Err(format!("FFmpeg assemble failed: {stderr_buf}"));
    }

    Ok(())
}
