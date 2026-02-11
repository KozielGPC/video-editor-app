import { useState, useRef, useCallback, useEffect } from "react";
import type { TextOverlayData } from "@/types/project";

interface TextOverlayProps {
  overlay: TextOverlayData;
  onUpdate: (updated: TextOverlayData) => void;
  isSelected: boolean;
  onSelect: () => void;
  containerRect?: DOMRect | null;
}

export default function TextOverlay({
  overlay,
  onUpdate,
  isSelected,
  onSelect,
  containerRect,
}: TextOverlayProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [editText, setEditText] = useState(overlay.text);
  const dragOffset = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });
  const editRef = useRef<HTMLTextAreaElement>(null);

  /* Sync local edit text with overlay prop */
  useEffect(() => {
    if (!isEditing) setEditText(overlay.text);
  }, [overlay.text, isEditing]);

  /* Focus textarea when entering edit mode */
  useEffect(() => {
    if (isEditing && editRef.current) {
      editRef.current.focus();
      editRef.current.select();
    }
  }, [isEditing]);

  /* ---------- Drag handlers ---------- */
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isEditing) return;
      e.stopPropagation();
      onSelect();
      setIsDragging(true);
      dragOffset.current = {
        x: e.clientX - overlay.x,
        y: e.clientY - overlay.y,
      };
    },
    [overlay.x, overlay.y, onSelect, isEditing]
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

  /* ---------- Resize handlers ---------- */
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
        width: Math.max(60, resizeStart.current.w + dx),
        height: Math.max(24, resizeStart.current.h + dy),
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

  /* ---------- Double-click to edit ---------- */
  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
  }, []);

  const handleEditBlur = useCallback(() => {
    setIsEditing(false);
    onUpdate({ ...overlay, text: editText });
  }, [editText, overlay, onUpdate]);

  const handleEditKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        handleEditBlur();
      }
    },
    [handleEditBlur]
  );

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
      onDoubleClick={handleDoubleClick}
    >
      {/* Selection border */}
      {isSelected && (
        <div className="absolute -inset-px rounded border-2 border-blue-500 pointer-events-none" />
      )}

      {/* Content */}
      {isEditing ? (
        <textarea
          ref={editRef}
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={handleEditBlur}
          onKeyDown={handleEditKeyDown}
          className="w-full h-full bg-transparent text-inherit resize-none outline-none border-none p-1"
          style={{
            fontSize: overlay.fontSize,
            color: overlay.color,
            fontFamily: overlay.fontFamily || "sans-serif",
          }}
        />
      ) : (
        <div
          className="w-full h-full flex items-center justify-center overflow-hidden p-1 whitespace-pre-wrap break-words"
          style={{
            fontSize: overlay.fontSize,
            color: overlay.color,
            fontFamily: overlay.fontFamily || "sans-serif",
            backgroundColor: overlay.backgroundColor || "transparent",
            borderRadius: 4,
          }}
        >
          {overlay.text}
        </div>
      )}

      {/* Resize handle (bottom-right) */}
      {isSelected && !isEditing && (
        <div
          onMouseDown={handleResizeDown}
          className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-blue-500 rounded-sm cursor-se-resize shadow-sm"
        />
      )}
    </div>
  );
}
