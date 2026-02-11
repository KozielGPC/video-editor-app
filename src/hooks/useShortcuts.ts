import { useEffect } from "react";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { invoke } from "@tauri-apps/api/core";
import { useEditorStore } from "@/stores/editorStore";
import { useRecorderStore } from "@/stores/recorderStore";
import { useUIStore } from "@/stores/uiStore";
import type { EditorTool } from "@/stores/editorStore";

const TOOL_MAP: Record<string, EditorTool> = {
  "1": "select",
  "2": "cut",
  "3": "text",
  "4": "zoom",
};

/**
 * Registers all global keyboard shortcuts for the app.
 * Call once at the top level (e.g. in App).
 */
export function useShortcuts(): void {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      const shift = e.shiftKey;
      const key = e.key.toLowerCase();

      const activeView = useUIStore.getState().activeView;

      /* ── Recording shortcuts ──────────────────────────── */
      if (meta && shift && key === "r") {
        e.preventDefault();
        const { recordingState, startRecording, stopRecording } =
          useRecorderStore.getState();
        if (recordingState === "idle") {
          startRecording();
        } else {
          stopRecording();
        }
        return;
      }

      if (meta && shift && key === "p") {
        e.preventDefault();
        const { recordingState, pauseRecording, resumeRecording } =
          useRecorderStore.getState();
        if (recordingState === "recording") {
          pauseRecording();
        } else if (recordingState === "paused") {
          resumeRecording();
        }
        return;
      }

      /* ── Zoom marker / Redo (Cmd+Shift+Z) ────────────── */
      if (meta && shift && key === "z") {
        e.preventDefault();
        const recState = useRecorderStore.getState().recordingState;
        if (recState === "recording") {
          // During recording: mark a smooth zoom at current mouse position
          invoke("mark_zoom_point", {}).catch((err: unknown) =>
            console.warn("mark_zoom_point failed:", err),
          );
        } else {
          // Not recording: redo in editor
          useEditorStore.getState().redo();
        }
        return;
      }

      if (meta && key === "z" && !shift) {
        e.preventDefault();
        useEditorStore.getState().undo();
        return;
      }

      /* ── Export dialog ────────────────────────────────── */
      if (meta && key === "e") {
        e.preventDefault();
        useUIStore.getState().toggleExportDialog();
        return;
      }

      /* ── Editor-only shortcuts (no modifier) ──────────── */
      if (activeView !== "editor") return;

      // Ignore when focused on input/textarea
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

      if (key === " ") {
        e.preventDefault();
        const { isPlaying, setIsPlaying } = useEditorStore.getState();
        setIsPlaying(!isPlaying);
        return;
      }

      if (key === "s" && !meta) {
        e.preventDefault();
        useEditorStore.getState().splitClipAtPlayhead();
        return;
      }

      if (key === "delete" || key === "backspace") {
        e.preventDefault();
        const { selectedTrackId, selectedClipId, removeClip } =
          useEditorStore.getState();
        if (selectedTrackId && selectedClipId) {
          removeClip(selectedTrackId, selectedClipId);
        }
        return;
      }

      /* ── Tool switching (1-4) ─────────────────────────── */
      if (TOOL_MAP[key] && !meta && !shift) {
        e.preventDefault();
        useEditorStore.getState().setTool(TOOL_MAP[key]);
        return;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  /* ── Tauri global shortcuts (work even when app not focused) ── */
  useEffect(() => {
    let registered = false;

    async function registerGlobalShortcuts() {
      try {
        await register("CommandOrControl+Shift+R", (event) => {
          if (event.state === "Pressed") {
            const { recordingState, startRecording, stopRecording } =
              useRecorderStore.getState();
            if (recordingState === "idle") {
              startRecording();
            } else {
              stopRecording();
            }
          }
        });

        await register("CommandOrControl+Shift+P", (event) => {
          if (event.state === "Pressed") {
            const { recordingState, pauseRecording, resumeRecording } =
              useRecorderStore.getState();
            if (recordingState === "recording") {
              pauseRecording();
            } else if (recordingState === "paused") {
              resumeRecording();
            }
          }
        });

        await register("CommandOrControl+Shift+Z", (event) => {
          if (event.state === "Pressed") {
            const { recordingState } = useRecorderStore.getState();
            if (recordingState === "recording") {
              invoke("mark_zoom_point", {}).catch((err: unknown) =>
                console.warn("mark_zoom_point (global):", err),
              );
            }
          }
        });

        registered = true;
      } catch (err) {
        console.warn("Failed to register global shortcuts:", err);
      }
    }

    registerGlobalShortcuts();

    return () => {
      if (registered) {
        unregister("CommandOrControl+Shift+R").catch(() => {});
        unregister("CommandOrControl+Shift+P").catch(() => {});
        unregister("CommandOrControl+Shift+Z").catch(() => {});
      }
    };
  }, []);
}
