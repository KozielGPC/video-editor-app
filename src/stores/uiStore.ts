import { create } from "zustand";

export type ActiveView = "recorder" | "editor";

interface UIState {
  activeView: ActiveView;
  showExportDialog: boolean;
  showExportProgress: boolean;
  showSettings: boolean;
  sidebarCollapsed: boolean;
  /** Path of the most recent export output (set when export starts) */
  exportOutputPath: string | null;

  setActiveView: (view: ActiveView) => void;
  setShowExportDialog: (show: boolean) => void;
  setShowExportProgress: (show: boolean) => void;
  toggleExportDialog: () => void;
  setSettingsOpen: (open: boolean) => void;
  toggleSettings: () => void;
  toggleSidebar: () => void;
  setExportOutputPath: (path: string | null) => void;
}

export const useUIStore = create<UIState>()((set) => ({
  activeView: "recorder",
  showExportDialog: false,
  showExportProgress: false,
  showSettings: false,
  sidebarCollapsed: false,
  exportOutputPath: null,

  setActiveView: (view) => set({ activeView: view }),
  setShowExportDialog: (show) => set({ showExportDialog: show }),
  setShowExportProgress: (show) => set({ showExportProgress: show }),
  toggleExportDialog: () =>
    set((s) => ({ showExportDialog: !s.showExportDialog })),
  setSettingsOpen: (open) => set({ showSettings: open }),
  toggleSettings: () => set((s) => ({ showSettings: !s.showSettings })),
  toggleSidebar: () =>
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setExportOutputPath: (path) => set({ exportOutputPath: path }),
}));
