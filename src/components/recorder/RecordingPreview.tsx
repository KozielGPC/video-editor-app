import { useEffect, useRef, useState, useCallback } from "react";
import { Monitor, Camera, VideoOff, ScreenShare, GripVertical } from "lucide-react";
import { useRecorderStore } from "@/stores/recorderStore";
import { useSettingsStore } from "@/stores/settingsStore";

// ────────────────────────────────────────────────────────────────────────────
// Screen stream hook (getDisplayMedia)
// ────────────────────────────────────────────────────────────────────────────

function useScreenStream(enabled: boolean) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);

  const stopStream = useCallback(() => {
    setStream((prev) => {
      prev?.getTracks().forEach((t) => t.stop());
      return null;
    });
    setError(null);
  }, []);

  const requestStream = useCallback(async () => {
    if (!enabled || isRequesting) return;
    setIsRequesting(true);
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: false,
      });
      s.getVideoTracks()[0]?.addEventListener("ended", () => {
        setStream(null);
      });
      setStream(s);
      setError(null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Screen share denied";
      setError(msg);
    } finally {
      setIsRequesting(false);
    }
  }, [enabled, isRequesting]);

  useEffect(() => {
    if (!enabled) {
      stopStream();
    }
  }, [enabled, stopStream]);

  useEffect(() => {
    return () => stopStream();
  }, [stopStream]);

  return { stream, error, requestStream, stopStream, isRequesting };
}

// ────────────────────────────────────────────────────────────────────────────
// Camera stream hook (getUserMedia)
// ────────────────────────────────────────────────────────────────────────────

function useCameraStream(enabled: boolean) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) {
      setStream((prev) => {
        prev?.getTracks().forEach((t) => t.stop());
        return null;
      });
      setError(null);
      return;
    }

    let cancelled = false;
    let activeStream: MediaStream | null = null;

    navigator.mediaDevices
      .getUserMedia({
        video: { facingMode: "user", width: 640, height: 480 },
      })
      .then((s) => {
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        activeStream = s;
        setStream(s);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message ?? "Camera access denied");
        }
      });

    return () => {
      cancelled = true;
      activeStream?.getTracks().forEach((t) => t.stop());
      setStream(null);
    };
  }, [enabled]);

  return { stream, error };
}

// ────────────────────────────────────────────────────────────────────────────
// Video element that shows a MediaStream
// ────────────────────────────────────────────────────────────────────────────

function StreamVideo({
  stream,
  mirror,
  className,
}: {
  stream: MediaStream;
  mirror?: boolean;
  className?: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
    }
    return () => {
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [stream]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted
      className={className}
      style={mirror ? { transform: "scaleX(-1)" } : undefined}
    />
  );
}

// ────────────────────────────────────────────────────────────────────────────
// OBS-style draggable/resizable webcam overlay
// ────────────────────────────────────────────────────────────────────────────

function WebcamOverlay({
  hasScreen,
  cameraStream,
  cameraError,
}: {
  hasScreen: boolean;
  cameraStream: MediaStream | null;
  cameraError: string | null;
}) {
  const layout = useSettingsStore((s) => s.webcamLayout);
  const setWebcamLayout = useSettingsStore((s) => s.setWebcamLayout);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragStart = useRef({ mouseX: 0, mouseY: 0, x: 0, y: 0 });
  const resizeStart = useRef({ mouseX: 0, mouseY: 0, width: 0, height: 0 });

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (!hasScreen || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(true);
      dragStart.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        x: layout.x,
        y: layout.y,
      };
    },
    [hasScreen, layout.x, layout.y],
  );

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      if (!hasScreen || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      setIsResizing(true);
      resizeStart.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        width: layout.width,
        height: layout.height,
      };
    },
    [hasScreen, layout.width, layout.height],
  );

  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const onMove = (e: MouseEvent) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();

      if (isDragging) {
        const dx = ((e.clientX - dragStart.current.mouseX) / rect.width) * 100;
        const dy = ((e.clientY - dragStart.current.mouseY) / rect.height) * 100;
        const newX = Math.max(0, Math.min(100 - layout.width, dragStart.current.x + dx));
        const newY = Math.max(0, Math.min(100 - layout.height, dragStart.current.y + dy));
        setWebcamLayout({ x: newX, y: newY });
      } else if (isResizing) {
        const dx = ((e.clientX - resizeStart.current.mouseX) / rect.width) * 100;
        const dy = ((e.clientY - resizeStart.current.mouseY) / rect.height) * 100;
        const newW = Math.max(5, Math.min(50, resizeStart.current.width + dx));
        const newH = Math.max(5, Math.min(50, resizeStart.current.height + dy));
        setWebcamLayout({ width: newW, height: newH });
      }
    };

    const onUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isDragging, isResizing, layout.width, layout.height, setWebcamLayout]);

  if (!hasScreen) {
    return (
      <div className="absolute inset-0">
        {cameraStream ? (
          <StreamVideo
            stream={cameraStream}
            mirror
            className="w-full h-full object-contain bg-black"
          />
        ) : cameraError ? (
          <div className="flex flex-col items-center justify-center gap-2 w-full h-full bg-neutral-900">
            <VideoOff size={32} className="text-neutral-600" />
            <span className="text-xs text-neutral-500">Camera unavailable</span>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 w-full h-full bg-neutral-900">
            <Camera size={32} className="text-neutral-600 animate-pulse" />
            <span className="text-xs text-neutral-500">Connecting camera...</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 pointer-events-none"
      aria-hidden
    >
      <div
        className={`absolute overflow-hidden rounded-xl shadow-2xl shadow-black/60 border-2 z-10
        ${isDragging || isResizing ? "border-blue-500 ring-2 ring-blue-500/30" : "border-neutral-700/60"}
        pointer-events-auto cursor-grab active:cursor-grabbing`}
        style={{
          left: `${layout.x}%`,
          top: `${layout.y}%`,
          width: `${layout.width}%`,
          height: `${layout.height}%`,
        }}
        onMouseDown={handleDragStart}
      >
        {cameraStream ? (
          <StreamVideo
            stream={cameraStream}
            mirror
            className="w-full h-full object-cover rounded-[inherit]"
          />
        ) : cameraError ? (
          <div className="flex flex-col items-center justify-center gap-2 w-full h-full bg-neutral-900 rounded-[inherit]">
            <VideoOff size={18} className="text-neutral-600" />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 w-full h-full bg-neutral-900 rounded-[inherit]">
            <Camera size={18} className="text-neutral-600 animate-pulse" />
          </div>
        )}

        {/* Drag handle hint */}
        <div className="absolute top-1 left-1 px-1.5 py-0.5 rounded bg-black/50 text-[10px] text-neutral-400 flex items-center gap-1 pointer-events-none">
          <GripVertical size={10} />
          Drag to move
        </div>

        {/* Resize handle (bottom-right corner) */}
        <div
          className="absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
          style={{ background: "linear-gradient(135deg, transparent 50%, rgba(59,130,246,0.6) 50%)" }}
          onMouseDown={handleResizeStart}
        />
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Main Preview Component
// ────────────────────────────────────────────────────────────────────────────

export default function RecordingPreview() {
  const recordingState = useRecorderStore((s) => s.recordingState);
  const selectedScreenId = useRecorderStore((s) => s.selectedScreenId);
  const selectedCameraId = useRecorderStore((s) => s.selectedCameraId);

  const isIdle = recordingState === "idle";
  const isRecording = recordingState === "recording";
  const hasScreen = selectedScreenId !== null;
  const hasCamera = selectedCameraId !== null;
  const hasAny = hasScreen || hasCamera;

  const {
    stream: screenStream,
    requestStream: requestScreenStream,
    stopStream: stopScreenStream,
    isRequesting,
  } = useScreenStream(hasScreen);
  const { stream: cameraStream, error: cameraError } =
    useCameraStream(hasCamera);

  useEffect(() => {
    const handler = () => {
      if (useRecorderStore.getState().selectedScreenId === null) return;
      stopScreenStream();
      if (!isRequesting) {
        requestScreenStream();
      }
    };
    window.addEventListener("request-screen-stream", handler);
    return () => window.removeEventListener("request-screen-stream", handler);
  }, [stopScreenStream, requestScreenStream, isRequesting]);

  return (
    <div className="relative flex-1 flex items-center justify-center bg-black rounded-xl border border-neutral-800 overflow-hidden min-h-[300px]">
      {/* No sources selected */}
      {!hasAny && isIdle && (
        <div className="flex flex-col items-center gap-4 text-neutral-500">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-xl bg-neutral-800 border border-neutral-700 flex items-center justify-center">
              <Monitor size={24} className="text-neutral-500" />
            </div>
            <div className="w-14 h-14 rounded-xl bg-neutral-800 border border-neutral-700 flex items-center justify-center">
              <Camera size={24} className="text-neutral-500" />
            </div>
          </div>
          <p className="text-sm">Select sources and press Record to begin</p>
        </div>
      )}

      {/* Composited preview -- this mirrors what the final video will look like */}
      {hasAny && (
        <div className="relative w-full h-full">
          {/* Screen layer (full frame) */}
          {hasScreen && (
            <>
              {screenStream ? (
                <StreamVideo
                  stream={screenStream}
                  className="absolute inset-0 w-full h-full object-contain bg-black"
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-neutral-900/80">
                  <ScreenShare
                    size={40}
                    className="text-neutral-500"
                    strokeWidth={1.5}
                  />
                  <p className="text-sm text-neutral-400 text-center max-w-xs">
                    Click below to start screen preview
                  </p>
                  <button
                    onClick={requestScreenStream}
                    className="px-4 py-2 text-sm font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
                  >
                    Share Screen
                  </button>
                  <p className="text-xs text-neutral-600">
                    FFmpeg will capture the screen separately during recording
                  </p>
                </div>
              )}
            </>
          )}

          {/* Camera layer (PiP overlay when screen is active, full when camera-only) */}
          {hasCamera && (
            <WebcamOverlay
              hasScreen={hasScreen}
              cameraStream={cameraStream}
              cameraError={cameraError}
            />
          )}
        </div>
      )}
    </div>
  );
}
