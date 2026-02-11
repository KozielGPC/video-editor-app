use crate::models::{EffectData, OverlayData};

// ---------------------------------------------------------------------------
// Easing functions
// ---------------------------------------------------------------------------

/// Smooth ease-in-out (cubic) for zoom transitions.
pub fn ease_in_out(t: f64) -> f64 {
    if t < 0.5 {
        4.0 * t * t * t
    } else {
        1.0 - (-2.0 * t + 2.0).powi(3) / 2.0
    }
}

/// Linear interpolation.
fn lerp(a: f64, b: f64, t: f64) -> f64 {
    a + (b - a) * t
}

// ---------------------------------------------------------------------------
// Zoom effect → FFmpeg crop+scale filter
// ---------------------------------------------------------------------------

/// Build an FFmpeg filter expression that smoothly zooms into a region.
///
/// Expected params in `effect.params`:
///   - `zoom_start` (f64, e.g. 1.0)
///   - `zoom_end`   (f64, e.g. 2.0)
///   - `center_x`   (f64, 0.0–1.0 normalised)
///   - `center_y`   (f64, 0.0–1.0 normalised)
pub fn build_zoom_filter(
    effect: &EffectData,
    video_width: u32,
    video_height: u32,
) -> String {
    let zoom_start = param_f64(&effect.params, "zoom_start", 1.0);
    let zoom_end = param_f64(&effect.params, "zoom_end", 2.0);
    let cx = param_f64(&effect.params, "center_x", 0.5);
    let cy = param_f64(&effect.params, "center_y", 0.5);
    let start_sec = effect.start_time as f64 / 1000.0;
    let dur_sec = effect.duration as f64 / 1000.0;

    // Generate key-frame based zoompan filter.
    // zoompan: z (zoom level), x/y (pan), d (duration in frames), s (output size)
    //
    // We approximate with the zoompan filter using an expression that
    // interpolates between zoom_start and zoom_end over the duration.
    //
    // FFmpeg zoompan expression variables:
    //   in_w, in_h  – input size
    //   on          – current output frame number
    //   d           – total frames (set externally)

    let fps = 30;
    let total_frames = (dur_sec * fps as f64).ceil() as u32;
    let w = video_width;
    let h = video_height;

    // Expression for zoom level that eases between zoom_start and zoom_end
    // We use a cubic ease: t = on/d; zoom = zoom_start + (zoom_end-zoom_start)*t*t*(3-2*t)
    let zoom_expr = format!(
        "if(between(on\\,0\\,{total_frames})\\,\
         {zoom_start}+({zoom_end}-{zoom_start})*(on/{total_frames})*(on/{total_frames})*(3-2*(on/{total_frames}))\\,\
         {zoom_end})"
    );

    // Pan expressions keep the center at (cx, cy) of the source
    let x_expr = format!(
        "(iw-iw/zoom)*{cx}"
    );
    let y_expr = format!(
        "(ih-ih/zoom)*{cy}"
    );

    format!(
        "zoompan=z='{zoom_expr}':x='{x_expr}':y='{y_expr}':d={total_frames}:s={w}x{h}:fps={fps}\
         :enable='between(t,{start_sec:.3},{end:.3})'",
        end = start_sec + dur_sec,
    )
}

// ---------------------------------------------------------------------------
// Text overlay → FFmpeg drawtext filter
// ---------------------------------------------------------------------------

/// Build a drawtext filter from an `OverlayData`.
pub fn build_text_overlay_filter(overlay: &OverlayData) -> String {
    let x = overlay.x as u32;
    let y = overlay.y as u32;
    let start_sec = overlay.start_time as f64 / 1000.0;
    let end_sec = start_sec + (overlay.duration as f64 / 1000.0);
    let fontsize = overlay.height.max(12.0) as u32;

    // Escape special characters for FFmpeg drawtext
    let text = overlay
        .content
        .replace('\\', "\\\\\\\\")
        .replace('\'', "'\\\\\\''")
        .replace(':', "\\\\:");

    format!(
        "drawtext=text='{text}':fontsize={fontsize}:fontcolor=white:\
         x={x}:y={y}:enable='between(t,{start_sec:.3},{end_sec:.3})'"
    )
}

// ---------------------------------------------------------------------------
// Image overlay → FFmpeg overlay filter
// ---------------------------------------------------------------------------

/// Build an overlay filter that composites an image on top of the video.
///
/// The caller must ensure the image is added as a separate FFmpeg input.
/// `input_idx` is the FFmpeg input index for the image file.
pub fn build_image_overlay_filter(overlay: &OverlayData, input_idx: usize) -> String {
    let x = overlay.x as u32;
    let y = overlay.y as u32;
    let start_sec = overlay.start_time as f64 / 1000.0;
    let end_sec = start_sec + (overlay.duration as f64 / 1000.0);
    let w = overlay.width as u32;
    let h = overlay.height as u32;

    // Scale the overlay image, then composite
    format!(
        "[{input_idx}:v]scale={w}:{h}[ovr{input_idx}];\
         [vid][ovr{input_idx}]overlay=x={x}:y={y}:enable='between(t,{start_sec:.3},{end_sec:.3})'"
    )
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn param_f64(
    params: &std::collections::HashMap<String, serde_json::Value>,
    key: &str,
    default: f64,
) -> f64 {
    params
        .get(key)
        .and_then(|v| v.as_f64())
        .unwrap_or(default)
}
