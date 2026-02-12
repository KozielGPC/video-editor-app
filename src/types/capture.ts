/**
 * Types for OBS-style capture sources and scene composition
 */

/** A capturable window from the system */
export interface CapturableWindow {
  id: number;
  title: string;
  ownerName: string;
  bounds: { x: number; y: number; width: number; height: number };
  thumbnail: string | null;
}

/** A capturable screen/display */
export interface CapturableScreen {
  id: number;
  name: string;
  width: number;
  height: number;
  isMain: boolean;
  thumbnail: string | null;
}

/** A camera/webcam source */
export interface CaptureCamera {
  id: string;
  name: string;
}

/** Types of capture sources */
export type SourceType = "window" | "screen" | "camera";

/** A source added to the scene */
export interface SceneSource {
  id: string;
  type: SourceType;
  sourceId: number | string; // number for window/screen, string for camera
  name: string;
  /** Layout in scene (0-100 percentages) */
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  visible: boolean;
}

/** Scene composition with multiple sources */
export interface Scene {
  id: string;
  name: string;
  sources: SceneSource[];
}

/** All available capture sources */
export interface AvailableSources {
  windows: CapturableWindow[];
  screens: CapturableScreen[];
  cameras: CaptureCamera[];
}
