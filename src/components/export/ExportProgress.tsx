import { useEffect, useRef, useState, useCallback } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { Loader2, X, CheckCircle2, FolderOpen, Play } from "lucide-react";
import { useUIStore } from "@/stores/uiStore";

/** Payload emitted by the Rust `start_export` command via `export-progress` events. */
interface RustExportEvent {
  percent: number;
  done: boolean;
  error: string | null;
}

/** Internal progress state used by this component. */
interface ExportProgressData {
  percent: number;
  elapsed: number;
  estimated: number;
  status: string;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

function formatDuration(seconds: number): string {
  if (!seconds || seconds < 0) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ */
/* Props                                                                */
/* ------------------------------------------------------------------ */

interface ExportProgressProps {
  isVisible: boolean;
  onCancel: () => void;
  onComplete: () => void;
}

/* ------------------------------------------------------------------ */
/* Component                                                            */
/* ------------------------------------------------------------------ */

export default function ExportProgress({
  isVisible,
  onCancel,
  onComplete,
}: ExportProgressProps) {
  const [progress, setProgress] = useState<ExportProgressData>({
    percent: 0,
    elapsed: 0,
    estimated: 0,
    status: "Preparing...",
  });
  const [isComplete, setIsComplete] = useState(false);
  const unlistenRef = useRef<UnlistenFn | null>(null);

  // Track start time for ETA calculation
  const startTimeRef = useRef<number>(0);

  const exportOutputPath = useUIStore((s) => s.exportOutputPath);

  /* Listen to Tauri export-progress events */
  useEffect(() => {
    if (!isVisible) return;

    setIsComplete(false);
    setProgress({ percent: 0, elapsed: 0, estimated: 0, status: "Preparing..." });
    startTimeRef.current = Date.now();

    let cancelled = false;

    const setup = async () => {
      const unlisten = await listen<RustExportEvent>(
        "export-progress",
        (event) => {
          if (cancelled) return;
          const raw = event.payload;
          if (raw.error) {
            setProgress((prev) => ({ ...prev, percent: 0, status: `Error: ${raw.error}` }));
            setIsComplete(true);
            return;
          }
          const elapsedSec = (Date.now() - startTimeRef.current) / 1000;
          const pct = Math.max(raw.percent, 0.1); // avoid division by zero
          const estimatedTotalSec = pct > 0 ? (elapsedSec / pct) * 100 : 0;
          setProgress({
            percent: raw.percent,
            elapsed: elapsedSec,
            estimated: estimatedTotalSec,
            status: raw.done
              ? "Export complete"
              : `Exporting\u2026 ${raw.percent}%`,
          });
          if (raw.done || raw.percent >= 100) {
            setIsComplete(true);
          }
        }
      );
      if (!cancelled) {
        unlistenRef.current = unlisten;
      } else {
        unlisten();
      }
    };

    // Also tick elapsed time every second so the UI stays alive
    const elapsedInterval = setInterval(() => {
      if (cancelled) return;
      setProgress((prev) => {
        const elapsedSec = (Date.now() - startTimeRef.current) / 1000;
        const pct = Math.max(prev.percent, 0.1);
        const estimatedTotalSec = pct > 0 ? (elapsedSec / pct) * 100 : 0;
        return { ...prev, elapsed: elapsedSec, estimated: estimatedTotalSec };
      });
    }, 1000);

    setup();

    return () => {
      cancelled = true;
      clearInterval(elapsedInterval);
      unlistenRef.current?.();
      unlistenRef.current = null;
    };
  }, [isVisible]);

  /* Cancel export */
  const handleCancel = useCallback(async () => {
    try {
      await invoke("cancel_export");
    } catch (err) {
      console.error("Failed to cancel export:", err);
    }
    onCancel();
  }, [onCancel]);

  /* Open exported video with default player */
  const handleOpenVideo = useCallback(async () => {
    if (!exportOutputPath) return;
    try {
      await invoke("open_file", { path: exportOutputPath });
    } catch (err) {
      console.error("Failed to open video:", err);
    }
  }, [exportOutputPath]);

  /* Reveal in Finder */
  const handleOpenFolder = useCallback(async () => {
    if (!exportOutputPath) return;
    try {
      await invoke("reveal_in_finder", { path: exportOutputPath });
    } catch (err) {
      console.error("Failed to open folder:", err);
    }
  }, [exportOutputPath]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="w-[420px] rounded-xl bg-neutral-900 border border-neutral-700 shadow-2xl shadow-black/50 p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-neutral-100 flex items-center gap-2">
            {isComplete ? (
              <CheckCircle2 size={18} className="text-green-400" />
            ) : (
              <Loader2 size={18} className="text-blue-400 animate-spin" />
            )}
            {isComplete ? "Export Complete" : "Exporting..."}
          </h2>
          <button
            onClick={isComplete ? onComplete : handleCancel}
            className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 transition-interactive"
            title={isComplete ? "Close" : "Cancel export"}
          >
            <X size={16} />
          </button>
        </div>

        {/* Progress bar */}
        <div className="w-full h-2 rounded-full bg-neutral-800 overflow-hidden mb-4">
          <div
            className={`h-full rounded-full transition-all duration-300 ease-out ${
              isComplete ? "bg-green-500" : "bg-blue-500"
            }`}
            style={{ width: `${Math.min(100, progress.percent)}%` }}
          />
        </div>

        {/* Stats row */}
        <div className="flex items-center justify-between text-sm mb-4">
          <span className="text-neutral-300 font-mono tabular-nums">
            {Math.round(progress.percent)}%
          </span>
          <div className="flex items-center gap-4 text-neutral-500 text-xs">
            <span>
              Elapsed:{" "}
              <span className="text-neutral-300 font-mono">
                {formatDuration(progress.elapsed)}
              </span>
            </span>
            {!isComplete && progress.percent > 1 && (
              <span>
                Remaining:{" "}
                <span className="text-neutral-300 font-mono">
                  ~{formatDuration(Math.max(0, progress.estimated - progress.elapsed))}
                </span>
              </span>
            )}
          </div>
        </div>

        {/* Status text */}
        <p className="text-xs text-neutral-500 mb-5 truncate">
          {progress.status}
        </p>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          {isComplete ? (
            <>
              <button
                onClick={handleOpenFolder}
                className="px-4 py-2 rounded-lg text-sm font-medium text-neutral-300 bg-neutral-800 border border-neutral-700 hover:bg-neutral-750 hover:border-neutral-600 transition-interactive flex items-center gap-2"
              >
                <FolderOpen size={15} />
                Open Folder
              </button>
              <button
                onClick={handleOpenVideo}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 shadow-lg shadow-blue-600/20 transition-interactive flex items-center gap-2"
              >
                <Play size={15} />
                Open Video
              </button>
            </>
          ) : (
            <button
              onClick={handleCancel}
              className="px-4 py-2 rounded-lg text-sm font-medium text-neutral-300 bg-neutral-800 border border-neutral-700 hover:bg-neutral-750 hover:border-neutral-600 transition-interactive"
            >
              Cancel Export
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
