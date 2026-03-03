import type { CameraOverlayInfo } from "@/types/project";
import type { AspectRatioPreset } from "@/types/scene";

type CameraLayout = Pick<CameraOverlayInfo, "x" | "y" | "width" | "height" | "shape" | "borderRadius">;

interface PresetLayout {
  camera?: CameraLayout;
  screenWidthPercent: number;
  /** Height of the screen area (default: 100). Used for portrait stacked layouts. */
  screenHeightPercent?: number;
}

export interface ScenePreset {
  id: string;
  name: string;
  /** Camera overlay layout (undefined means no camera) */
  camera?: CameraLayout;
  /** Screen width as percentage of the full canvas (100 = full width) */
  screenWidthPercent: number;
  /** Screen height as percentage of the full canvas (default: 100). */
  screenHeightPercent?: number;
}

// For circle presets, height% must compensate for aspect ratio so the camera
// renders as a true circle on screen:  height% = width% × (canvasW / canvasH).
// The ratios below map each aspect ratio to (w/h) for that calculation.
const AR_FACTOR: Record<string, number> = {
  "16:9": 16 / 9,
  "9:16": 9 / 16,
  "4:3":  4 / 3,
  "1:1":  1,
  "4:5":  4 / 5,
};

function circleHeight(widthPct: number, arKey: string): number {
  return Math.round(widthPct * (AR_FACTOR[arKey] ?? 16 / 9));
}

// Per-ratio preset layouts.
// landscape  = 16:9, 4:3
// portrait   = 9:16, 4:5
// square     = 1:1
type LayoutGroup = "landscape" | "portrait" | "square";

function arGroup(ar: string): LayoutGroup {
  if (ar === "9:16" || ar === "4:5") return "portrait";
  if (ar === "1:1") return "square";
  return "landscape";
}

// Returns the resolved layout for a preset id + aspect ratio.
function resolveLayout(id: string, ar: string): PresetLayout {
  const group = arGroup(ar);

  switch (id) {
    case "classic-br": {
      const w = group === "portrait" ? 30 : 20;
      const h = circleHeight(w, ar);
      return {
        camera: {
          x: group === "portrait" ? 65 : 77,
          y: group === "portrait" ? 75 - h : 100 - h - 3,
          width: w, height: h, shape: "circle",
        },
        screenWidthPercent: 100,
      };
    }
    case "classic-bl": {
      const w = group === "portrait" ? 30 : 20;
      const h = circleHeight(w, ar);
      return {
        camera: {
          x: group === "portrait" ? 5 : 3,
          y: group === "portrait" ? 75 - h : 100 - h - 3,
          width: w, height: h, shape: "circle",
        },
        screenWidthPercent: 100,
      };
    }
    case "large-br": {
      if (group === "portrait") {
        return {
          camera: { x: 5, y: 55, width: 90, height: 42, shape: "rounded", borderRadius: 12 },
          screenWidthPercent: 100,
        };
      }
      if (group === "square") {
        return {
          camera: { x: 55, y: 55, width: 42, height: 42, shape: "rounded", borderRadius: 12 },
          screenWidthPercent: 100,
        };
      }
      return {
        camera: { x: 60, y: 50, width: 37, height: 47, shape: "rounded", borderRadius: 12 },
        screenWidthPercent: 100,
      };
    }
    case "split-right": {
      if (group === "portrait") {
        return {
          camera: { x: 0, y: 60, width: 100, height: 40, shape: "rectangle" },
          screenWidthPercent: 100,
          screenHeightPercent: 60,
        };
      }
      return {
        camera: { x: 70, y: 0, width: 30, height: 100, shape: "rectangle" },
        screenWidthPercent: 70,
      };
    }
    case "screen-only":
      return { camera: undefined, screenWidthPercent: 100 };
    case "camera-only":
      return {
        camera: { x: 0, y: 0, width: 100, height: 100, shape: "rectangle" },
        screenWidthPercent: 0,
      };
    default:
      return { camera: undefined, screenWidthPercent: 100 };
  }
}

// The canonical list of presets (default = 16:9 layout for the picker icons).
export const SCENE_PRESETS: ScenePreset[] = [
  { id: "classic-br",  name: "Classic",       ...resolveLayout("classic-br",  "16:9") },
  { id: "classic-bl",  name: "Classic Left",  ...resolveLayout("classic-bl",  "16:9") },
  { id: "large-br",    name: "Large Camera",  ...resolveLayout("large-br",    "16:9") },
  { id: "split-right", name: "Side by Side",  ...resolveLayout("split-right", "16:9") },
  { id: "screen-only", name: "Screen Only",   ...resolveLayout("screen-only", "16:9") },
  { id: "camera-only", name: "Camera Only",   ...resolveLayout("camera-only", "16:9") },
];

export function getPresetById(id: string): ScenePreset | undefined {
  return SCENE_PRESETS.find((p) => p.id === id);
}

/** Returns a preset whose layout is adapted for the given aspect ratio. */
export function getPresetForRatio(id: string, ar: AspectRatioPreset): ScenePreset | undefined {
  const base = SCENE_PRESETS.find((p) => p.id === id);
  if (!base) return undefined;
  return { ...base, ...resolveLayout(id, ar) };
}

/** Tolerance for layout matching (percent units). */
const LAYOUT_TOLERANCE = 12;

/**
 * Infers which preset the current layout matches, for the given aspect ratio.
 * Used when activePresetId is missing (e.g. from old persisted data).
 */
export function inferPresetFromLayout(
  camera: { x: number; y: number; width: number; height: number } | null,
  screenWidth: number,
  screenHeight: number,
  ar: AspectRatioPreset,
): string | null {
  if (!camera) {
    if (screenWidth >= 95 && screenHeight >= 95) return "screen-only";
    return null;
  }

  const t = LAYOUT_TOLERANCE;
  const match = (a: number, b: number) => Math.abs(a - b) <= t;

  for (const preset of SCENE_PRESETS) {
    const layout = resolveLayout(preset.id, ar);
    if (!layout.camera) continue;

    const cam = layout.camera;
    if (
      match(camera.x, cam.x) &&
      match(camera.y, cam.y) &&
      match(camera.width, cam.width) &&
      match(camera.height, cam.height)
    ) {
      const screenH = layout.screenHeightPercent ?? 100;
      if (match(screenWidth, layout.screenWidthPercent) && match(screenHeight, screenH)) {
        return preset.id;
      }
    }
  }
  return null;
}
