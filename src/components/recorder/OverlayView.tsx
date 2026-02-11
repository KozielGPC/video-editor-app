import { useEffect, useState } from "react";
import { listen, emit } from "@tauri-apps/api/event";
import { ZoomIn } from "lucide-react";

interface ZoomOverlayPayload {
  zoomOverlay: { x: number; y: number; scale: number } | null;
  recordingState: "idle" | "recording" | "paused";
}

export default function OverlayView() {
  const [payload, setPayload] = useState<ZoomOverlayPayload | null>(null);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    html.style.background = "transparent";
    body.style.background = "transparent";
    return () => {
      html.style.background = "";
      body.style.background = "";
    };
  }, []);

  useEffect(() => {
    void emit("overlay-ready");
  }, []);

  useEffect(() => {
    const unlistenPromise = listen<ZoomOverlayPayload>(
      "zoom-overlay-update",
      (event) => setPayload(event.payload),
    );
    return () => {
      void unlistenPromise.then((unlisten) => unlisten());
    };
  }, []);

  const isActive =
    payload?.recordingState === "recording" ||
    payload?.recordingState === "paused";

  if (!isActive || !payload) return null;

  const scale = payload.zoomOverlay?.scale ?? 1;
  const size = 100 / scale;
  const left = payload.zoomOverlay
    ? payload.zoomOverlay.x - size / 2
    : 0;
  const top = payload.zoomOverlay
    ? payload.zoomOverlay.y - size / 2
    : 0;
  const zoomLeft = Math.max(0, Math.min(100 - size, left));
  const zoomTop = Math.max(0, Math.min(100 - size, top));

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999]">
      {/* Full-frame dotted border (gray) */}
      <div
        className="absolute inset-0 transition-all duration-300 ease-out"
        style={{
          border: "2px dashed rgba(128, 128, 128, 0.7)",
          borderRadius: "2px",
        }}
      />

      {/* Dimmed overlay outside zoom region (when zoomed) - 4 rects around the zoom area */}
      {payload.zoomOverlay && (
        <>
          <div
            className="absolute left-0 right-0 top-0 bg-black/60 transition-opacity duration-300"
            style={{ height: `${zoomTop}%` }}
          />
          <div
            className="absolute left-0 right-0 bottom-0 bg-black/60 transition-opacity duration-300"
            style={{
              top: `${zoomTop + size}%`,
              height: `${100 - zoomTop - size}%`,
            }}
          />
          <div
            className="absolute bg-black/60 transition-opacity duration-300"
            style={{
              left: 0,
              width: `${zoomLeft}%`,
              top: `${zoomTop}%`,
              height: `${size}%`,
            }}
          />
          <div
            className="absolute bg-black/60 transition-opacity duration-300"
            style={{
              left: `${zoomLeft + size}%`,
              width: `${100 - zoomLeft - size}%`,
              top: `${zoomTop}%`,
              height: `${size}%`,
            }}
          />
        </>
      )}

      {/* Zoom region dotted border (when zoomed) */}
      {payload.zoomOverlay && (
        <div
          className="absolute transition-all duration-300 ease-out"
          style={{
            left: `${zoomLeft}%`,
            top: `${zoomTop}%`,
            width: `${size}%`,
            height: `${size}%`,
            border: "2px dashed rgba(128, 128, 128, 0.9)",
          }}
        >
          <div className="absolute -top-6 left-0 flex items-center gap-1 px-2 py-1 rounded-md bg-neutral-600/90 text-white text-[10px] font-medium whitespace-nowrap">
            <ZoomIn size={12} />
            {scale.toFixed(1)}x zoom
          </div>
        </div>
      )}

      {/* Recording indicator */}
      <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/60 backdrop-blur-sm border border-neutral-700/50">
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            payload.recordingState === "recording"
              ? "bg-red-500 animate-pulse-recording"
              : "bg-yellow-500"
          }`}
        />
        <span className="text-xs font-semibold tracking-wider text-neutral-200 uppercase">
          {payload.recordingState === "recording" ? "REC" : "Paused"}
        </span>
      </div>
    </div>
  );
}
