import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useOverlayWindow } from "@/hooks/useOverlayWindow";
import { FolderOpen, Film, X, CheckCircle2 } from "lucide-react";
import RecordingControls from "@/components/recorder/RecordingControls";
import SceneBar from "@/components/recorder/SceneBar";
import SceneCanvas from "@/components/recorder/SceneCanvas";
import SourceList from "@/components/recorder/SourceList";
import SourcePicker from "@/components/recorder/SourcePicker";
import { useRecorderStore } from "@/stores/recorderStore";
import { useUIStore } from "@/stores/uiStore";
import { useEditorStore } from "@/stores/editorStore";
import { useSourceActions } from "@/hooks/useSourceActions";
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

    createProjectFromRecording(videoPath, durationSec, zoomEffects, cameraOverlay);
    setActiveView("editor");
    clearLastRecording();
  }, [
    lastRecordingPath,
    lastCameraPath,
    lastCameraLayout,
    lastSyncOffset,
    lastRecordingDuration,
    createProjectFromRecording,
    setActiveView,
    clearLastRecording,
  ]);

  if (!lastRecordingPath) return null;

  return (
    <div className="shrink-0 flex items-center gap-3 p-3 rounded-xl bg-green-500/10 border border-green-500/20">
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

export default function RecorderView() {
  useOverlayWindow();

  const [pickerOpen, setPickerOpen] = useState(false);
  const { addSource } = useSourceActions();

  const handleAddSource = useCallback(
    (source: SceneSource) => {
      // Convert SceneSource from capture types to scene store Source
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
    <div className="flex flex-col h-full p-4 gap-4 no-select">
      {/* Header with title and scene bar */}
      <header className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold text-neutral-100">Recorder</h1>
        </div>
        <SceneBar />
      </header>

      {/* Post-recording banner */}
      <PostRecordingBanner />

      {/* Main content area */}
      <div className="flex-1 flex flex-col gap-3 min-h-0">
        {/* Canvas area */}
        <div className="flex-1 min-h-0">
          <SceneCanvas />
        </div>

        {/* Source list panel (Streamlabs-style) */}
        <div className="shrink-0 h-36 bg-neutral-900/60 rounded-xl border border-neutral-800 py-2">
          <SourceList onAddSourceClick={() => setPickerOpen(true)} />
        </div>
      </div>

      {/* Recording controls bar */}
      <footer className="shrink-0 border-t border-neutral-800 pt-2">
        <RecordingControls />
      </footer>

      {/* Source picker modal */}
      <SourcePicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onAddSource={handleAddSource}
      />
    </div>
  );
}
