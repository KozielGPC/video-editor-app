import { create } from "zustand";
import { persist } from "zustand/middleware";

/** Shortcut IDs that can be configured */
export type ShortcutId =
  | "record"
  | "pause"
  | "zoom"
  | "undo"
  | "redo"
  | "export"
  | "play"
  | "split"
  | "delete";

/** Tauri global shortcut format: "CommandOrControl+Shift+R" */
export interface ShortcutConfig {
  id: ShortcutId;
  label: string;
  /** Tauri format string for global shortcut (e.g. "CommandOrControl+Shift+R") */
  accelerator: string;
  /** Whether this shortcut is registered globally (works when app not focused) */
  global: boolean;
}

const DEFAULT_SHORTCUTS: ShortcutConfig[] = [
  { id: "record", label: "Start/Stop Recording", accelerator: "CommandOrControl+Shift+R", global: true },
  { id: "pause", label: "Pause/Resume Recording", accelerator: "CommandOrControl+Shift+P", global: true },
  { id: "zoom", label: "Add Zoom Marker", accelerator: "CommandOrControl+Shift+Z", global: true },
  { id: "undo", label: "Undo", accelerator: "CommandOrControl+Z", global: false },
  { id: "redo", label: "Redo", accelerator: "CommandOrControl+Shift+Z", global: false },
  { id: "export", label: "Export", accelerator: "CommandOrControl+E", global: false },
  { id: "play", label: "Play/Pause", accelerator: "Space", global: false },
  { id: "split", label: "Split at Playhead", accelerator: "S", global: false },
  { id: "delete", label: "Delete Clip", accelerator: "Backspace", global: false },
];

export interface WebcamLayout {
  /** Top-left X as percentage of preview width (0-100) */
  x: number;
  /** Top-left Y as percentage of preview height (0-100) */
  y: number;
  /** Width as percentage of preview (5-50) */
  width: number;
  /** Height as percentage of preview (5-50) */
  height: number;
}

const DEFAULT_WEBCAM_LAYOUT: WebcamLayout = {
  x: 73,
  y: 68,
  width: 25,
  height: 20,
};

interface SettingsState {
  shortcuts: ShortcutConfig[];
  webcamLayout: WebcamLayout;

  getShortcut: (id: ShortcutId) => string;
  setShortcut: (id: ShortcutId, accelerator: string) => void;
  resetShortcuts: () => void;
  setWebcamLayout: (layout: Partial<WebcamLayout>) => void;
  resetWebcamLayout: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      shortcuts: DEFAULT_SHORTCUTS,
      webcamLayout: DEFAULT_WEBCAM_LAYOUT,

      getShortcut: (id) => get().shortcuts.find((s) => s.id === id)?.accelerator ?? "",

      setShortcut: (id, accelerator) =>
        set((s) => ({
          shortcuts: s.shortcuts.map((sc) =>
            sc.id === id ? { ...sc, accelerator } : sc,
          ),
        })),

      resetShortcuts: () => set({ shortcuts: DEFAULT_SHORTCUTS }),

      setWebcamLayout: (layout) =>
        set((s) => ({
          webcamLayout: { ...s.webcamLayout, ...layout },
        })),

      resetWebcamLayout: () => set({ webcamLayout: DEFAULT_WEBCAM_LAYOUT }),
    }),
    { name: "autoeditor-settings" },
  ),
);
