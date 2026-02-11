import { useEffect, useRef, useState, useCallback } from "react";
import { Monitor, Camera, VideoOff, ScreenShare } from "lucide-react";
import { useRecorderStore } from "@/stores/recorderStore";

// ────────────────────────────────────────────────────────────────────────────
// Screen stream hook (getDisplayMedia)
// ────────────────────────────────────────────────────────────────────────────

function useScreenStream(enabled: boolean) {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);

  const requestStream = useCallback(async () => {
    if (!enabled || isRequesting) return;
    setIsRequesting(true);
    try {
      const s = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: false,
      });
      // Handle user stopping the screen share via browser UI
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

  // Stop stream when disabled
  useEffect(() => {
    if (!enabled) {
      setStream((prev) => {
        prev?.getTracks().forEach((t) => t.stop());
        return null;
      });
      setError(null);
    }
  }, [enabled]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      setStream((prev) => {
        prev?.getTracks().forEach((t) => t.stop());
        return null;
      });
    };
  }, []);

  return { stream, error, requestStream, isRequesting };
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
  } = useScreenStream(hasScreen);
  const { stream: cameraStream, error: cameraError } =
    useCameraStream(hasCamera);

  return (
    <div className="relative flex-1 flex items-center justify-center bg-black rounded-xl border border-neutral-800 overflow-hidden min-h-[300px]">
      {/* Recording indicator overlay */}
      {!isIdle && (
        <div className="absolute top-4 left-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-sm border border-neutral-700/50">
          <span
            className={`inline-block w-2 h-2 rounded-full ${
              isRecording
                ? "bg-red-500 animate-pulse-recording"
                : "bg-yellow-500"
            }`}
          />
          <span className="text-xs font-semibold tracking-wider text-neutral-200 uppercase">
            {isRecording ? "REC" : "Paused"}
          </span>
        </div>
      )}

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
            <div
              className={`overflow-hidden ${
                hasScreen
                  ? "absolute bottom-4 right-4 w-[200px] h-[150px] rounded-xl shadow-2xl shadow-black/60 border-2 border-neutral-700/60 z-10"
                  : "absolute inset-0"
              }`}
            >
              {cameraStream ? (
                <StreamVideo
                  stream={cameraStream}
                  mirror
                  className={`w-full h-full ${
                    hasScreen ? "object-cover" : "object-contain bg-black"
                  } rounded-[inherit]`}
                />
              ) : cameraError ? (
                <div className="flex flex-col items-center justify-center gap-2 w-full h-full bg-neutral-900">
                  <VideoOff
                    size={hasScreen ? 18 : 32}
                    className="text-neutral-600"
                  />
                  {!hasScreen && (
                    <span className="text-xs text-neutral-500">
                      Camera unavailable
                    </span>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-2 w-full h-full bg-neutral-900">
                  <Camera
                    size={hasScreen ? 18 : 32}
                    className="text-neutral-600 animate-pulse"
                  />
                  {!hasScreen && (
                    <span className="text-xs text-neutral-500">
                      Connecting camera...
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
