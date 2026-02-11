import { create } from "zustand";
import { devtools } from "zustand/middleware";
import { invoke } from "@tauri-apps/api/core";
import type {
  RecordingState,
  ScreenSource,
  CameraSource,
  MicSource,
} from "@/types/recording";

/* ── Module-level timer handle ────────────────────────────────── */
let timerInterval: ReturnType<typeof setInterval> | null = null;

function clearTimer() {
  if (timerInterval !== null) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

/* ── State shape ──────────────────────────────────────────────── */
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
      setMicrophones: (microphones) =>
        set({ microphones }, false, "setMicrophones"),

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
      clearLastRecording: () =>
        set({ lastRecordingPath: null }, false, "clearLastRecording"),

      startRecording: async () => {
        const { selectedScreenId, selectedCameraId, selectedMicId } = get();
        try {
          await invoke("start_recording", {
            screenId: selectedScreenId,
            cameraId: selectedCameraId,
            micId: selectedMicId,
          });

          set(
            { recordingState: "recording", elapsedTime: 0, lastRecordingPath: null },
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
        try {
          outputPath = await invoke<string>("stop_recording");
        } catch (err) {
          console.error("Failed to stop recording:", err);
        } finally {
          clearTimer();
          set(
            { recordingState: "idle", lastRecordingPath: outputPath },
            false,
            "stopRecording",
          );
        }
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
          },
          false,
          "resetState",
        );
      },
    }),
    { name: "RecorderStore" },
  ),
);
