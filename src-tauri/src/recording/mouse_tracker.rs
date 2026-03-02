use crate::models::{MouseClickEvent, MousePosition};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread::{self, JoinHandle};
use std::time::Instant;

// ---------------------------------------------------------------------------
// Core Graphics FFI for mouse position and button state
// ---------------------------------------------------------------------------

#[repr(C)]
#[derive(Clone, Copy)]
struct CGPoint {
    x: f64,
    y: f64,
}

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
    fn CGEventCreate(source: *const std::ffi::c_void) -> *mut std::ffi::c_void;
    fn CGEventGetLocation(event: *const std::ffi::c_void) -> CGPoint;
    /// Returns true if the specified mouse button is currently pressed.
    /// button: 0=left, 1=right, 2=center
    fn CGEventSourceButtonState(stateID: u32, button: u32) -> bool;
}

#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
    fn CFRelease(cf: *const std::ffi::c_void);
}

/// Combined HID state (kCGEventSourceStateCombinedSessionState)
const COMBINED_SESSION_STATE: u32 = 0;

/// Return the current mouse cursor position (screen coordinates).
pub fn get_current_mouse_position() -> (f64, f64) {
    get_mouse_position()
}

fn get_mouse_position() -> (f64, f64) {
    unsafe {
        let event = CGEventCreate(std::ptr::null());
        if event.is_null() {
            return (0.0, 0.0);
        }
        let point = CGEventGetLocation(event);
        CFRelease(event);
        (point.x, point.y)
    }
}

// ---------------------------------------------------------------------------
// MouseTracker
// ---------------------------------------------------------------------------

/// Check if a mouse button is currently pressed.
fn is_mouse_button_down(button: u32) -> bool {
    unsafe { CGEventSourceButtonState(COMBINED_SESSION_STATE, button) }
}

/// Records mouse position at ~60 Hz and detects click events.
pub struct MouseTracker {
    positions: Arc<Mutex<Vec<MousePosition>>>,
    clicks: Arc<Mutex<Vec<MouseClickEvent>>>,
    stop_flag: Arc<AtomicBool>,
    tracker_thread: Option<JoinHandle<()>>,
}

impl MouseTracker {
    pub fn new() -> Self {
        Self {
            positions: Arc::new(Mutex::new(Vec::new())),
            clicks: Arc::new(Mutex::new(Vec::new())),
            stop_flag: Arc::new(AtomicBool::new(false)),
            tracker_thread: None,
        }
    }

    pub fn start(&mut self) {
        self.stop_flag.store(false, Ordering::SeqCst);
        let positions = self.positions.clone();
        let clicks = self.clicks.clone();
        let stop = self.stop_flag.clone();

        self.tracker_thread = Some(thread::spawn(move || {
            let start = Instant::now();
            let mut prev_left_down = false;
            let mut prev_right_down = false;
            let mut prev_middle_down = false;

            while !stop.load(Ordering::Relaxed) {
                let (x, y) = get_mouse_position();
                let ts = start.elapsed().as_millis() as u64;

                if let Ok(mut pos) = positions.lock() {
                    pos.push(MousePosition {
                        x,
                        y,
                        timestamp_ms: ts,
                    });
                }

                // Detect click events (rising edge = button just pressed)
                let left_down = is_mouse_button_down(0);
                let right_down = is_mouse_button_down(1);
                let middle_down = is_mouse_button_down(2);

                if let Ok(mut clk) = clicks.lock() {
                    if left_down && !prev_left_down {
                        clk.push(MouseClickEvent {
                            x,
                            y,
                            timestamp_ms: ts,
                            button: 0,
                        });
                    }
                    if right_down && !prev_right_down {
                        clk.push(MouseClickEvent {
                            x,
                            y,
                            timestamp_ms: ts,
                            button: 1,
                        });
                    }
                    if middle_down && !prev_middle_down {
                        clk.push(MouseClickEvent {
                            x,
                            y,
                            timestamp_ms: ts,
                            button: 2,
                        });
                    }
                }

                prev_left_down = left_down;
                prev_right_down = right_down;
                prev_middle_down = middle_down;

                thread::sleep(std::time::Duration::from_millis(16)); // ~60 Hz
            }
        }));
    }

    pub fn stop(&mut self) {
        self.stop_flag.store(true, Ordering::SeqCst);
        if let Some(handle) = self.tracker_thread.take() {
            handle.join().ok();
        }
    }

    /// Persist recorded positions to a JSON file.
    pub fn save_to_file(&self, path: &str) -> Result<(), String> {
        let positions = self
            .positions
            .lock()
            .map_err(|e| e.to_string())?
            .clone();
        let json =
            serde_json::to_string_pretty(&positions).map_err(|e| format!("serialize: {e}"))?;
        std::fs::write(path, json).map_err(|e| format!("write {path}: {e}"))
    }

    /// Persist recorded click events to a JSON file.
    pub fn save_clicks_to_file(&self, path: &str) -> Result<(), String> {
        let clicks = self.clicks.lock().map_err(|e| e.to_string())?.clone();
        let json =
            serde_json::to_string_pretty(&clicks).map_err(|e| format!("serialize: {e}"))?;
        std::fs::write(path, json).map_err(|e| format!("write {path}: {e}"))
    }

    /// Load previously saved positions from a JSON file.
    pub fn load_from_file(path: &str) -> Result<Vec<MousePosition>, String> {
        let data = std::fs::read_to_string(path).map_err(|e| format!("read {path}: {e}"))?;
        serde_json::from_str(&data).map_err(|e| format!("parse: {e}"))
    }

    /// Load previously saved click events from a JSON file.
    pub fn load_clicks_from_file(path: &str) -> Result<Vec<MouseClickEvent>, String> {
        let data = std::fs::read_to_string(path).map_err(|e| format!("read {path}: {e}"))?;
        serde_json::from_str(&data).map_err(|e| format!("parse: {e}"))
    }

    /// Return smoothed positions within a timestamp range.
    ///
    /// Applies an exponential moving average (EMA) to the raw 60 Hz data to
    /// create a natural "camera follow" effect, then downsamples to ~5 Hz.
    /// The EMA removes micro-jitter so the downsampled keyframes trace a
    /// smooth curve — no staircase artefacts even at low sample rates.
    pub fn get_positions_in_range(&self, start_ms: u64, end_ms: u64) -> Vec<MousePosition> {
        let positions = match self.positions.lock() {
            Ok(p) => p,
            Err(_) => return Vec::new(),
        };

        // Collect raw positions in range (60 Hz)
        let raw: Vec<&MousePosition> = positions
            .iter()
            .filter(|p| p.timestamp_ms >= start_ms && p.timestamp_ms <= end_ms)
            .collect();
        if raw.is_empty() {
            return Vec::new();
        }

        // EMA smoothing — α ≈ 0.10 at 60 Hz gives ~150 ms time-constant,
        // producing a natural camera-follow lag.
        let alpha = 0.10;
        let mut sx = raw[0].x;
        let mut sy = raw[0].y;

        let mut result = Vec::new();
        let mut last_ts: Option<u64> = None;

        for pos in &raw {
            sx = alpha * pos.x + (1.0 - alpha) * sx;
            sy = alpha * pos.y + (1.0 - alpha) * sy;

            // Downsample the smoothed stream to ~5 Hz (every 200 ms)
            if let Some(prev) = last_ts {
                if pos.timestamp_ms - prev < 200 {
                    continue;
                }
            }
            result.push(MousePosition {
                x: sx,
                y: sy,
                timestamp_ms: pos.timestamp_ms,
            });
            last_ts = Some(pos.timestamp_ms);
        }
        result
    }
}
