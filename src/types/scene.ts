/** Types for scene composition - OBS-like source management */

export type SourceType = "screen" | "camera" | "image" | "text";

/** A source in the scene with position, size, and layer info */
export interface SceneSource {
  /** Unique identifier */
  id: string;
  /** Type of source */
  type: SourceType;
  /** Display name */
  name: string;
  /** Position X as percentage of canvas (0-100) */
  x: number;
  /** Position Y as percentage of canvas (0-100) */
  y: number;
  /** Width as percentage of canvas (0-100) */
  width: number;
  /** Height as percentage of canvas (0-100) */
  height: number;
  /** Layer order (higher = on top) */
  zIndex: number;
  /** Whether source is visible */
  visible: boolean;
  /** Whether to lock aspect ratio when resizing */
  locked: boolean;
  /** Original aspect ratio (width/height) for maintaining proportions */
  aspectRatio?: number;
  /** Source-specific data (device ID, file path, etc.) */
  sourceData?: Record<string, unknown>;
}

/** Resize handle positions */
export type ResizeHandle =
  | "top-left"
  | "top"
  | "top-right"
  | "right"
  | "bottom-right"
  | "bottom"
  | "bottom-left"
  | "left";

/** Canvas aspect ratio presets */
export type AspectRatioPreset = "16:9" | "9:16" | "4:3" | "1:1" | "4:5" | "custom";

export interface CanvasSettings {
  aspectRatio: AspectRatioPreset;
  customWidth?: number;
  customHeight?: number;
  showGrid: boolean;
  snapToGrid: boolean;
  snapToEdges: boolean;
  gridSize: number; // percentage
}
