import type { CameraOverlayInfo } from "@/types/project";

export interface ScenePreset {
  id: string;
  name: string;
  /** Camera overlay layout (undefined means no camera) */
  camera?: Pick<CameraOverlayInfo, "x" | "y" | "width" | "height" | "shape" | "borderRadius">;
  /** Screen width as percentage of the full canvas (100 = full width) */
  screenWidthPercent: number;
}

// Heights for circle presets are calculated for 16:9 aspect ratio so the
// camera appears as a true circle: height% = width% × (16/9).
//   width 20% → height ≈ 36%  (20 × 1.778)
export const SCENE_PRESETS: ScenePreset[] = [
  {
    id: "classic-br",
    name: "Classic",
    camera: { x: 77, y: 61, width: 20, height: 36, shape: "circle" },
    screenWidthPercent: 100,
  },
  {
    id: "classic-bl",
    name: "Classic Left",
    camera: { x: 3, y: 61, width: 20, height: 36, shape: "circle" },
    screenWidthPercent: 100,
  },
  {
    id: "large-br",
    name: "Large Camera",
    camera: { x: 60, y: 50, width: 37, height: 47, shape: "rounded", borderRadius: 12 },
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
