/**
 * Format milliseconds into a timecode string.
 *
 * - Returns `"HH:MM:SS.mmm"` when the value is ≥ 1 hour
 * - Returns `"MM:SS.mmm"` for shorter durations
 */
export function formatTimecode(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const millis = Math.floor(ms % 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");
  const ms3 = String(millis).padStart(3, "0");

  if (hours > 0) {
    const hh = String(hours).padStart(2, "0");
    return `${hh}:${mm}:${ss}.${ms3}`;
  }

  return `${mm}:${ss}.${ms3}`;
}

/**
 * Format a total number of seconds into a `"HH:MM:SS"` timer string.
 * Useful for recording elapsed time displays.
 */
export function formatTimer(seconds: number): string {
  const s = Math.floor(seconds);
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/**
 * Convert a millisecond value to a pixel position on the timeline.
 *
 * @param ms    - Time in milliseconds
 * @param zoom  - Pixels per second (e.g. 100 = 100 px/s)
 */
export function msToPixels(ms: number, zoom: number): number {
  return (ms / 1000) * zoom;
}

/**
 * Convert a pixel position on the timeline back to milliseconds.
 *
 * @param px    - Pixel offset
 * @param zoom  - Pixels per second
 */
export function pixelsToMs(px: number, zoom: number): number {
  return (px / zoom) * 1000;
}

/**
 * Snap a millisecond value to the nearest grid point.
 *
 * @param ms       - Value to snap
 * @param gridSize - Grid interval in ms (e.g. 100 for 100 ms grid)
 */
export function snapToGrid(ms: number, gridSize: number): number {
  if (gridSize <= 0) return ms;
  return Math.round(ms / gridSize) * gridSize;
}

/**
 * Clamp a number between a minimum and maximum value.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
