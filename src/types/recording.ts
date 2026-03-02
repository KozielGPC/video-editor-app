export interface ScreenSource {
  id: string;
  name: string;
  width: number;
  height: number;
}

export interface CameraSource {
  id: string;
  name: string;
}

export interface MicSource {
  id: string;
  name: string;
}

export type RecordingState = "idle" | "recording" | "paused";

export interface RecordingConfig {
  screenId: string | null;
  cameraId: string | null;
  micId: string | null;
  outputPath: string;
  includeScreen: boolean;
  includeCamera: boolean;
  includeMic: boolean;
}
