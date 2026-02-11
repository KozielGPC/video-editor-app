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

      const overlay = new WebviewWindow(OVERLAY_LABEL, {
        url: getOverlayUrl(),
        title: "Recording Overlay",
        transparent: true,
        decorations: false,
        fullscreen: true,
        alwaysOnTop: true,
        focus: false,
        skipTaskbar: true,
        visible: true,
        visibleOnAllWorkspaces: true,
      });

      overlay.once("tauri://created", () => {
        overlayRef.current = overlay;
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
