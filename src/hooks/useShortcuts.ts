import { useEffect } from "react";
import { register, unregister } from "@tauri-apps/plugin-global-shortcut";
import { invoke } from "@tauri-apps/api/core";
import { useEditorStore } from "@/stores/editorStore";
import { useRecorderStore } from "@/stores/recorderStore";
import { useUIStore } from "@/stores/uiStore";
import { useSettingsStore } from "@/stores/settingsStore";
import { eventMatchesAccelerator } from "@/lib/shortcut";
import type { EditorTool } from "@/stores/editorStore";

const TOOL_MAP: Record<string, EditorTool> = {
  "1": "select",
  "2": "cut",
  "3": "text",
  "4": "zoom",
};

/**
 * Registers all keyboard shortcuts for the app.
 * Uses shortcut bindings from settings store.
 */
export function useShortcuts(): void {
  const shortcuts = useSettingsStore((s) => s.shortcuts);
  const recordingState = useRecorderStore((s) => s.recordingState);
  const accRecord = shortcuts.find((s) => s.id === "record")?.accelerator ?? "CommandOrControl+Shift+R";
  const accPause = shortcuts.find((s) => s.id === "pause")?.accelerator ?? "CommandOrControl+Shift+P";
  const accZoom = shortcuts.find((s) => s.id === "zoom")?.accelerator ?? "CommandOrControl+Shift+Z";
  const accUndo = shortcuts.find((s) => s.id === "undo")?.accelerator ?? "CommandOrControl+Z";
  const accRedo = shortcuts.find((s) => s.id === "redo")?.accelerator ?? "CommandOrControl+Shift+Z";
  const accExport = shortcuts.find((s) => s.id === "export")?.accelerator ?? "CommandOrControl+E";
  const accPlay = shortcuts.find((s) => s.id === "play")?.accelerator ?? "Space";
  const accSplit = shortcuts.find((s) => s.id === "split")?.accelerator ?? "S";
  const accDelete = shortcuts.find((s) => s.id === "delete")?.accelerator ?? "Backspace";

  /* ── In-app keydown handler (uses settings) ──────────────────────────── */
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.repeat) return;

      const tag = (e.target as HTMLElement)?.tagName;
      const isEditable =
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        (e.target as HTMLElement)?.getAttribute("contenteditable") === "true";

      const activeView = useUIStore.getState().activeView;

      /* Recording shortcuts */
      if (eventMatchesAccelerator(e, accRecord)) {
        e.preventDefault();
        const { recordingState, startRecording, stopRecording } =
          useRecorderStore.getState();
        if (recordingState === "idle") startRecording();
        else stopRecording();
        return;
      }

      if (eventMatchesAccelerator(e, accPause)) {
        e.preventDefault();
        const { recordingState, pauseRecording, resumeRecording } =
          useRecorderStore.getState();
        if (recordingState === "recording") pauseRecording();
        else if (recordingState === "paused") resumeRecording();
        return;
      }

      /* Zoom / Redo: when not recording = Redo. Skip when typing in a text field. */
      if (eventMatchesAccelerator(e, accZoom)) {
        if (isEditable) return;
        e.preventDefault();
        const recState = useRecorderStore.getState().recordingState;
        if (recState !== "recording") {
          useEditorStore.getState().redo();
        }
        return;
      }

      if (eventMatchesAccelerator(e, accUndo)) {
        if (isEditable) return;
        e.preventDefault();
        useEditorStore.getState().undo();
        return;
      }

      if (eventMatchesAccelerator(e, accExport)) {
        e.preventDefault();
        useUIStore.getState().toggleExportDialog();
        return;
      }

      /* Editor-only shortcuts */
      if (activeView !== "editor") return;
      if (isEditable) return;

      if (eventMatchesAccelerator(e, accPlay)) {
        e.preventDefault();
        const { isPlaying, setIsPlaying } = useEditorStore.getState();
        setIsPlaying(!isPlaying);
        return;
      }

      if (eventMatchesAccelerator(e, accSplit) && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        useEditorStore.getState().splitClipAtPlayhead();
        return;
      }

      if (eventMatchesAccelerator(e, accDelete)) {
        e.preventDefault();
        const { selectedTrackId, selectedClipId, removeClip } =
          useEditorStore.getState();
        if (selectedTrackId && selectedClipId) {
          removeClip(selectedTrackId, selectedClipId);
        }
        return;
      }

      /* Tool switching (1-4) */
      if (TOOL_MAP[e.key] && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        useEditorStore.getState().setTool(TOOL_MAP[e.key]);
        return;
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [accRecord, accPause, accZoom, accUndo, accExport, accPlay, accSplit, accDelete]);

  /* ── Tauri global shortcuts (work when app not focused) ───────────────── */
  useEffect(() => {
    let recordRegistered = false;
    let pauseRegistered = false;

    async function registerRecordAndPause() {
      try {
        await register(accRecord, () => {
          const { recordingState, startRecording, stopRecording } =
            useRecorderStore.getState();
          if (recordingState === "idle") startRecording();
          else stopRecording();
        });
        recordRegistered = true;

        await register(accPause, () => {
          const { recordingState, pauseRecording, resumeRecording } =
            useRecorderStore.getState();
          if (recordingState === "recording") pauseRecording();
          else if (recordingState === "paused") resumeRecording();
        });
        pauseRegistered = true;
      } catch (err) {
        console.warn("Failed to register record/pause shortcuts:", err);
      }
    }

    registerRecordAndPause();

    return () => {
      if (recordRegistered) unregister(accRecord).catch(() => {});
      if (pauseRegistered) unregister(accPause).catch(() => {});
    };
  }, [accRecord, accPause]);

  /* ── Zoom shortcut: only when recording (avoids capturing Z etc. when typing) ── */
  useEffect(() => {
    if (recordingState !== "recording") return;

    register(accZoom, () => {
      invoke<{ x: number; y: number; scale: number } | null>("toggle_zoom", {})
        .then((result) => {
          useRecorderStore.getState().setZoomOverlay(result);
        })
        .catch((err: unknown) =>
          console.warn("toggle_zoom (global):", err),
        );
    }).catch((err) => console.warn("Failed to register zoom shortcut:", err));

    return () => {
      unregister(accZoom).catch(() => {});
    };
  }, [recordingState, accZoom]);
}
