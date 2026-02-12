import { useCallback } from "react";
import { Square, Pause, Play, Mic, MicOff, ChevronDown, Check } from "lucide-react";
import * as Select from "@radix-ui/react-select";
import { useRecorderStore } from "@/stores/recorderStore";
import { useActiveScene } from "@/hooks/useActiveScene";

function formatTime(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

/** Compact microphone selector dropdown */
function MicSelector() {
  const microphones = useRecorderStore((s) => s.microphones);
  const selectedMicId = useRecorderStore((s) => s.selectedMicId);
  const selectMic = useRecorderStore((s) => s.selectMic);
  const recordingState = useRecorderStore((s) => s.recordingState);
  const isDisabled = recordingState !== "idle";
  const hasMic = selectedMicId !== null && selectedMicId !== "__none__";
  const displayName =
    hasMic
      ? microphones.find((m) => m.id === selectedMicId)?.name ?? "Microphone"
      : "No Mic";
  return (
    <Select.Root
      value={selectedMicId ?? "__none__"}
      onValueChange={(v) => selectMic(v === "__none__" ? null : v)}
      disabled={isDisabled}
    >
      <Select.Trigger
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-neutral-800 border border-neutral-700 text-xs text-neutral-300 cursor-pointer hover:bg-neutral-700 hover:border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 max-w-[180px]"
      >
        <span className="shrink-0 text-neutral-400">
          {hasMic ? <Mic size={13} /> : <MicOff size={13} />}
        </span>
        <Select.Value>
          <span className="truncate">{displayName}</span>
        </Select.Value>
        <Select.Icon className="text-neutral-500 shrink-0">
          <ChevronDown size={12} />
        </Select.Icon>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={6}
          side="top"
          className="z-50 min-w-[180px] overflow-hidden rounded-lg bg-neutral-800 border border-neutral-700 shadow-xl shadow-black/40"
        >
          <Select.Viewport className="p-1">
            <Select.Item
              value="__none__"
              className="flex items-center gap-2 px-3 py-2 rounded-md text-xs text-neutral-400 cursor-pointer outline-none data-[highlighted]:bg-neutral-700 data-[highlighted]:text-neutral-100"
            >
              <Select.ItemIndicator className="w-3.5 shrink-0">
                <Check size={12} />
              </Select.ItemIndicator>
              <Select.ItemText>None</Select.ItemText>
            </Select.Item>
            {microphones.length > 0 && (
              <Select.Separator className="h-px my-1 bg-neutral-700" />
            )}
            {microphones.map((mic) => (
              <Select.Item
                key={mic.id}
                value={mic.id}
                className="flex items-center gap-2 px-3 py-2 rounded-md text-xs text-neutral-200 cursor-pointer outline-none data-[highlighted]:bg-neutral-700 data-[highlighted]:text-neutral-100"
              >
                <Select.ItemIndicator className="w-3.5 shrink-0">
                  <Check size={12} />
                </Select.ItemIndicator>
                <Select.ItemText>
                  <span className="truncate">{mic.name}</span>
                </Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

export default function RecordingControls() {
  const recordingState = useRecorderStore((s) => s.recordingState);
  const elapsedTime = useRecorderStore((s) => s.elapsedTime);
  const startRecording = useRecorderStore((s) => s.startRecording);
  const pauseRecording = useRecorderStore((s) => s.pauseRecording);
  const resumeRecording = useRecorderStore((s) => s.resumeRecording);
  const stopRecording = useRecorderStore((s) => s.stopRecording);

  // Get sources from active scene instead of recorderStore
  const { sources, sourceCount } = useActiveScene();

  // Check if we have any visible sources to record
  const visibleSources = sources.filter((s) => s.visible);
  const hasRecordableSources = visibleSources.length > 0;

  // Identify specific source types for recording
  const hasScreen = visibleSources.some(
    (s) => s.type === "screen" || s.type === "window"
  );
  const hasCamera = visibleSources.some((s) => s.type === "camera");

  const isIdle = recordingState === "idle";
  const isRecording = recordingState === "recording";
  const isPaused = recordingState === "paused";
  const isProcessing = recordingState === "processing";

  const handleStart = useCallback(async () => {
    if (!hasRecordableSources) return;

    // TODO: Pass scene configuration to backend
    // For now, we'll extract the first screen/camera sources to use
    const screenSource = visibleSources.find(
      (s) => s.type === "screen" || s.type === "window"
    );
    const cameraSource = visibleSources.find((s) => s.type === "camera");

    // Update recorderStore with selected sources before starting
    // This maintains backward compatibility with the existing recording flow
    if (screenSource) {
      useRecorderStore
        .getState()
        .selectScreen(
          typeof screenSource.sourceId === "number"
            ? String(screenSource.sourceId)
            : screenSource.sourceId
        );
    }
    if (cameraSource) {
      useRecorderStore
        .getState()
        .selectCamera(
          typeof cameraSource.sourceId === "number"
            ? String(cameraSource.sourceId)
            : cameraSource.sourceId
        );
    }

    // Auto-select first available microphone if none selected
    const recorderState = useRecorderStore.getState();
    if (!recorderState.selectedMicId && recorderState.microphones.length > 0) {
      recorderState.selectMic(recorderState.microphones[0].id);
    }

    await startRecording();
  }, [hasRecordableSources, visibleSources, startRecording]);

  const handleStop = useCallback(async () => {
    await stopRecording();
  }, [stopRecording]);

  const handlePause = useCallback(async () => {
    await pauseRecording();
  }, [pauseRecording]);

  const handleResume = useCallback(async () => {
    await resumeRecording();
  }, [resumeRecording]);

  return (
    <div className="relative flex items-center justify-center gap-5 py-4">
      {/* Mic selector — always visible on the left */}
      <div className="absolute left-4 top-1/2 -translate-y-1/2">
        <MicSelector />
      </div>

      {!isIdle && (
        <div className="flex items-center gap-2 mr-4">
          <span
            className={`inline-block w-2.5 h-2.5 rounded-full ${
              isProcessing
                ? "bg-blue-500 animate-pulse"
                : isRecording
                ? "bg-red-500 animate-pulse-recording"
                : "bg-yellow-500"
            }`}
          />
          <span className="font-mono text-lg tabular-nums text-neutral-100">
            {isProcessing ? "Processing..." : formatTime(elapsedTime)}
          </span>
        </div>
      )}

      {isIdle ? (
        <button
          onClick={handleStart}
          disabled={!hasRecordableSources}
          title={
            hasRecordableSources
              ? "Start Recording (⌘⇧R)"
              : "Add sources to scene first"
          }
          className="relative flex items-center justify-center w-16 h-16 rounded-full bg-red-500 hover:bg-red-400 active:bg-red-600 shadow-lg shadow-red-500/30 hover:shadow-red-400/40 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none group"
        >
          <span className="w-6 h-6 rounded-full bg-white/90 group-hover:scale-110 transition-transform" />
        </button>
      ) : isProcessing ? (
        <div className="flex items-center justify-center w-16 h-16 rounded-full bg-neutral-800 border-2 border-blue-500 opacity-60">
          <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <button
          onClick={handleStop}
          title="Stop Recording (⌘⇧R)"
          className="flex items-center justify-center w-16 h-16 rounded-full bg-neutral-800 border-2 border-red-500 hover:bg-neutral-700 active:bg-neutral-600 shadow-lg transition-all duration-200"
        >
          <Square size={22} className="text-red-500" fill="currentColor" />
        </button>
      )}

      {!isIdle && !isProcessing && (
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
          {!hasRecordableSources ? (
            <span className="text-yellow-500">
              Add sources to the scene to record
            </span>
          ) : (
            <>
              <span className="text-neutral-400 mb-1">
                {sourceCount} source{sourceCount !== 1 ? "s" : ""} ready
                {hasScreen && hasCamera
                  ? " (screen + camera)"
                  : hasScreen
                  ? " (screen)"
                  : hasCamera
                  ? " (camera)"
                  : ""}
              </span>
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
            </>
          )}
        </div>
      )}
    </div>
  );
}
