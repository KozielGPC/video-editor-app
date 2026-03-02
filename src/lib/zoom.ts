import type { Effect } from "@/types/project";

/** Mouse position sample from Rust (screen-relative %, with absolute timestamp). */
export interface ZoomMousePosition {
  x: number;
  y: number;
  timestamp_ms: number;
}

/** Zoom marker as returned by the Rust backend (snake_case from serde). */
export interface ZoomMarker {
  start_ms: number;
  end_ms: number;
  x: number;
  y: number;
  scale: number;
  /** Sampled mouse positions during this zoom period (screen-relative %). */
  positions?: ZoomMousePosition[];
}

/**
 * Convert an array of ZoomMarkers (from Rust) into Effect[] for the editor timeline.
 *
 * Each marker becomes a zoom effect with:
 * - `startTime` in seconds
 * - `duration` in seconds
 * - `params.scale`, `params.x`, `params.y` for zoom focus
 * - `params.positions` — keyframed mouse positions for mouse-following zoom
 * - `params.source = "auto"` to distinguish from manual zooms
 */
export function zoomMarkersToEffects(
  markers: ZoomMarker[],
  source: string = "auto",
): Effect[] {
  return markers
    .filter((m) => m.end_ms > m.start_ms)
    .map((m) => {
      const params: Effect["params"] = {
        scale: m.scale,
        x: m.x,
        y: m.y,
        source,
      };

      // Include keyframed positions (time relative to effect start, in seconds)
      if (m.positions && m.positions.length > 0) {
        params.positions = m.positions.map((p) => ({
          t: (p.timestamp_ms - m.start_ms) / 1000,
          x: p.x,
          y: p.y,
        }));
      }

      return {
        type: "zoom" as const,
        startTime: m.start_ms / 1000,
        duration: (m.end_ms - m.start_ms) / 1000,
        params,
      };
    });
}

/**
 * Merge manual and auto-generated zoom effects, filtering out auto-zooms
 * that overlap with any manual zoom (manual takes priority).
 */
export function mergeZoomEffects(
  manual: Effect[],
  auto: Effect[],
): Effect[] {
  if (manual.length === 0) return auto;
  if (auto.length === 0) return manual;

  const filtered = auto.filter((a) => {
    const aStart = a.startTime;
    const aEnd = a.startTime + a.duration;
    // Drop this auto-zoom if it overlaps any manual zoom
    return !manual.some((m) => {
      const mStart = m.startTime;
      const mEnd = m.startTime + m.duration;
      return aStart < mEnd && aEnd > mStart;
    });
  });

  return [...manual, ...filtered];
}
