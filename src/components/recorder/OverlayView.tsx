import { useEffect, useState } from "react";
import { listen, emit } from "@tauri-apps/api/event";

interface OverlayPayload {
  recordingState: "idle" | "recording" | "paused";
}

export default function OverlayView() {
  const [payload, setPayload] = useState<OverlayPayload | null>(null);

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
    const unlistenPromise = listen<OverlayPayload>(
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

  return (
    <div className="fixed inset-0 pointer-events-none z-[9999]">
      {/* Full-frame dotted border (gray) */}
      <div
        className="absolute inset-0"
        style={{
          border: "2px dashed rgba(128, 128, 128, 0.7)",
          borderRadius: "2px",
        }}
      />

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
