import { create } from "zustand";

export type ActiveView = "recorder" | "editor";

interface UIState {
  activeView: ActiveView;
  showExportDialog: boolean;
  showExportProgress: boolean;
  showSettings: boolean;
  sidebarCollapsed: boolean;

  setActiveView: (view: ActiveView) => void;
  setShowExportDialog: (show: boolean) => void;
  setShowExportProgress: (show: boolean) => void;
  toggleExportDialog: () => void;
  setSettingsOpen: (open: boolean) => void;
  toggleSettings: () => void;
  toggleSidebar: () => void;
}

export const useUIStore = create<UIState>()((set) => ({
  activeView: "recorder",
  showExportDialog: false,
  showExportProgress: false,
  showSettings: false,
  sidebarCollapsed: false,

  setActiveView: (view) => set({ activeView: view }),
  setShowExportDialog: (show) => set({ showExportDialog: show }),
  setShowExportProgress: (show) => set({ showExportProgress: show }),
  toggleExportDialog: () =>
    set((s) => ({ showExportDialog: !s.showExportDialog })),
  setSettingsOpen: (open) => set({ showSettings: open }),
  toggleSettings: () => set((s) => ({ showSettings: !s.showSettings })),
  toggleSidebar: () =>
    set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
}));
