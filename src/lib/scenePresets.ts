import type { CameraOverlayInfo } from "@/types/project";

export interface ScenePreset {
  id: string;
  name: string;
  /** Camera overlay layout (undefined means no camera) */
  camera?: Pick<CameraOverlayInfo, "x" | "y" | "width" | "height" | "shape" | "borderRadius">;
  /** Screen width as percentage of the full canvas (100 = full width) */
  screenWidthPercent: number;
}

export const SCENE_PRESETS: ScenePreset[] = [
  {
    id: "classic-br",
    name: "Classic",
    camera: { x: 75, y: 72, width: 22, height: 25, shape: "circle" },
    screenWidthPercent: 100,
  },
  {
    id: "classic-bl",
    name: "Classic Left",
    camera: { x: 3, y: 72, width: 22, height: 25, shape: "circle" },
    screenWidthPercent: 100,
  },
  {
    id: "large-br",
    name: "Large Camera",
    camera: { x: 62, y: 55, width: 35, height: 42, shape: "rounded", borderRadius: 10 },
    screenWidthPercent: 100,
  },
  {
    id: "split-right",
    name: "Side by Side",
    camera: { x: 70, y: 0, width: 30, height: 100, shape: "rectangle" },
    screenWidthPercent: 70,
  },
  {
    id: "screen-only",
    name: "Screen Only",
    camera: undefined,
    screenWidthPercent: 100,
  },
  {
    id: "camera-only",
    name: "Camera Only",
    camera: { x: 0, y: 0, width: 100, height: 100, shape: "rectangle" },
    screenWidthPercent: 0,
  },
];

export function getPresetById(id: string): ScenePreset | undefined {
  return SCENE_PRESETS.find((p) => p.id === id);
}
