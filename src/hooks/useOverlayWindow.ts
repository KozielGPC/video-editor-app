import { useEffect, useRef } from "react";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { emitTo, listen } from "@tauri-apps/api/event";
import { useRecorderStore } from "@/stores/recorderStore";

const OVERLAY_LABEL = "overlay";

function getOverlayUrl(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/overlay`;
}

function emitOverlayState(): void {
  const { recordingState, zoomOverlay } = useRecorderStore.getState();
  void emitTo(OVERLAY_LABEL, "zoom-overlay-update", {
    zoomOverlay,
    recordingState,
  });
}

export function useOverlayWindow(): void {
  const overlayRef = useRef<WebviewWindow | null>(null);

  const recordingState = useRecorderStore((s) => s.recordingState);
  const zoomOverlay = useRecorderStore((s) => s.zoomOverlay);

  useEffect(() => {
    const unlistenPromise = listen("overlay-ready", () => {
      emitOverlayState();
    });
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  useEffect(() => {
    const isActive =
      recordingState === "recording" || recordingState === "paused";

    if (isActive) {
      if (overlayRef.current) {
        emitOverlayState();
        return;
      }

      // Get screen dimensions to create a window that covers the screen
      // Using fullscreen: false to avoid issues with transparent fullscreen windows
      const screenWidth = window.screen.width;
      const screenHeight = window.screen.height;

      const overlay = new WebviewWindow(OVERLAY_LABEL, {
        url: getOverlayUrl(),
        title: "Recording Overlay",
        transparent: true,
        decorations: false,
        // Don't use fullscreen - it can cause issues with transparency on macOS
        fullscreen: false,
        // Position at origin and size to cover screen
        x: 0,
        y: 0,
        width: screenWidth,
        height: screenHeight,
        alwaysOnTop: true,
        focus: false,
        skipTaskbar: true,
        visible: true,
        visibleOnAllWorkspaces: true,
        // Additional options for better overlay behavior
        resizable: false,
        maximizable: false,
        minimizable: false,
        closable: false,
      });

      overlay.once("tauri://created", async () => {
        overlayRef.current = overlay;
        // Make the overlay click-through so users can interact with content beneath
        try {
          await overlay.setIgnoreCursorEvents(true);
        } catch (e) {
          console.warn("Failed to set ignore cursor events:", e);
        }
        setTimeout(emitOverlayState, 100);
      });

      overlay.once("tauri://error", (e) => {
        console.error("Failed to create overlay window:", e);
      });
    } else {
      if (overlayRef.current) {
        overlayRef.current.close().catch(() => {});
        overlayRef.current = null;
      }
    }
  }, [recordingState, zoomOverlay]);

  useEffect(() => {
    const isActive =
      recordingState === "recording" || recordingState === "paused";
    if (isActive && overlayRef.current) {
      emitOverlayState();
    }
  }, [zoomOverlay, recordingState]);
}
