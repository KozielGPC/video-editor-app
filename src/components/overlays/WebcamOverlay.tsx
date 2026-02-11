import { useState, useRef, useCallback, useEffect } from "react";
import { Camera } from "lucide-react";

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

export type CornerPosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

interface WebcamOverlayProps {
  x: number;
  y: number;
  width: number;
  height: number;
  borderRadius: number;
  isSelected?: boolean;
  onSelect?: () => void;
  onUpdate?: (pos: {
    x: number;
    y: number;
    width: number;
    height: number;
  }) => void;
}

/* ------------------------------------------------------------------ */
/* Corner presets (relative to a container rect)                         */
/* ------------------------------------------------------------------ */

export function getCornerPosition(
  corner: CornerPosition,
  containerWidth: number,
  containerHeight: number,
  overlayWidth: number,
  overlayHeight: number,
  padding = 16
): { x: number; y: number } {
  switch (corner) {
    case "top-left":
      return { x: padding, y: padding };
    case "top-right":
      return { x: containerWidth - overlayWidth - padding, y: padding };
    case "bottom-left":
      return { x: padding, y: containerHeight - overlayHeight - padding };
    case "bottom-right":
      return {
        x: containerWidth - overlayWidth - padding,
        y: containerHeight - overlayHeight - padding,
      };
  }
}

/* ------------------------------------------------------------------ */
/* Component                                                            */
/* ------------------------------------------------------------------ */

export default function WebcamOverlay({
  x,
  y,
  width,
  height,
  borderRadius,
  isSelected = false,
  onSelect,
  onUpdate,
}: WebcamOverlayProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });

  /* ---------- Drag ---------- */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect?.();
      setIsDragging(true);
      dragOffset.current = {
        x: e.clientX - x,
        y: e.clientY - y,
      };
    },
    [x, y, onSelect]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: MouseEvent) => {
      onUpdate?.({
        x: e.clientX - dragOffset.current.x,
        y: e.clientY - dragOffset.current.y,
        width,
        height,
      });
    };

    const handleUp = () => setIsDragging(false);

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [isDragging, width, height, onUpdate]);

  /* ---------- Resize ---------- */
  const handleResizeDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsResizing(true);
      resizeStart.current = {
        x: e.clientX,
        y: e.clientY,
        w: width,
        h: height,
      };
    },
    [width, height]
  );

  useEffect(() => {
    if (!isResizing) return;

    const handleMove = (e: MouseEvent) => {
      const dx = e.clientX - resizeStart.current.x;
      const dy = e.clientY - resizeStart.current.y;
      /* Maintain aspect ratio by using the larger delta */
      const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
      onUpdate?.({
        x,
        y,
        width: Math.max(60, resizeStart.current.w + delta),
        height: Math.max(60, resizeStart.current.h + delta),
      });
    };

    const handleUp = () => setIsResizing(false);

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [isResizing, x, y, onUpdate]);

  return (
    <div
      className={`absolute select-none ${isDragging || isResizing ? "cursor-grabbing" : "cursor-grab"}`}
      style={{
        left: x,
        top: y,
        width,
        height,
        borderRadius,
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Selection border */}
      {isSelected && (
        <div
          className="absolute -inset-px border-2 border-blue-500 pointer-events-none"
          style={{ borderRadius: borderRadius + 1 }}
        />
      )}

      {/* Webcam placeholder */}
      <div
        className="w-full h-full bg-neutral-800 border border-neutral-600 flex flex-col items-center justify-center gap-1.5 overflow-hidden shadow-xl shadow-black/40"
        style={{ borderRadius }}
      >
        <Camera size={width > 100 ? 28 : 18} className="text-neutral-500" />
        {width > 100 && (
          <span className="text-[10px] text-neutral-500 font-medium">
            Webcam
          </span>
        )}
      </div>

      {/* Resize handle */}
      {isSelected && (
        <div
          onMouseDown={handleResizeDown}
          className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-blue-500 rounded-sm cursor-se-resize shadow-sm"
        />
      )}
    </div>
  );
}
