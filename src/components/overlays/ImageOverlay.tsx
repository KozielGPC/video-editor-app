import { useState, useRef, useCallback, useEffect } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { ImageIcon } from "lucide-react";
import type { ImageOverlayData } from "@/types/project";

interface ImageOverlayProps {
  overlay: ImageOverlayData;
  onUpdate: (updated: ImageOverlayData) => void;
  isSelected: boolean;
  onSelect: () => void;
}

export default function ImageOverlay({
  overlay,
  onUpdate,
  isSelected,
  onSelect,
}: ImageOverlayProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [imgError, setImgError] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });

  const imgSrc = overlay.path ? convertFileSrc(overlay.path) : "";

  /* ---------- Drag ---------- */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect();
      setIsDragging(true);
      dragOffset.current = {
        x: e.clientX - overlay.x,
        y: e.clientY - overlay.y,
      };
    },
    [overlay.x, overlay.y, onSelect]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: MouseEvent) => {
      onUpdate({
        ...overlay,
        x: e.clientX - dragOffset.current.x,
        y: e.clientY - dragOffset.current.y,
      });
    };

    const handleUp = () => setIsDragging(false);

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [isDragging, overlay, onUpdate]);

  /* ---------- Resize ---------- */
  const handleResizeDown = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      setIsResizing(true);
      resizeStart.current = {
        x: e.clientX,
        y: e.clientY,
        w: overlay.width,
        h: overlay.height,
      };
    },
    [overlay.width, overlay.height]
  );

  useEffect(() => {
    if (!isResizing) return;

    const handleMove = (e: MouseEvent) => {
      const dx = e.clientX - resizeStart.current.x;
      const dy = e.clientY - resizeStart.current.y;
      onUpdate({
        ...overlay,
        width: Math.max(40, resizeStart.current.w + dx),
        height: Math.max(40, resizeStart.current.h + dy),
      });
    };

    const handleUp = () => setIsResizing(false);

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [isResizing, overlay, onUpdate]);

  return (
    <div
      className={`absolute select-none ${isDragging || isResizing ? "cursor-grabbing" : "cursor-grab"}`}
      style={{
        left: overlay.x,
        top: overlay.y,
        width: overlay.width,
        height: overlay.height,
      }}
      onMouseDown={handleMouseDown}
    >
      {/* Selection border */}
      {isSelected && (
        <div className="absolute -inset-px rounded border-2 border-blue-500 pointer-events-none" />
      )}

      {/* Image or fallback */}
      {imgSrc && !imgError ? (
        <img
          src={imgSrc}
          alt="Overlay"
          className="w-full h-full object-contain rounded"
          draggable={false}
          onError={() => setImgError(true)}
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-2 bg-neutral-800 rounded border border-neutral-700 text-neutral-500">
          <ImageIcon size={24} strokeWidth={1.5} />
          <span className="text-xs">Image</span>
        </div>
      )}

      {/* Resize handles */}
      {isSelected && (
        <>
          <div
            onMouseDown={handleResizeDown}
            className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-blue-500 rounded-sm cursor-se-resize shadow-sm"
          />
          <div className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-blue-500 rounded-sm cursor-nw-resize shadow-sm pointer-events-none" />
          <div className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-blue-500 rounded-sm cursor-ne-resize shadow-sm pointer-events-none" />
          <div className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-blue-500 rounded-sm cursor-sw-resize shadow-sm pointer-events-none" />
        </>
      )}
    </div>
  );
}
