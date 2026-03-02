use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use hound::{SampleFormat, WavSpec, WavWriter};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

/// Handle to a running audio capture. Send-safe (the non-Send cpal::Stream
/// lives on a dedicated thread).
pub struct AudioCapture {
    wav_path: String,
    /// Signals the capture thread to stop.
    stop_flag: Arc<AtomicBool>,
    /// Join handle for the capture thread.
    thread: Option<std::thread::JoinHandle<Result<(), String>>>,
}

// AudioCapture is Send because it only holds Send types.
// (cpal::Stream is kept inside the spawned thread, never shared.)

impl AudioCapture {
    /// List available input (microphone) devices via cpal.
    pub fn list_input_devices() -> Result<Vec<(String, String)>, String> {
        let host = cpal::default_host();
        let mut devices = Vec::new();

        for (idx, device) in host
            .input_devices()
            .map_err(|e| format!("Failed to enumerate input devices: {e}"))?
            .enumerate()
        {
            let name = device.name().unwrap_or_else(|_| format!("Device {idx}"));
            devices.push((idx.to_string(), name));
        }

        Ok(devices)
    }

    /// Start capturing audio from the given device to a WAV file.
    ///
    /// `device_id` is the string index from `list_input_devices()`.
    /// The cpal stream runs on a dedicated thread to keep `AudioCapture` Send.
    pub fn start(device_id: &str, wav_path: &str) -> Result<Self, String> {
        let device_idx: usize = device_id
            .parse()
            .map_err(|_| format!("Invalid device ID: {device_id}"))?;

        let wav_path_owned = wav_path.to_string();
        let stop_flag = Arc::new(AtomicBool::new(false));
        let stop_clone = Arc::clone(&stop_flag);

        // We need to build the device/config on the main thread to report
        // errors synchronously, but the stream itself will run on a spawned thread.
        let host = cpal::default_host();
        let device = host
            .input_devices()
            .map_err(|e| format!("Failed to enumerate devices: {e}"))?
            .nth(device_idx)
            .ok_or_else(|| format!("Device index {device_idx} not found"))?;

        let config = device
            .default_input_config()
            .map_err(|e| format!("No default input config: {e}"))?;

        let sample_format = config.sample_format();
        let channels = config.channels();
        let sample_rate = config.sample_rate().0;

        eprintln!(
            "[audio_capture] Device: {}, Format: {:?}, Rate: {}, Channels: {}",
            device.name().unwrap_or_default(),
            sample_format,
            sample_rate,
            channels,
        );

        let spec = WavSpec {
            channels,
            sample_rate,
            bits_per_sample: 16,
            sample_format: SampleFormat::Int,
        };

        let wav_path_thread = wav_path_owned.clone();

        // Spawn the capture thread. The cpal::Stream lives entirely within it.
        let thread = std::thread::Builder::new()
            .name("audio-capture".into())
            .spawn(move || -> Result<(), String> {
                let writer = WavWriter::create(&wav_path_thread, spec)
                    .map_err(|e| format!("Failed to create WAV file: {e}"))?;
                let writer = Arc::new(Mutex::new(Some(writer)));
                let writer_clone = Arc::clone(&writer);

                let err_fn = |err: cpal::StreamError| {
                    eprintln!("[audio_capture] Stream error: {err}");
                };

                let stream_config: cpal::StreamConfig = config.into();

                let stream = match sample_format {
                    cpal::SampleFormat::I16 => {
                        let w = Arc::clone(&writer_clone);
                        device
                            .build_input_stream(
                                &stream_config,
                                move |data: &[i16], _: &cpal::InputCallbackInfo| {
                                    if let Ok(mut guard) = w.lock() {
                                        if let Some(ref mut writer) = *guard {
                                            for &sample in data {
                                                writer.write_sample(sample).ok();
                                            }
                                        }
                                    }
                                },
                                err_fn,
                                None,
                            )
                            .map_err(|e| format!("Failed to build i16 stream: {e}"))?
                    }
                    cpal::SampleFormat::F32 => {
                        let w = Arc::clone(&writer_clone);
                        device
                            .build_input_stream(
                                &stream_config,
                                move |data: &[f32], _: &cpal::InputCallbackInfo| {
                                    if let Ok(mut guard) = w.lock() {
                                        if let Some(ref mut writer) = *guard {
                                            for &sample in data {
                                                let clamped = sample.clamp(-1.0, 1.0);
                                                let s16 = (clamped * i16::MAX as f32) as i16;
                                                writer.write_sample(s16).ok();
                                            }
                                        }
                                    }
                                },
                                err_fn,
                                None,
                            )
                            .map_err(|e| format!("Failed to build f32 stream: {e}"))?
                    }
                    other => {
                        return Err(format!("Unsupported sample format: {other:?}"));
                    }
                };

                stream
                    .play()
                    .map_err(|e| format!("Failed to start audio stream: {e}"))?;

                eprintln!("[audio_capture] Recording to {wav_path_thread}");

                // Block until stop is signaled
                while !stop_clone.load(Ordering::Relaxed) {
                    std::thread::sleep(std::time::Duration::from_millis(50));
                }

                // Drop the stream to stop callbacks
                drop(stream);

                // Finalize WAV
                if let Ok(mut guard) = writer.lock() {
                    if let Some(w) = guard.take() {
                        w.finalize()
                            .map_err(|e| format!("Failed to finalize WAV: {e}"))?;
                    }
                }

                eprintln!("[audio_capture] Stopped, WAV finalized");
                Ok(())
            })
            .map_err(|e| format!("Failed to spawn audio thread: {e}"))?;

        Ok(Self {
            wav_path: wav_path_owned,
            stop_flag,
            thread: Some(thread),
        })
    }

    /// Stop capturing and finalize the WAV file. Returns the WAV path.
    pub fn stop(mut self) -> Result<String, String> {
        self.stop_flag.store(true, Ordering::Relaxed);

        if let Some(handle) = self.thread.take() {
            match handle.join() {
                Ok(Ok(())) => {}
                Ok(Err(e)) => return Err(e),
                Err(_) => return Err("Audio capture thread panicked".to_string()),
            }
        }

        eprintln!("[audio_capture] WAV saved to {}", self.wav_path);
        Ok(self.wav_path.clone())
    }
}
