use std::process::{Child, Command, Stdio};

/// FFmpeg-based recording encoder that uses avfoundation for capture
/// and encodes to MP4 (H.264 + AAC) in real-time.
pub struct RecordingEncoder {
    ffmpeg_process: Child,
}

impl RecordingEncoder {
    /// Start an FFmpeg avfoundation capture process.
    ///
    /// - `screen_idx`: avfoundation video device index for screen (or "none")
    /// - `mic_idx`: avfoundation audio device index for mic (or "none")
    /// - `output_path`: path to the output MP4 file
    /// - `fps`: target frame rate
    pub fn start(
        output_path: &str,
        screen_idx: Option<&str>,
        mic_idx: Option<&str>,
        fps: u32,
    ) -> Result<Self, String> {
        let video_part = screen_idx.unwrap_or("none");
        let audio_part = mic_idx.unwrap_or("none");
        let input = format!("{video_part}:{audio_part}");

        let mut args: Vec<String> = vec![
            "-y".to_string(),
            "-f".to_string(),
            "avfoundation".to_string(),
            "-framerate".to_string(),
            fps.to_string(),
            "-capture_cursor".to_string(),
            "1".to_string(),
            "-capture_mouse_clicks".to_string(),
            "1".to_string(),
            "-i".to_string(),
            input,
        ];

        // Video codec
        args.extend([
            "-c:v".to_string(),
            "h264_videotoolbox".to_string(), // Hardware-accelerated H.264 on macOS
            "-b:v".to_string(),
            "8M".to_string(),
            "-pix_fmt".to_string(),
            "yuv420p".to_string(),
        ]);

        // Audio codec (if mic selected)
        if mic_idx.is_some() && mic_idx != Some("none") {
            args.extend([
                "-c:a".to_string(),
                "aac".to_string(),
                "-b:a".to_string(),
                "192k".to_string(),
            ]);
        }

        args.push(output_path.to_string());

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

    /// Gracefully stop recording by sending 'q' to FFmpeg's stdin.
    pub fn stop(mut self) -> Result<(), String> {
        // Send 'q' to FFmpeg to stop recording gracefully
        if let Some(mut stdin) = self.ffmpeg_process.stdin.take() {
            use std::io::Write;
            stdin.write_all(b"q").ok();
            drop(stdin);
        }

        // Wait for FFmpeg to finish (with timeout)
        match self.ffmpeg_process.wait() {
            Ok(status) => {
                if status.success() || status.code() == Some(255) {
                    // 255 is normal for 'q' quit
                    Ok(())
                } else {
                    Err(format!("FFmpeg exited with status: {status}"))
                }
            }
            Err(e) => Err(format!("Failed to wait for FFmpeg: {e}")),
        }
    }

    /// Force-kill the FFmpeg process.
    pub fn kill(&mut self) {
        self.ffmpeg_process.kill().ok();
    }
}
