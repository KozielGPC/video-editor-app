import { useEffect, useRef, useState, useCallback } from "react";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { Loader2, X, CheckCircle2 } from "lucide-react";
import type { ExportProgress as ExportProgressData } from "@/types/project";

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

  /* Listen to Tauri export-progress events */
  useEffect(() => {
    if (!isVisible) return;

    setIsComplete(false);
    setProgress({ percent: 0, elapsed: 0, estimated: 0, status: "Preparing..." });

    let cancelled = false;

    const setup = async () => {
      const unlisten = await listen<ExportProgressData>(
        "export-progress",
        (event) => {
          if (cancelled) return;

          const data = event.payload;
          setProgress(data);

          if (data.percent >= 100) {
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

    setup();

    return () => {
      cancelled = true;
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

  /* Complete */
  const handleDone = useCallback(() => {
    onComplete();
  }, [onComplete]);

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
          {!isComplete && (
            <button
              onClick={handleCancel}
              className="p-1.5 rounded-md text-neutral-400 hover:text-neutral-100 hover:bg-neutral-800 transition-interactive"
              title="Cancel export"
            >
              <X size={16} />
            </button>
          )}
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
            {!isComplete && progress.estimated > 0 && (
              <span>
                Remaining:{" "}
                <span className="text-neutral-300 font-mono">
                  {formatDuration(progress.estimated - progress.elapsed)}
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
            <button
              onClick={handleDone}
              className="px-5 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 shadow-lg shadow-blue-600/20 transition-interactive"
            >
              Done
            </button>
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
