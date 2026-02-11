import { useCallback } from "react";
import { Square, Pause, Play } from "lucide-react";
import { useRecorderStore } from "@/stores/recorderStore";

function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

export default function RecordingControls() {
  const recordingState = useRecorderStore((s) => s.recordingState);
  const elapsedTime = useRecorderStore((s) => s.elapsedTime);
  const selectedScreenId = useRecorderStore((s) => s.selectedScreenId);
  const selectedCameraId = useRecorderStore((s) => s.selectedCameraId);
  const startRecording = useRecorderStore((s) => s.startRecording);
  const pauseRecording = useRecorderStore((s) => s.pauseRecording);
  const resumeRecording = useRecorderStore((s) => s.resumeRecording);
  const stopRecording = useRecorderStore((s) => s.stopRecording);

  const isIdle = recordingState === "idle";
  const isRecording = recordingState === "recording";
  const isPaused = recordingState === "paused";

  const handleStart = useCallback(async () => {
    if (!selectedScreenId && !selectedCameraId) return;
    await startRecording();
  }, [selectedScreenId, selectedCameraId, startRecording]);

  const handleStop = useCallback(async () => {
    await stopRecording();
  }, [stopRecording]);

  const handlePause = useCallback(async () => {
    await pauseRecording();
  }, [pauseRecording]);

  const handleResume = useCallback(async () => {
    await resumeRecording();
  }, [resumeRecording]);

  const noSource = !selectedScreenId && !selectedCameraId;

  return (
    <div className="flex items-center justify-center gap-5 py-4">
      {!isIdle && (
        <div className="flex items-center gap-2 mr-4">
          <span
            className={`inline-block w-2.5 h-2.5 rounded-full ${
              isRecording
                ? "bg-red-500 animate-pulse-recording"
                : "bg-yellow-500"
            }`}
          />
          <span className="font-mono text-lg tabular-nums text-neutral-100">
            {formatTime(elapsedTime)}
          </span>
        </div>
      )}

      {isIdle ? (
        <button
          onClick={handleStart}
          disabled={noSource}
          title="Start Recording (⌘⇧R)"
          className="relative flex items-center justify-center w-16 h-16 rounded-full bg-red-500 hover:bg-red-400 active:bg-red-600 shadow-lg shadow-red-500/30 hover:shadow-red-400/40 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none group"
        >
          <span className="w-6 h-6 rounded-full bg-white/90 group-hover:scale-110 transition-transform" />
        </button>
      ) : (
        <button
          onClick={handleStop}
          title="Stop Recording (⌘⇧R)"
          className="flex items-center justify-center w-16 h-16 rounded-full bg-neutral-800 border-2 border-red-500 hover:bg-neutral-700 active:bg-neutral-600 shadow-lg transition-all duration-200"
        >
          <Square size={22} className="text-red-500" fill="currentColor" />
        </button>
      )}

      {!isIdle && (
        <button
          onClick={isPaused ? handleResume : handlePause}
          title={`${isPaused ? "Resume" : "Pause"} (⌘⇧P)`}
          className="flex items-center justify-center w-12 h-12 rounded-full bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 hover:border-neutral-600 active:bg-neutral-600 transition-all duration-200"
        >
          {isPaused ? (
            <Play size={18} className="text-neutral-200 ml-0.5" />
          ) : (
            <Pause size={18} className="text-neutral-200" />
          )}
        </button>
      )}

      {isIdle && (
        <div className="flex flex-col text-xs text-neutral-500 ml-4 gap-0.5">
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-400 text-[10px] font-mono">
              ⌘⇧R
            </kbd>{" "}
            Record
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-400 text-[10px] font-mono">
              ⌘⇧P
            </kbd>{" "}
            Pause
          </span>
          <span>
            <kbd className="px-1.5 py-0.5 rounded bg-neutral-800 border border-neutral-700 text-neutral-400 text-[10px] font-mono">
              ⌘⇧Z
            </kbd>{" "}
            Zoom at cursor
          </span>
        </div>
      )}
    </div>
  );
}
