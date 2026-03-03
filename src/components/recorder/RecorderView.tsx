import { useCallback, useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useOverlayWindow } from "@/hooks/useOverlayWindow";
import { FolderOpen, Film, X, CheckCircle2 } from "lucide-react";
import RecordingControls from "@/components/recorder/RecordingControls";
import SceneBar from "@/components/recorder/SceneBar";
import SceneCanvas from "@/components/recorder/SceneCanvas";
import SourceList from "@/components/recorder/SourceList";
import SourcePicker from "@/components/recorder/SourcePicker";
import ScenePresetPicker from "@/components/editor/ScenePresetPicker";
import { useRecorderStore } from "@/stores/recorderStore";
import { useSceneStore, type AspectRatioPreset } from "@/stores/sceneStore";
import { useUIStore } from "@/stores/uiStore";
import { useEditorStore } from "@/stores/editorStore";
import { useSourceActions } from "@/hooks/useSourceActions";
import { useActiveScene } from "@/hooks/useActiveScene";
import { probeMedia } from "@/lib/ffmpeg";
import { zoomMarkersToEffects } from "@/lib/zoom";
import type { ZoomMarker } from "@/lib/zoom";
import type { Effect, CameraOverlayInfo } from "@/types/project";
import type { SceneSource } from "@/types/capture";

/** Load zoom markers via Tauri command and convert to Effect[] */
async function loadZoomEffects(recordingPath: string): Promise<Effect[]> {
  try {
    const markers = await invoke<ZoomMarker[]>("read_zoom_markers", {
      recordingPath,
    });
    return zoomMarkersToEffects(markers, "manual");
  } catch (err) {
    console.warn("Failed to load zoom markers:", err);
    return [];
  }
}

function PostRecordingBanner() {
  const lastRecordingPath = useRecorderStore((s) => s.lastRecordingPath);
  const lastCameraPath = useRecorderStore((s) => s.lastCameraPath);
  const lastCameraLayout = useRecorderStore((s) => s.lastCameraLayout);
  const lastSyncOffset = useRecorderStore((s) => s.lastSyncOffset);
  const lastRecordingDuration = useRecorderStore((s) => s.elapsedTime);
  const lastProjectDir = useRecorderStore((s) => s.lastProjectDir);
  const clearLastRecording = useRecorderStore((s) => s.clearLastRecording);
  const setActiveView = useUIStore((s) => s.setActiveView);
  const createProjectFromRecording = useEditorStore(
    (s) => s.createProjectFromRecording,
  );
  const fileName = lastRecordingPath?.split("/").pop() ?? "recording.mp4";

  const handleRevealInFinder = useCallback(async () => {
    if (!lastRecordingPath) return;
    try {
      await invoke("reveal_in_finder", { path: lastRecordingPath });
    } catch (err) {
      console.error("Failed to reveal in Finder:", err);
    }
  }, [lastRecordingPath]);

  const handleOpenInEditor = useCallback(async () => {
    if (!lastRecordingPath) return;

    // lastRecordingPath is always screen-only (no merge step)
    const videoPath = lastRecordingPath;

    // Probe actual duration from the file (elapsed timer is inaccurate)
    let durationSec = Math.max(lastRecordingDuration, 5);
    try {
      const info = await probeMedia(videoPath);
      if (info.duration_ms > 0) {
        durationSec = info.duration_ms / 1000;
      }
    } catch (err) {
      console.warn("Failed to probe recording duration, using elapsed time:", err);
    }

    // Load manual zoom markers from the sidecar file (no auto-zoom on open;
    // users can regenerate auto-zooms from the Inspector if desired)
    const zoomEffects = await loadZoomEffects(lastRecordingPath);

    // Build camera overlay info if camera was used
    const cameraOverlay: CameraOverlayInfo | undefined =
      lastCameraPath && lastCameraLayout
        ? {
            path: lastCameraPath,
            syncOffset: lastSyncOffset,
            x: lastCameraLayout.x,
            y: lastCameraLayout.y,
            width: lastCameraLayout.width,
            height: lastCameraLayout.height,
            shape: lastCameraLayout.shape,
            borderRadius: lastCameraLayout.border_radius,
            borderWidth: lastCameraLayout.border_width,
            borderColor: lastCameraLayout.border_color,
            shadow: lastCameraLayout.shadow,
            cropX: lastCameraLayout.crop_x,
            cropY: lastCameraLayout.crop_y,
            cropWidth: lastCameraLayout.crop_width,
            cropHeight: lastCameraLayout.crop_height,
          }
        : undefined;

    createProjectFromRecording(videoPath, durationSec, zoomEffects, cameraOverlay, lastProjectDir ?? undefined);

    // Auto-save project file if we have a project directory
    if (lastProjectDir) {
      // Small delay to ensure store is updated before save
      setTimeout(() => {
        useEditorStore.getState().saveProject();
      }, 100);
    }

    setActiveView("editor");
    clearLastRecording();
  }, [
    lastRecordingPath,
    lastCameraPath,
    lastCameraLayout,
    lastSyncOffset,
    lastRecordingDuration,
    lastProjectDir,
    createProjectFromRecording,
    setActiveView,
    clearLastRecording,
  ]);

  if (!lastRecordingPath) return null;

  return (
    <div className="shrink-0 flex items-center gap-3 px-4 py-2 bg-green-500/10 border-b border-green-500/20">
      <CheckCircle2 size={20} className="text-green-400 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-neutral-100">
          Recording saved
        </p>
        <p
          className="text-xs text-neutral-400 truncate"
          title={lastRecordingPath}
        >
          {fileName}
        </p>
      </div>
      <button
        onClick={handleRevealInFinder}
        title="Show in Finder"
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-neutral-800 border border-neutral-700 text-neutral-300 hover:bg-neutral-700 hover:text-neutral-100 transition-colors"
      >
        <FolderOpen size={14} />
        Finder
      </button>
      <button
        onClick={handleOpenInEditor}
        title="Open in Editor"
        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 border border-blue-500 text-white hover:bg-blue-500 transition-colors"
      >
        <Film size={14} />
        Edit
      </button>
      <button
        onClick={clearLastRecording}
        title="Dismiss"
        className="p-1 rounded-md text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800 transition-colors"
      >
        <X size={14} />
      </button>
    </div>
  );
}

const BOTTOM_PANEL_MIN = 120;
const BOTTOM_PANEL_MAX_PERCENT = 0.5;
const BOTTOM_PANEL_DEFAULT = 176;

export default function RecorderView() {
  useOverlayWindow();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [bottomPanelHeight, setBottomPanelHeight] = useState(BOTTOM_PANEL_DEFAULT);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartY = useRef(0);
  const resizeStartHeight = useRef(0);
  const { addSource } = useSourceActions();

  // Resize handle: drag up = taller panel, drag down = shorter panel
  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
    resizeStartY.current = e.clientY;
    resizeStartHeight.current = bottomPanelHeight;
  }, [bottomPanelHeight]);

  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaY = resizeStartY.current - e.clientY; // up = positive
      const maxHeight = window.innerHeight * BOTTOM_PANEL_MAX_PERCENT;
      const next = Math.round(
        Math.min(maxHeight, Math.max(BOTTOM_PANEL_MIN, resizeStartHeight.current + deltaY))
      );
      setBottomPanelHeight(next);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    document.body.style.userSelect = "none";
    document.body.style.cursor = "ns-resize";
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizing]);

  // Scene store state for toolbar
  const canvasSettings = useSceneStore((s) => s.canvasSettings);
  const setAspectRatio = useSceneStore((s) => s.setAspectRatio);
  const applyScenePreset = useSceneStore((s) => s.applyScenePreset);
  const { sources, scene } = useActiveScene();
  const hasCamera = sources.some((s) => s.type === "camera");

  const handleAddSource = useCallback(
    (source: SceneSource) => {
      addSource({
        type: source.type as "window" | "screen" | "camera" | "image" | "text",
        sourceId: source.sourceId,
        name: source.name,
        x: source.x,
        y: source.y,
        width: source.width,
        height: source.height,
        visible: source.visible,
        locked: false,
      });
      setPickerOpen(false);
    },
    [addSource]
  );

  return (
    <div className="flex flex-col h-full no-select">
      {/* Post-recording banner (conditional) */}
      <PostRecordingBanner />

      {/* Toolbar — row 1: scenes + ratio; row 2: presets (when camera) */}
      <div className="shrink-0 flex flex-col border-b border-neutral-800 bg-neutral-900/50">
        {/* Row 1: Scene tabs + ratio selector */}
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="flex-1 min-w-0 overflow-x-auto">
            <SceneBar />
          </div>
          <div className="h-5 w-px bg-neutral-700/50 shrink-0" />
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs text-neutral-500">Ratio:</span>
            <select
              value={canvasSettings.aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value as AspectRatioPreset)}
              className="px-2 py-1 text-xs bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-300 focus:outline-none focus:border-blue-500"
            >
              <option value="16:9">16:9 — YouTube, Twitch</option>
              <option value="9:16">9:16 — TikTok, Reels, Shorts</option>
              <option value="4:5">4:5 — Instagram Portrait</option>
              <option value="1:1">1:1 — Instagram, X</option>
              <option value="4:3">4:3</option>
            </select>
          </div>
        </div>

        {/* Row 2: Scene presets — only when camera is present */}
        {hasCamera && (
          <div className="flex items-center gap-2 px-3 py-1.5 border-t border-neutral-800/80 bg-neutral-900/30">
            <ScenePresetPicker
              activePresetId={scene?.activePresetId ?? undefined}
              onSelect={applyScenePreset}
            />
          </div>
        )}
      </div>

      {/* Canvas preview — maximized */}
      <div className="flex-1 min-h-0 p-2">
        <SceneCanvas />
      </div>

      {/* Bottom panel — resizable via drag handle */}
      <div
        className="shrink-0 flex flex-col border-t border-neutral-800 bg-neutral-950"
        style={{ height: bottomPanelHeight }}
      >
        {/* Drag handle — top edge */}
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-valuenow={bottomPanelHeight}
          onMouseDown={handleResizeMouseDown}
          className={`flex items-center justify-center h-1.5 cursor-ns-resize border-b border-neutral-800 hover:bg-neutral-800/50 active:bg-neutral-700/50 transition-colors select-none ${
            isResizing ? "bg-neutral-700/50" : ""
          }`}
          title="Drag to resize"
        >
          <div className="w-8 h-0.5 rounded-full bg-neutral-600" />
        </div>

        {/* Panel content */}
        <div className="flex flex-1 min-h-0">
          {/* Sources — takes remaining width */}
          <div className="flex-1 min-w-0 border-r border-neutral-800 py-2 overflow-hidden">
            <SourceList onAddSourceClick={() => setPickerOpen(true)} />
          </div>

          {/* Recording controls — fixed width */}
          <div className="w-64 shrink-0">
            <RecordingControls />
          </div>
        </div>
      </div>

      {/* Source picker modal */}
      <SourcePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onAddSource={handleAddSource}
      />
    </div>
  );
}
