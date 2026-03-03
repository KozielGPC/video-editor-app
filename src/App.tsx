import { useEffect } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppShell from "@/components/layout/AppShell";
import OverlayView from "@/components/recorder/OverlayView";
import { useShortcuts } from "@/hooks/useShortcuts";
import { useMediaSources } from "@/hooks/useMediaSources";
import { useEditorStore } from "@/stores/editorStore";

export default function App() {
  useShortcuts();

  const { refresh } = useMediaSources();
  useEffect(() => {
    void refresh;
  }, [refresh]);

  // Close guard: prompt when there are unsaved changes
  useEffect(() => {
    let unlisten: (() => void) | undefined;

    (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        unlisten = await win.onCloseRequested(async (event) => {
          const { isDirty, saveProject } = useEditorStore.getState();
          if (!isDirty) return; // no unsaved changes, close normally

          const { confirm } = await import("@tauri-apps/plugin-dialog");
          const shouldSave = await confirm(
            "You have unsaved changes. Save before closing?",
            {
              title: "Unsaved Changes",
              kind: "warning",
              okLabel: "Save & Close",
              cancelLabel: "Discard",
            },
          );

          if (shouldSave) {
            await saveProject();
          }
          // If user clicks Discard (cancel) or Save finishes, window closes.
          // The event is NOT prevented — Tauri closes after this handler returns.
        });
      } catch {
        // Not in a Tauri window context (e.g. overlay), skip
      }
    })();

    return () => {
      unlisten?.();
    };
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppShell />} />
        <Route path="/overlay" element={<OverlayView />} />
      </Routes>
    </BrowserRouter>
  );
}
