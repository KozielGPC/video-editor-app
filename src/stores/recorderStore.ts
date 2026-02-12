import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";
import { writeFile } from "@tauri-apps/plugin-fs";
import type {
  RecordingState,
  ScreenSource,
  CameraSource,
  MicSource,
} from "@/types/recording";
import { useSceneStore } from "@/stores/sceneStore";
import { getActiveCameraStream } from "@/hooks/useCaptureStream";

/* ── Module-level timer handle ────────────────────────────────── */
let timerInterval: ReturnType<typeof setInterval> | null = null;

function clearTimer() {
  if (timerInterval !== null) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

/* ── Camera MediaRecorder for browser-side camera capture ─────── */
let cameraRecorder: MediaRecorder | null = null;
let cameraChunks: Blob[] = [];

function determineMimeType(): string {
  if (typeof MediaRecorder === "undefined") return "video/mp4";
  const candidates = [
    "video/mp4;codecs=avc1",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  for (const mime of candidates) {
    if (MediaRecorder.isTypeSupported(mime)) return mime;
  }
  return "video/mp4";
}

function startCameraMediaRecording(stream: MediaStream): void {
  cameraChunks = [];
  const mimeType = determineMimeType();
  try {
    cameraRecorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 5_000_000,
    });
  } catch {
    // Fallback without explicit options
    cameraRecorder = new MediaRecorder(stream);
  }
  cameraRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      cameraChunks.push(event.data);
    }
  };
  cameraRecorder.start(1000);
  console.debug("[recorder] Camera MediaRecorder started:", mimeType);
}

async function stopCameraMediaRecording(): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (!cameraRecorder || cameraRecorder.state === "inactive") {
      cameraRecorder = null;
      cameraChunks = [];
      resolve(null);
      return;
    }
    cameraRecorder.onstop = () => {
      const mime = cameraRecorder?.mimeType || "video/mp4";
      const blob = new Blob(cameraChunks, { type: mime });
      cameraRecorder = null;
      cameraChunks = [];
      const sizeMb = (blob.size / 1024 / 1024).toFixed(1);
      console.debug(`[recorder] Camera recording stopped (${sizeMb} MB, ${mime})`);
      resolve(blob.size > 0 ? blob : null);
    };
    cameraRecorder.stop();
  });
}

function cameraFileExtension(): string {
  const mime = determineMimeType();
  return mime.includes("webm") ? ".webm" : ".mp4";
}

/* ── State shape ──────────────────────────────────────────────── */
interface CameraLayoutForMerge {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface RecorderState {
  /* Sources */
  screens: ScreenSource[];
  cameras: CameraSource[];
  microphones: MicSource[];
  setScreens: (s: ScreenSource[]) => void;
  setCameras: (c: CameraSource[]) => void;
  setMicrophones: (m: MicSource[]) => void;

  /* Selected sources */
  selectedScreenId: string | null;
  selectedCameraId: string | null;
  selectedMicId: string | null;
  selectScreen: (id: string | null) => void;
  selectCamera: (id: string | null) => void;
  selectMic: (id: string | null) => void;

  /* Recording lifecycle */
  recordingState: RecordingState;
  elapsedTime: number; // seconds

  /** Path of the last completed recording (null until a recording finishes) */
  lastRecordingPath: string | null;
  /** Dismiss the post-recording banner */
  clearLastRecording: () => void;

  /** Zoom overlay during recording */
  zoomOverlay: { x: number; y: number; scale: number } | null;
  setZoomOverlay: (
    region: { x: number; y: number; scale: number } | null,
  ) => void;

  /** Camera layout stored for post-recording merge */
  _cameraLayout: CameraLayoutForMerge | null;

  startRecording: () => Promise<void>;
  pauseRecording: () => Promise<void>;
  resumeRecording: () => Promise<void>;
  stopRecording: () => Promise<void>;
  resetState: () => void;
}

/* ── Store ─────────────────────────────────────────────────────── */
export const useRecorderStore = create<RecorderState>()(
  devtools(
    (set, get) => ({
      /* ---------- Sources ---------- */
      screens: [],
      cameras: [],
      microphones: [],
      setScreens: (screens) => set({ screens }, false, "setScreens"),
      setCameras: (cameras) => set({ cameras }, false, "setCameras"),
      setMicrophones: (microphones) => {
        const { selectedMicId } = get();
        const shouldAutoSelect =
          microphones.length > 0 &&
          (selectedMicId === null ||
            !microphones.some((m) => m.id === selectedMicId));
        set(
          {
            microphones,
            ...(shouldAutoSelect
              ? { selectedMicId: microphones[0].id }
              : {}),
          },
          false,
          "setMicrophones",
        );
      },

      /* ---------- Selected ---------- */
      selectedScreenId: null,
      selectedCameraId: null,
      selectedMicId: null,
      selectScreen: (id) =>
        set({ selectedScreenId: id }, false, "selectScreen"),
      selectCamera: (id) =>
        set({ selectedCameraId: id }, false, "selectCamera"),
      selectMic: (id) => set({ selectedMicId: id }, false, "selectMic"),

      /* ---------- Recording ---------- */
      recordingState: "idle",
      elapsedTime: 0,
      lastRecordingPath: null,
      zoomOverlay: null,
      _cameraLayout: null,
      clearLastRecording: () =>
        set({ lastRecordingPath: null }, false, "clearLastRecording"),
      setZoomOverlay: (zoomOverlay) =>
        set({ zoomOverlay }, false, "setZoomOverlay"),

      startRecording: async () => {
        const { selectedScreenId, selectedCameraId, selectedMicId } = get();
        if (!selectedMicId) {
          console.warn("[recorder] No microphone selected — recording without audio");
        }

        // Get camera layout from scene store for post-recording merge
        const sceneState = useSceneStore.getState();
        const activeScene = sceneState.scenes.find(
          (s) => s.id === sceneState.activeSceneId,
        );
        const cameraSource = activeScene?.sources.find(
          (s) =>
            s.type === "camera" &&
            String(s.sourceId) === selectedCameraId,
        );

        const cameraLayout: CameraLayoutForMerge | null = cameraSource
          ? {
              x: cameraSource.x,
              y: cameraSource.y,
              width: cameraSource.width,
              height: cameraSource.height,
            }
          : null;

        try {
          // Start screen + mic recording via FFmpeg (no camera)
          await invoke("start_recording", {
            screenId: selectedScreenId,
            micId: selectedMicId,
          });

          // Start camera recording via browser MediaRecorder
          // Camera preview stays active - no release needed!
          if (selectedCameraId) {
            const stream = getActiveCameraStream();
            if (stream) {
              startCameraMediaRecording(stream);
            }
          }

          set(
            {
              recordingState: "recording",
              elapsedTime: 0,
              lastRecordingPath: null,
              zoomOverlay: null,
              _cameraLayout: cameraLayout,
            },
            false,
            "startRecording",
          );

          clearTimer();
          timerInterval = setInterval(() => {
            set(
              (s) => ({ elapsedTime: s.elapsedTime + 1 }),
              false,
              "tick",
            );
          }, 1000);
        } catch (err) {
          console.error("Failed to start recording:", err);
        }
      },

      pauseRecording: async () => {
        try {
          await invoke("pause_recording");
          clearTimer();
          set({ recordingState: "paused" }, false, "pauseRecording");
        } catch (err) {
          console.error("Failed to pause recording:", err);
        }
      },

      resumeRecording: async () => {
        try {
          await invoke("resume_recording");
          set({ recordingState: "recording" }, false, "resumeRecording");

          clearTimer();
          timerInterval = setInterval(() => {
            set(
              (s) => ({ elapsedTime: s.elapsedTime + 1 }),
              false,
              "tick",
            );
          }, 1000);
        } catch (err) {
          console.error("Failed to resume recording:", err);
        }
      },

      stopRecording: async () => {
        let outputPath: string | null = null;
        const cameraLayout = get()._cameraLayout;

        try {
          // Stop FFmpeg screen recording
          outputPath = await invoke<string>("stop_recording");
        } catch (err) {
          console.error("Failed to stop screen recording:", err);
        }

        // Stop camera MediaRecorder
        const cameraBlob = await stopCameraMediaRecording();

        clearTimer();

        // If we have both screen recording and camera, merge them
        if (outputPath && cameraBlob && cameraLayout) {
          set(
            { recordingState: "processing" },
            false,
            "processingMerge",
          );

          try {
            // Save camera blob to disk via Tauri fs plugin
            const ext = cameraFileExtension();
            const cameraPath = `${outputPath}.camera${ext}`;
            const bytes = new Uint8Array(await cameraBlob.arrayBuffer());
            await writeFile(cameraPath, bytes);

            console.debug(
              `[recorder] Camera saved to ${cameraPath} (${(bytes.length / 1024 / 1024).toFixed(1)} MB)`,
            );

            // Merge screen + camera overlay
            outputPath = await invoke<string>("merge_camera_overlay", {
              screenPath: outputPath,
              cameraPath,
              cameraLayout,
            });

            console.debug("[recorder] Merge completed:", outputPath);
          } catch (err) {
            console.error("Failed to merge camera overlay:", err);
            // Keep the screen-only recording as fallback
          }
        }

        set(
          {
            recordingState: "idle",
            lastRecordingPath: outputPath,
            zoomOverlay: null,
            _cameraLayout: null,
          },
          false,
          "stopRecording",
        );
      },

      resetState: () => {
        clearTimer();
        set(
          {
            recordingState: "idle",
            elapsedTime: 0,
            selectedScreenId: null,
            selectedCameraId: null,
            selectedMicId: null,
            _cameraLayout: null,
          },
          false,
          "resetState",
        );
      },
    }),
    { name: "RecorderStore" },
  ),
);
