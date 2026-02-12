/**
 * useCaptureStream - Hook to manage live frame capture for scene sources
 *
 * This hook handles:
 * - Starting capture streams for each source
 * - Polling frames or listening to Tauri events
 * - Cleaning up captures when sources are removed
 * - Providing frames as a Map<sourceId, base64Frame>
 */

import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Source } from "@/stores/sceneStore";

/* ── Types ─────────────────────────────────────────────────────── */

/** Frame data received from backend events */
export interface FrameData {
  sourceId: string;
  frame: string; // base64 JPEG/PNG
  timestamp: number;
  width?: number;
  height?: number;
}

/** Capture status for a source */
export interface CaptureStatus {
  isCapturing: boolean;
  error: string | null;
  lastFrameTime: number | null;
  fps: number;
}

/** Options for the capture stream hook */
export interface CaptureStreamOptions {
  /** Target FPS for frame polling (default: 15) */
  targetFps?: number;
  /** Use event-based streaming if available (default: true) */
  useEvents?: boolean;
  /** Enable capture on mount (default: true) */
  autoStart?: boolean;
  /** Max frame width for performance (default: 720) */
  maxFrameWidth?: number;
}

/* ── Constants ─────────────────────────────────────────────────── */

const DEFAULT_FPS = 15;
const DEFAULT_MAX_FRAME_WIDTH = 720;
const FRAME_EVENT_NAME = "source-frame";

/* ── Global camera registry ───────────────────────────────────── */

/**
 * Module-level registry of active browser camera streams.
 * Camera stays active during recording (no FFmpeg camera capture).
 * The recorder store reads this to feed MediaRecorder for camera recording.
 */
const activeCameraStreams = new Map<string, MediaStream>();

/**
 * Get the first active camera MediaStream (for browser-side recording).
 * Returns null if no camera is currently streaming.
 */
export function getActiveCameraStream(): MediaStream | null {
  const entries = Array.from(activeCameraStreams.values());
  return entries.length > 0 ? entries[0] : null;
}

/* ── Helper: Check if backend supports streaming ───────────────── */

let backendSupportsStreaming: boolean | null = null;

async function checkStreamingSupport(): Promise<boolean> {
  if (backendSupportsStreaming !== null) {
    return backendSupportsStreaming;
  }

  try {
    // Try to invoke a command that only exists if streaming is implemented
    await invoke("get_capture_capabilities");
    backendSupportsStreaming = true;
  } catch {
    // Command doesn't exist - streaming not implemented yet
    backendSupportsStreaming = false;
  }

  return backendSupportsStreaming;
}

/* ── Main Hook ─────────────────────────────────────────────────── */

/**
 * Hook to manage capture streaming for scene sources.
 *
 * Returns a Map of sourceId to the latest frame (base64 string) and status info.
 * For cameras, also returns MediaStream objects for direct video rendering.
 *
 * @param sources - Array of Source objects from the scene store
 * @param options - Configuration options
 */
export function useCaptureStream(
  sources: Source[],
  options: CaptureStreamOptions = {}
): {
  frames: Map<string, string>;
  streams: Map<string, MediaStream>;
  status: Map<string, CaptureStatus>;
  startCapture: (sourceId: string) => Promise<void>;
  stopCapture: (sourceId: string) => Promise<void>;
  refreshFrame: (sourceId: string) => Promise<void>;
} {
  const {
    targetFps = DEFAULT_FPS,
    useEvents = true,
    autoStart = true,
    maxFrameWidth = DEFAULT_MAX_FRAME_WIDTH,
  } = options;

  // State
  const [frames, setFrames] = useState<Map<string, string>>(() => new Map());
  const [streams, setStreams] = useState<Map<string, MediaStream>>(() => new Map());
  const [status, setStatus] = useState<Map<string, CaptureStatus>>(() => new Map());

  // Refs for cleanup and stable references
  const pollIntervalsRef = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const activeSourcesRef = useRef<Set<string>>(new Set());
  const unlistenRef = useRef<UnlistenFn | null>(null);
  const frameTimesRef = useRef<Map<string, number[]>>(new Map());
  const sourcesRef = useRef<Source[]>(sources);
  const cameraStreamsRef = useRef<Map<string, MediaStream>>(new Map());

  // Keep sources ref updated
  useEffect(() => {
    sourcesRef.current = sources;
  }, [sources]);

  // Calculate FPS from frame times
  const calculateFps = useCallback((sourceId: string): number => {
    const times = frameTimesRef.current.get(sourceId) || [];
    if (times.length < 2) return 0;

    const duration = times[times.length - 1] - times[0];
    if (duration <= 0) return 0;

    return Math.round((times.length - 1) / (duration / 1000));
  }, []);

  // Update status for a source
  const updateStatus = useCallback(
    (sourceId: string, updates: Partial<CaptureStatus>) => {
      setStatus((prev) => {
        const newStatus = new Map(prev);
        const current = newStatus.get(sourceId) || {
          isCapturing: false,
          error: null,
          lastFrameTime: null,
          fps: 0,
        };
        newStatus.set(sourceId, { ...current, ...updates });
        return newStatus;
      });
    },
    []
  );

  // Record frame time for FPS calculation
  const recordFrameTime = useCallback(
    (sourceId: string) => {
      const now = Date.now();
      const times = frameTimesRef.current.get(sourceId) || [];

      // Keep last 30 frame times
      times.push(now);
      if (times.length > 30) {
        times.shift();
      }
      frameTimesRef.current.set(sourceId, times);

      const fps = calculateFps(sourceId);
      updateStatus(sourceId, { lastFrameTime: now, fps });
    },
    [calculateFps, updateStatus]
  );

  // Handle incoming frame data
  const handleFrame = useCallback(
    (data: FrameData) => {
      const { sourceId, frame } = data;

      if (!frame) return;

      setFrames((prev) => {
        const newFrames = new Map(prev);
        newFrames.set(sourceId, frame);
        return newFrames;
      });

      recordFrameTime(sourceId);
    },
    [recordFrameTime]
  );

  // Polling implementation
  const startPolling = useCallback(
    (sourceId: string) => {
      // Clear existing interval if any
      const existingInterval = pollIntervalsRef.current.get(sourceId);
      if (existingInterval) {
        clearInterval(existingInterval);
      }

      const pollMs = Math.floor(1000 / targetFps);

      const interval = setInterval(async () => {
        if (!activeSourcesRef.current.has(sourceId)) {
          clearInterval(interval);
          pollIntervalsRef.current.delete(sourceId);
          return;
        }

        try {
          const result = await invoke<{ frame_base64?: string } | null>("get_source_frame", {
            sourceId,
          });

          if (result?.frame_base64) {
            handleFrame({ sourceId, frame: result.frame_base64, timestamp: Date.now() });
          }
        } catch (error) {
          console.error(`[useCaptureStream] Polling error: ${error}`);
          // Don't stop polling on individual errors
        }
      }, pollMs);

      pollIntervalsRef.current.set(sourceId, interval);
    },
    [targetFps, handleFrame]
  );

  // Start camera capture using browser getUserMedia API
  const startCameraCapture = useCallback(
    async (sourceId: string, deviceId: string) => {
      try {
        // First, enumerate devices to find the actual device ID
        // The source deviceId might be an index or a native ID, not a browser deviceId
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter((d) => d.kind === "videoinput");

        let actualDeviceId: string | undefined;

        // Try to find device by exact match first
        const exactMatch = videoDevices.find((d) => d.deviceId === deviceId);
        if (exactMatch) {
          actualDeviceId = exactMatch.deviceId;
        } else {
          // Try to find by index if deviceId looks like a number
          const deviceIndex = parseInt(deviceId, 10);
          if (!isNaN(deviceIndex) && deviceIndex >= 0 && deviceIndex < videoDevices.length) {
            actualDeviceId = videoDevices[deviceIndex].deviceId;
          } else if (videoDevices.length > 0) {
            // Fall back to first available camera
            actualDeviceId = videoDevices[0].deviceId;
          }
        }

        // Request camera access with minimal constraints to avoid OverconstrainedError
        // Some cameras don't support specific width/height constraints
        let stream: MediaStream;

        try {
          // First try with device ID constraint
          const constraints: MediaStreamConstraints = {
            video: actualDeviceId
              ? { deviceId: { ideal: actualDeviceId } }
              : true,
            audio: false,
          };
          stream = await navigator.mediaDevices.getUserMedia(constraints);
        } catch (constraintError) {
          // If that fails, try with just basic video: true
          console.warn(`[useCaptureStream] Retrying with basic constraints after: ${constraintError}`);
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }

        // Store the stream in both local ref and global registry
        cameraStreamsRef.current.set(sourceId, stream);
        activeCameraStreams.set(sourceId, stream);
        setStreams((prev) => new Map(prev).set(sourceId, stream));

        activeSourcesRef.current.add(sourceId);
        updateStatus(sourceId, { isCapturing: true, error: null });

        console.debug(`[useCaptureStream] Camera started: ${sourceId} (device: ${actualDeviceId || "default"})`);
      } catch (error) {
        console.error(`[useCaptureStream] Camera capture failed: ${error}`);
        const errorMessage = error instanceof Error ? error.message : String(error);
        updateStatus(sourceId, {
          isCapturing: false,
          error: errorMessage.includes("Permission")
            ? "Camera permission denied"
            : errorMessage.includes("NotFound")
            ? "Camera not found"
            : `Camera error: ${errorMessage}`,
        });
      }
    },
    [maxFrameWidth, targetFps, updateStatus]
  );

  // Stop camera capture
  const stopCameraCapture = useCallback(
    (sourceId: string) => {
      const stream = cameraStreamsRef.current.get(sourceId);
      if (stream) {
        // Stop all tracks
        stream.getTracks().forEach((track) => track.stop());
        cameraStreamsRef.current.delete(sourceId);
        activeCameraStreams.delete(sourceId);
        setStreams((prev) => {
          const newStreams = new Map(prev);
          newStreams.delete(sourceId);
          return newStreams;
        });
        console.debug(`[useCaptureStream] Camera stopped: ${sourceId}`);
      }
    },
    []
  );

  // Fallback: Refresh frame from source listing
  const refreshFrameFromListing = useCallback(
    async (source: Source) => {
      try {
        const nativeId = source.sourceId;

        if (nativeId === undefined || nativeId === null) {
          return;
        }

        // Determine if this is a screen or window capture
        const isScreenCapture = source.type === "screen";

        if (isScreenCapture) {
          // Get screen thumbnail
          const screens = await invoke<
            Array<{ id: number; thumbnail: string | null }>
          >("list_capturable_screens");

          const screen = screens.find((s) => s.id === nativeId);
          if (screen?.thumbnail) {
            setFrames((prev) => new Map(prev).set(source.id, screen.thumbnail!));
            recordFrameTime(source.id);
            return;
          }
        }

        // Try windows (could be window capture or screen that wasn't found)
        const windows = await invoke<
          Array<{ id: number; thumbnail: string | null }>
        >("list_capturable_windows");

        const window = windows.find((w) => w.id === nativeId);
        if (window?.thumbnail) {
          setFrames((prev) => new Map(prev).set(source.id, window.thumbnail!));
          recordFrameTime(source.id);
        }
      } catch (error) {
        console.error(
          `[useCaptureStream] Failed to refresh from listing: ${error}`
        );
      }
    },
    [recordFrameTime]
  );

  // Start capture for a single source - uses ref to avoid dependency on sources
  const startCapture = useCallback(
    async (sourceId: string) => {
      const source = sourcesRef.current.find((s) => s.id === sourceId);
      if (!source) {
        console.warn(`[useCaptureStream] Source not found: ${sourceId}`);
        return;
      }

      if (activeSourcesRef.current.has(sourceId)) {
        console.debug(`[useCaptureStream] Already capturing: ${sourceId}`);
        return;
      }

      // Cameras use browser getUserMedia API
      if (source.type === "camera") {
        const deviceId = String(source.sourceId);
        await startCameraCapture(sourceId, deviceId);
        return;
      }

      // Get native source ID directly from source.sourceId
      const nativeId = source.sourceId;

      if (nativeId === undefined || nativeId === null) {
        console.debug(`[useCaptureStream] No native ID for source: ${sourceId}`);
        // Use thumbnail as fallback if available
        if (source.thumbnail) {
          setFrames((prev) => new Map(prev).set(sourceId, source.thumbnail!));
        }
        return;
      }

      // Native ID must be a number for window/screen capture
      if (typeof nativeId !== "number") {
        console.warn(`[useCaptureStream] Invalid native ID type for ${source.type}: ${typeof nativeId}`);
        updateStatus(sourceId, {
          isCapturing: false,
          error: "Invalid source ID",
        });
        return;
      }

      activeSourcesRef.current.add(sourceId);
      updateStatus(sourceId, { isCapturing: true, error: null });

      const hasStreaming = await checkStreamingSupport();

      if (hasStreaming) {
        // Backend supports streaming - start capture
        try {
          await invoke("start_source_capture", {
            sourceId,
            sourceType: source.type,
            nativeId,
            maxWidth: maxFrameWidth,
          });

          // Start polling for frames
          startPolling(sourceId);
        } catch (error) {
          console.error(`[useCaptureStream] Failed to start capture: ${error}`);
          updateStatus(sourceId, {
            isCapturing: false,
            error: String(error),
          });
          activeSourcesRef.current.delete(sourceId);
        }
      } else {
        // Fallback: Use thumbnail from source listing
        await refreshFrameFromListing(source);
      }
    },
    [maxFrameWidth, updateStatus, startPolling, refreshFrameFromListing]
  );

  // Stop capture for a single source
  const stopCapture = useCallback(
    async (sourceId: string) => {
      // Check if this is a camera stream
      if (cameraStreamsRef.current.has(sourceId)) {
        stopCameraCapture(sourceId);
        activeSourcesRef.current.delete(sourceId);
        updateStatus(sourceId, { isCapturing: false, fps: 0 });
        return;
      }

      if (!activeSourcesRef.current.has(sourceId)) {
        return;
      }

      activeSourcesRef.current.delete(sourceId);

      // Clear polling interval
      const interval = pollIntervalsRef.current.get(sourceId);
      if (interval) {
        clearInterval(interval);
        pollIntervalsRef.current.delete(sourceId);
      }

      // Clear frame times
      frameTimesRef.current.delete(sourceId);

      updateStatus(sourceId, { isCapturing: false, fps: 0 });

      // Try to stop backend capture
      try {
        await invoke("stop_source_capture", { sourceId });
      } catch {
        // Command may not exist yet - ignore
      }
    },
    [updateStatus, stopCameraCapture]
  );

  // Refresh a single frame manually
  const refreshFrame = useCallback(
    async (sourceId: string) => {
      const source = sourcesRef.current.find((s) => s.id === sourceId);
      if (!source) return;

      const hasStreaming = await checkStreamingSupport();

      if (hasStreaming) {
        try {
          const result = await invoke<{ frame_base64?: string } | null>("get_source_frame", {
            sourceId,
          });
          if (result?.frame_base64) {
            handleFrame({ sourceId, frame: result.frame_base64, timestamp: Date.now() });
          }
        } catch (error) {
          console.error(`[useCaptureStream] Refresh error: ${error}`);
        }
      } else {
        await refreshFrameFromListing(source);
      }
    },
    [handleFrame, refreshFrameFromListing]
  );

  // Setup event listener
  useEffect(() => {
    if (!useEvents) return;

    let mounted = true;

    const setupListener = async () => {
      try {
        unlistenRef.current = await listen<FrameData>(
          FRAME_EVENT_NAME,
          (event) => {
            if (mounted) {
              handleFrame(event.payload);
            }
          }
        );
      } catch (error) {
        console.error(`[useCaptureStream] Failed to setup listener: ${error}`);
      }
    };

    setupListener();

    return () => {
      mounted = false;
      if (unlistenRef.current) {
        unlistenRef.current();
        unlistenRef.current = null;
      }
    };
  }, [useEvents, handleFrame]);

  // Auto-start/stop captures based on sources - use stable effect
  useEffect(() => {
    if (!autoStart) return;

    // Find sources that need to start
    const currentSourceIds = new Set(sources.map((s) => s.id));

    // Start capture for new visible sources
    for (const source of sources) {
      if (source.visible && !activeSourcesRef.current.has(source.id)) {
        startCapture(source.id);
      }
    }

    // Stop capture for removed sources
    const toRemove: string[] = [];
    for (const sourceId of activeSourcesRef.current) {
      if (!currentSourceIds.has(sourceId)) {
        toRemove.push(sourceId);
      }
    }
    for (const sourceId of toRemove) {
      stopCapture(sourceId);
    }
  }, [sources, autoStart, startCapture, stopCapture]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Stop all camera streams and clear global registry
      for (const [sourceId, stream] of cameraStreamsRef.current.entries()) {
        stream.getTracks().forEach((track) => track.stop());
        activeCameraStreams.delete(sourceId);
        console.debug(`[useCaptureStream] Cleanup: stopped camera ${sourceId}`);
      }
      cameraStreamsRef.current.clear();

      // Stop all native captures
      const toStop = Array.from(activeSourcesRef.current);
      for (const sourceId of toStop) {
        // Direct cleanup without async
        activeSourcesRef.current.delete(sourceId);
        const interval = pollIntervalsRef.current.get(sourceId);
        if (interval) {
          clearInterval(interval);
        }
        // Fire and forget stop command
        invoke("stop_source_capture", { sourceId }).catch(() => {});
      }

      // Clear all intervals
      for (const interval of pollIntervalsRef.current.values()) {
        clearInterval(interval);
      }
      pollIntervalsRef.current.clear();
    };
  }, []);

  // Memoize return value
  return useMemo(
    () => ({
      frames,
      streams,
      status,
      startCapture,
      stopCapture,
      refreshFrame,
    }),
    [frames, streams, status, startCapture, stopCapture, refreshFrame]
  );
}

export default useCaptureStream;
