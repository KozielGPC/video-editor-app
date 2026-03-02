use crate::models::MicrophoneInfo;
use super::audio_capture::AudioCapture;

/// Enumerate available microphones using cpal (CoreAudio).
pub fn enumerate_microphones() -> Result<Vec<MicrophoneInfo>, String> {
    let devices = AudioCapture::list_input_devices()?;
    Ok(devices
        .into_iter()
        .map(|(id, name)| MicrophoneInfo { id, name })
        .collect())
}
