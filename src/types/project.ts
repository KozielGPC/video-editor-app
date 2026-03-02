// ─── Core Project Types ──────────────────────────────────────────────────────

/** Camera overlay info for separate zoom-aware rendering */
export interface CameraOverlayInfo {
  path: string;
  syncOffset: number;
  x: number;
  y: number;
  width: number;
  height: number;
  shape?: string;
  borderRadius?: number;
  borderWidth?: number;
  borderColor?: string;
  shadow?: boolean;
  cropX?: number;
  cropY?: number;
  cropWidth?: number;
  cropHeight?: number;
  /** When true the camera overlay is hidden in preview/export (but data is preserved) */
  hidden?: boolean;
}

export interface Project {
  id: string;
  name: string;
  resolution: { width: number; height: number };
  frameRate: number;
  /** @deprecated Use `resolution.width` / `resolution.height` */
  width?: number;
  /** @deprecated Use `resolution.height` */
  height?: number;
  /** @deprecated Use `frameRate` */
  fps?: number;
  tracks: Track[];
  assets: Asset[];
  /** Camera overlay for zoom-aware rendering (zoom only affects screen, not camera) */
  cameraOverlay?: CameraOverlayInfo;
}

export interface Asset {
  id: string;
  name: string;
  path: string;
  type: "video" | "audio" | "image";
  duration: number;
  width?: number;
  height?: number;
  thumbnails?: string[];
}

export interface Track {
  id: string;
  name?: string;
  type: "video" | "audio" | "overlay" | "zoom";
  clips: Clip[];
  muted: boolean;
  locked: boolean;
}

/** Sentinel asset ID used for zoom clips on the zoom track */
export const ZOOM_ASSET_ID = "__zoom__";

export interface Clip {
  id: string;
  assetId: string;
  trackPosition: number;
  sourceStart: number;
  sourceEnd: number;
  volume: number;
  effects: Effect[];
  overlays: Overlay[];
}

export interface Effect {
  type: "zoom" | "fade_in" | "fade_out";
  startTime: number;
  duration: number;
  params: Record<string, number | string>;
}

export interface Overlay {
  type: "text" | "image" | "video";
  position: { x: number; y: number };
  size: { width: number; height: number };
  content: string;
  startTime: number;
  duration: number;
  style?: Record<string, string>;
}

// ─── Legacy Overlay Types (backward compat) ─────────────────────────────────

export interface TextOverlayData {
  id: string;
  type: "text";
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  color: string;
  backgroundColor?: string;
  startTime: number;
  endTime: number;
  isSelected?: boolean;
}

export interface ImageOverlayData {
  id: string;
  type: "image";
  path: string;
  x: number;
  y: number;
  width: number;
  height: number;
  startTime: number;
  endTime: number;
  isSelected?: boolean;
}

export interface WebcamOverlayData {
  id: string;
  type: "webcam";
  x: number;
  y: number;
  width: number;
  height: number;
  borderRadius: number;
  startTime: number;
  endTime: number;
  isSelected?: boolean;
}

/**
 * Media file metadata returned by the Rust `probe_media` command.
 *
 * Field names match the Rust `MediaInfo` struct (serde snake_case).
 */
export interface MediaInfo {
  path: string;
  duration_ms: number;
  width: number;
  height: number;
  codec: string;
  has_audio: boolean;
  has_video: boolean;
}

// ─── Export Types ────────────────────────────────────────────────────────────

export interface ExportConfig {
  projectId: string;
  format: "mp4" | "mov" | "webm";
  codec: string;
  width: number;
  height: number;
  fps: number;
  crf: number;
  audioBitrate: string;
  outputPath: string;
}

export interface ExportProgress {
  percent: number;
  elapsed: number;
  estimated: number;
  status: string;
}
