import { invoke } from "@tauri-apps/api/core";
import type { MediaInfo } from "@/types/project";

/** A time segment returned by silence detection. */
export interface Segment {
  start: number; // ms
  end: number; // ms
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
 * Detect silence segments in an audio file.
 *
 * @param audioPath      - Path to the audio file
 * @param thresholdDb    - Silence threshold in dB (e.g. -30)
 * @param minSilenceMs   - Minimum silence duration in ms to count as a segment
 * @param paddingMs      - Padding added around each detected segment boundary
 * @returns                Array of silence segments
 */
export async function detectSilence(
  audioPath: string,
  thresholdDb: number,
  minSilenceMs: number,
  paddingMs: number,
): Promise<Segment[]> {
  return invoke<Segment[]>("detect_silence", {
    audioPath,
    thresholdDb,
    minSilenceMs,
    paddingMs,
  });
}
