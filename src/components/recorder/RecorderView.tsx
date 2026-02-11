import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useOverlayWindow } from "@/hooks/useOverlayWindow";
import { FolderOpen, Film, X, CheckCircle2 } from "lucide-react";
import SourceSelector from "@/components/recorder/SourceSelector";
import RecordingControls from "@/components/recorder/RecordingControls";
import RecordingPreview from "@/components/recorder/RecordingPreview";
import { useRecorderStore } from "@/stores/recorderStore";
import { useUIStore } from "@/stores/uiStore";
import { useEditorStore } from "@/stores/editorStore";
import type { Effect } from "@/types/project";

/** Zoom marker as returned by the Rust backend (start_ms/end_ms = zoom in/out) */
interface ZoomMarker {
  start_ms: number;
  end_ms: number;
  x: number;
  y: number;
  scale: number;
}

/** Load zoom markers via Tauri command and convert to Effect[] */
async function loadZoomEffects(recordingPath: string): Promise<Effect[]> {
  try {
    const markers = await invoke<ZoomMarker[]>("read_zoom_markers", {
      recordingPath,
    });
    return markers
      .filter((m) => m.end_ms > m.start_ms)
      .map((m) => ({
        type: "zoom" as const,
        startTime: m.start_ms / 1000,
        duration: (m.end_ms - m.start_ms) / 1000,
        params: {
          scale: m.scale,
          x: m.x,
          y: m.y,
        },
      }));
  } catch (err) {
    console.warn("Failed to load zoom markers:", err);
    return [];
  }
}

function PostRecordingBanner() {
  const lastRecordingPath = useRecorderStore((s) => s.lastRecordingPath);
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
      await invoke("plugin:shell|open", {
        path: lastRecordingPath.substring(
          0,
          lastRecordingPath.lastIndexOf("/"),
        ),
      });
    } catch (err) {
      console.error("Failed to reveal in Finder:", err);
    }
  }, [lastRecordingPath]);

  const handleOpenInEditor = useCallback(async () => {
    if (!lastRecordingPath) return;
    const durationSec = Math.max(lastRecordingDuration, 5);
    // Load zoom markers from the sidecar file and convert to effects
    const zoomEffects = await loadZoomEffects(lastRecordingPath);
    createProjectFromRecording(lastRecordingPath, durationSec, zoomEffects);
    setActiveView("editor");
    clearLastRecording();
  }, [
    lastRecordingPath,
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

  return (
    <div className="flex flex-col h-full p-4 gap-4 no-select">
      {/* Header with source selectors */}
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-neutral-100">Recorder</h1>
      </header>

      {/* Post-recording banner */}
      <PostRecordingBanner />

      {/* Source selectors row */}
      <section className="shrink-0">
        <SourceSelector />
      </section>

      {/* Preview area (takes remaining space) */}
      <RecordingPreview />

      {/* Recording controls bar */}
      <footer className="shrink-0 border-t border-neutral-800 pt-2">
        <RecordingControls />
      </footer>
    </div>
  );
}
