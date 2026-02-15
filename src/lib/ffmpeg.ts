import { invoke } from "@tauri-apps/api/core";
import type { MediaInfo } from "@/types/project";

/** A non-silent time segment returned by silence detection. */
export interface Segment {
  startMs: number;
  endMs: number;
}

/**
 * Raw segment from the Rust backend.
 *
 * Serde serialises with snake_case (`start_ms`, `end_ms`) but Tauri v2 may
 * convert to camelCase (`startMs`, `endMs`) depending on the version.
 * We accept both to be safe.
 */
interface RawSegment {
  start_ms?: number;
  end_ms?: number;
  startMs?: number;
  endMs?: number;
}

/**
 * Probe a media file for metadata (duration, resolution, codecs, …).
 */
export async function probeMedia(path: string): Promise<MediaInfo> {
  return invoke<MediaInfo>("probe_media", { path });
}

/**
 * Generate evenly-spaced thumbnail images from a video file.
 *
 * @param path       - Absolute path to the source video
 * @param count      - Number of thumbnails to generate
 * @param outputDir  - Directory where thumbnail images will be written
 * @returns            Array of absolute paths to the generated thumbnails
 */
export async function generateThumbnails(
  path: string,
  count: number,
  outputDir: string,
): Promise<string[]> {
  return invoke<string[]>("generate_thumbnails", { path, count, outputDir });
}

/**
 * Extract the audio stream from a video file.
 */
export async function extractAudio(
  videoPath: string,
  outputPath: string,
): Promise<void> {
  return invoke<void>("extract_audio", { videoPath, outputPath });
}

/**
 * Detect non-silent segments in an audio file.
 *
 * @param audioPath      - Path to the audio file
 * @param thresholdDb    - Silence threshold in dB (e.g. -50)
 * @param minSilenceMs   - Minimum silence duration in ms to count as a segment
 * @param paddingMs      - Padding added around each detected segment boundary
 * @returns                Array of non-silent segments (speech regions)
 */
export async function detectSilence(
  audioPath: string,
  thresholdDb: number,
  minSilenceMs: number,
  paddingMs: number,
): Promise<Segment[]> {
  const raw = await invoke<RawSegment[]>("detect_silence", {
    audioPath,
    config: {
      threshold_db: thresholdDb,
      min_silence_ms: minSilenceMs,
      padding_ms: paddingMs,
    },
  });
  return raw.map((s) => ({
    startMs: s.start_ms ?? s.startMs ?? 0,
    endMs: s.end_ms ?? s.endMs ?? 0,
  }));
}

/**
 * Detect non-silent segments in a video — pure Rust, no Python dependency.
 *
 * This is **non-destructive**: the original file is never modified.
 * Returns the speech segments which the frontend applies to the timeline.
 * The actual video assembly only happens on Export.
 *
 * Pipeline: extract audio (mono 16 kHz) → detect silence → pad & merge.
 *
 * @param inputPath      - Absolute path to the input video file
 * @param thresholdDb    - Silence threshold in dB (e.g. -50)
 * @param minSilenceMs   - Minimum silence duration in ms to count as removable
 * @param paddingMs      - Padding in ms to keep around each speech segment
 * @returns                Array of non-silent segments (speech regions)
 */
export async function removeSilence(
  inputPath: string,
  thresholdDb: number,
  minSilenceMs: number,
  paddingMs: number,
): Promise<Segment[]> {
  const raw = await invoke<RawSegment[]>("remove_silence", {
    inputPath,
    thresholdDb,
    minSilenceMs,
    paddingMs,
  });
  return raw.map((s) => ({
    startMs: s.start_ms ?? s.startMs ?? 0,
    endMs: s.end_ms ?? s.endMs ?? 0,
  }));
}
