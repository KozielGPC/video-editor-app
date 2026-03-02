import { useCallback, useEffect, useRef, useState, memo } from "react";
import { Monitor, Camera, Image, Type, AppWindow, Eye, EyeOff, Lock, Unlock, Trash2, Crop } from "lucide-react";
import type { Source } from "@/stores/sceneStore";
import { useSceneStore } from "@/stores/sceneStore";

/** Video element for rendering MediaStream (camera sources) */
function StreamVideo({ stream, className, cropStyle }: { stream: MediaStream; className?: string; cropStyle?: React.CSSProperties }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !stream) return;

    let cancelled = false;
    video.srcObject = stream;
    video.play().catch((err) => {
      // AbortError is expected when srcObject changes before play completes
      if (!cancelled && err.name !== "AbortError") {
        console.warn("[StreamVideo] Failed to autoplay:", err);
      }
    });

    return () => {
      cancelled = true;
      video.srcObject = null;
    };
  }, [stream]);

  return (
    <video
      ref={videoRef}
      className={className}
      style={cropStyle}
      autoPlay
      playsInline
      muted
      draggable={false}
    />
  );
}

/** Get CSS styles to preview camera crop in the overlay.
 *  Uses oversized width/height + negative margins — matches the editor's
 *  CameraOverlayElement technique exactly so WYSIWYG holds. */
function getCameraCropStyle(source: Source): React.CSSProperties | undefined {
  const extra = source as unknown as Record<string, unknown>;
  const cropX = (extra.cropX as number) ?? 0;
  const cropY = (extra.cropY as number) ?? 0;
  const cropW = (extra.cropWidth as number) ?? 100;
  const cropH = (extra.cropHeight as number) ?? 100;

  // No crop applied — default full frame
  if (cropX === 0 && cropY === 0 && cropW === 100 && cropH === 100) {
    return undefined;
  }

  const scaleX = 100 / cropW;
  const scaleY = 100 / cropH;
  const offsetX = -(cropX * 100) / cropW;
  const offsetY = -(cropY * 100) / cropH;

  return {
    width: `${scaleX * 100}%`,
    height: `${scaleY * 100}%`,
    marginLeft: `${offsetX}%`,
    marginTop: `${offsetY}%`,
    objectFit: "cover" as const,
  };
}

type ResizeHandle =
  | "top-left"
  | "top"
  | "top-right"
  | "right"
  | "bottom-right"
  | "bottom"
  | "bottom-left"
  | "left";

interface SourceOverlayProps {
  source: Source;
  isSelected: boolean;
  containerRef: React.RefObject<HTMLDivElement>;
  onSelect: (id: string) => void;
  onMove: (id: string, x: number, y: number) => void;
  onResize: (id: string, width: number, height: number, x?: number, y?: number) => void;
  onDelete: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onContextMenu: (e: React.MouseEvent, source: Source) => void;
  snapToEdges?: boolean;
  /** Base64-encoded frame image for live preview */
  frame?: string;
  /** MediaStream for camera sources */
  stream?: MediaStream;
  /** Whether capture is currently active for this source */
  isCapturing?: boolean;
  /** Error message if capture failed */
  captureError?: string | null;
}

const RESIZE_HANDLES: ResizeHandle[] = [
  "top-left",
  "top",
  "top-right",
  "right",
  "bottom-right",
  "bottom",
  "bottom-left",
  "left",
];

const HANDLE_CURSORS: Record<ResizeHandle, string> = {
  "top-left": "nwse-resize",
  "top": "ns-resize",
  "top-right": "nesw-resize",
  "right": "ew-resize",
  "bottom-right": "nwse-resize",
  "bottom": "ns-resize",
  "bottom-left": "nesw-resize",
  "left": "ew-resize",
};

function getSourceIcon(type: Source["type"]) {
  switch (type) {
    case "screen":
      return <Monitor size={16} />;
    case "window":
      return <AppWindow size={16} />;
    case "camera":
      return <Camera size={16} />;
    case "image":
      return <Image size={16} />;
    case "text":
      return <Type size={16} />;
    default:
      return <Monitor size={16} />;
  }
}

/** Get CSS styles for camera shape (circle, rounded, rectangle).
 *  Matches the editor's CameraOverlayElement rendering exactly. */
function getCameraShapeStyle(source: Source): React.CSSProperties {
  if (source.type !== "camera") {
    return { borderRadius: "0.5rem" };
  }

  const style: React.CSSProperties = {};

  // Access optional camera shape properties via indexing
  const extra = source as unknown as Record<string, unknown>;
  const shape = extra.shape as string | undefined;
  const borderRadius = extra.borderRadius as number | undefined;
  const borderWidth = extra.borderWidth as number | undefined;
  const borderColor = extra.borderColor as string | undefined;
  const shadow = extra.shadow as boolean | undefined;

  // Border — only when explicitly set (matches editor)
  if (borderWidth && borderWidth > 0) {
    style.border = `${borderWidth}px solid ${borderColor ?? "#fff"}`;
  }

  // Shape
  if (shape === "circle") {
    style.borderRadius = "50%";
  } else if (shape === "rounded") {
    style.borderRadius = `${borderRadius ?? 20}%`;
  }
  // default: borderRadius stays "0" (no rounding) — matches editor

  if (shadow) {
    style.boxShadow = "0 4px 20px rgba(0, 0, 0, 0.5)";
  }

  return style;
}

function SourceOverlay({
  source,
  isSelected,
  containerRef,
  onSelect,
  onMove,
  onResize,
  onDelete,
  onToggleVisibility,
  onToggleLock,
  onContextMenu,
  snapToEdges = true,
  frame,
  stream,
  isCapturing,
  captureError,
}: SourceOverlayProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [activeHandle, setActiveHandle] = useState<ResizeHandle | null>(null);
  const [maintainAspectRatio, setMaintainAspectRatio] = useState(false);

  const dragStart = useRef({ mouseX: 0, mouseY: 0, x: 0, y: 0 });
  const resizeStart = useRef({
    mouseX: 0,
    mouseY: 0,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
  });

  // Drag start handler
  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (source.locked || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      onSelect(source.id);
      setIsDragging(true);
      dragStart.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        x: source.x,
        y: source.y,
      };
    },
    [source.id, source.x, source.y, source.locked, onSelect]
  );

  // Resize start handler
  const handleResizeStart = useCallback(
    (e: React.MouseEvent, handle: ResizeHandle) => {
      if (source.locked || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      setIsResizing(true);
      setActiveHandle(handle);
      setMaintainAspectRatio(e.shiftKey);
      resizeStart.current = {
        mouseX: e.clientX,
        mouseY: e.clientY,
        x: source.x,
        y: source.y,
        width: source.width,
        height: source.height,
      };
    },
    [source.id, source.x, source.y, source.width, source.height, source.locked]
  );

  // Handle mouse move for drag and resize
  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const container = containerRef.current;
    if (!container) return;

    const handleMove = (e: MouseEvent) => {
      const rect = container.getBoundingClientRect();

      // Update aspect ratio lock based on shift key
      if (isResizing) {
        setMaintainAspectRatio(e.shiftKey);
      }

      if (isDragging) {
        const dx = ((e.clientX - dragStart.current.mouseX) / rect.width) * 100;
        const dy = ((e.clientY - dragStart.current.mouseY) / rect.height) * 100;

        let newX = dragStart.current.x + dx;
        let newY = dragStart.current.y + dy;

        // Clamp to bounds
        newX = Math.max(0, Math.min(100 - source.width, newX));
        newY = Math.max(0, Math.min(100 - source.height, newY));

        // Snap to edges/center
        if (snapToEdges) {
          const snapThreshold = 2; // percentage
          const centerX = 50 - source.width / 2;
          const centerY = 50 - source.height / 2;

          // Snap to left edge
          if (Math.abs(newX) < snapThreshold) newX = 0;
          // Snap to right edge
          if (Math.abs(newX - (100 - source.width)) < snapThreshold) newX = 100 - source.width;
          // Snap to top edge
          if (Math.abs(newY) < snapThreshold) newY = 0;
          // Snap to bottom edge
          if (Math.abs(newY - (100 - source.height)) < snapThreshold) newY = 100 - source.height;
          // Snap to center X
          if (Math.abs(newX - centerX) < snapThreshold) newX = centerX;
          // Snap to center Y
          if (Math.abs(newY - centerY) < snapThreshold) newY = centerY;
        }

        onMove(source.id, newX, newY);
      } else if (isResizing && activeHandle) {
        const dx = ((e.clientX - resizeStart.current.mouseX) / rect.width) * 100;
        const dy = ((e.clientY - resizeStart.current.mouseY) / rect.height) * 100;

        let newX = resizeStart.current.x;
        let newY = resizeStart.current.y;
        let newWidth = resizeStart.current.width;
        let newHeight = resizeStart.current.height;

        const aspectRatio = source.aspectRatio ?? resizeStart.current.width / resizeStart.current.height;

        // Calculate new dimensions based on handle
        switch (activeHandle) {
          case "right":
            newWidth = resizeStart.current.width + dx;
            if (maintainAspectRatio) {
              newHeight = newWidth / aspectRatio;
            }
            break;
          case "left":
            newWidth = resizeStart.current.width - dx;
            newX = resizeStart.current.x + dx;
            if (maintainAspectRatio) {
              newHeight = newWidth / aspectRatio;
            }
            break;
          case "bottom":
            newHeight = resizeStart.current.height + dy;
            if (maintainAspectRatio) {
              newWidth = newHeight * aspectRatio;
            }
            break;
          case "top":
            newHeight = resizeStart.current.height - dy;
            newY = resizeStart.current.y + dy;
            if (maintainAspectRatio) {
              newWidth = newHeight * aspectRatio;
            }
            break;
          case "bottom-right":
            newWidth = resizeStart.current.width + dx;
            newHeight = resizeStart.current.height + dy;
            if (maintainAspectRatio) {
              const scale = Math.max(dx / resizeStart.current.width, dy / resizeStart.current.height);
              newWidth = resizeStart.current.width * (1 + scale);
              newHeight = newWidth / aspectRatio;
            }
            break;
          case "bottom-left":
            newWidth = resizeStart.current.width - dx;
            newHeight = resizeStart.current.height + dy;
            newX = resizeStart.current.x + dx;
            if (maintainAspectRatio) {
              newHeight = newWidth / aspectRatio;
            }
            break;
          case "top-right":
            newWidth = resizeStart.current.width + dx;
            newHeight = resizeStart.current.height - dy;
            newY = resizeStart.current.y + dy;
            if (maintainAspectRatio) {
              newHeight = newWidth / aspectRatio;
              newY = resizeStart.current.y + resizeStart.current.height - newHeight;
            }
            break;
          case "top-left":
            newWidth = resizeStart.current.width - dx;
            newHeight = resizeStart.current.height - dy;
            newX = resizeStart.current.x + dx;
            newY = resizeStart.current.y + dy;
            if (maintainAspectRatio) {
              const scale = Math.max(-dx / resizeStart.current.width, -dy / resizeStart.current.height);
              newWidth = resizeStart.current.width * (1 + scale);
              newHeight = newWidth / aspectRatio;
              newX = resizeStart.current.x + resizeStart.current.width - newWidth;
              newY = resizeStart.current.y + resizeStart.current.height - newHeight;
            }
            break;
        }

        // Enforce minimum size
        newWidth = Math.max(5, newWidth);
        newHeight = Math.max(5, newHeight);

        // Clamp to canvas bounds
        if (newX < 0) {
          newWidth += newX;
          newX = 0;
        }
        if (newY < 0) {
          newHeight += newY;
          newY = 0;
        }
        if (newX + newWidth > 100) {
          newWidth = 100 - newX;
        }
        if (newY + newHeight > 100) {
          newHeight = 100 - newY;
        }

        onResize(source.id, newWidth, newHeight, newX, newY);
      }
    };

    const handleUp = () => {
      setIsDragging(false);
      setIsResizing(false);
      setActiveHandle(null);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [
    isDragging,
    isResizing,
    activeHandle,
    maintainAspectRatio,
    containerRef,
    source.id,
    source.width,
    source.height,
    source.aspectRatio,
    snapToEdges,
    onMove,
    onResize,
  ]);

  // Keyboard handling for selected source
  useEffect(() => {
    if (!isSelected) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Delete/Backspace to remove
      if (e.key === "Delete" || e.key === "Backspace") {
        if (document.activeElement?.tagName !== "INPUT") {
          e.preventDefault();
          onDelete(source.id);
        }
      }

      // Arrow keys to nudge
      const nudgeAmount = e.shiftKey ? 5 : 1;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        onMove(source.id, Math.max(0, source.x - nudgeAmount), source.y);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        onMove(source.id, Math.min(100 - source.width, source.x + nudgeAmount), source.y);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        onMove(source.id, source.x, Math.max(0, source.y - nudgeAmount));
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        onMove(source.id, source.x, Math.min(100 - source.height, source.y + nudgeAmount));
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isSelected, source, onDelete, onMove]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect(source.id);
    },
    [source.id, onSelect]
  );

  const handleContextMenuEvent = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      onSelect(source.id);
      onContextMenu(e, source);
    },
    [source, onSelect, onContextMenu]
  );

  return (
    <div
      className={`absolute overflow-hidden transition-shadow ${
        isDragging || isResizing
          ? "shadow-xl shadow-blue-500/20"
          : "shadow-lg shadow-black/40"
      }`}
      style={{
        left: `${source.x}%`,
        top: `${source.y}%`,
        width: `${source.width}%`,
        height: `${source.height}%`,
        zIndex: source.zIndex,
        opacity: source.visible ? 1 : 0.4,
      }}
      onClick={handleClick}
      onContextMenu={handleContextMenuEvent}
    >
      {/* Source content - show frame or placeholder */}
      <div
        className={`w-full h-full relative transition-colors overflow-hidden ${
          source.type !== "camera"
            ? isSelected
              ? "border-2 border-blue-500"
              : "border-2 border-neutral-700 hover:border-neutral-600"
            : ""
        } ${source.locked ? "cursor-not-allowed" : "cursor-grab"} ${
          isDragging ? "cursor-grabbing" : ""
        }`}
        style={getCameraShapeStyle(source)}
        onMouseDown={handleDragStart}
      >
        {/* Frame content - video stream for cameras, image for screens/windows */}
        {stream ? (
          <StreamVideo
            stream={stream}
            className="w-full h-full object-cover"
            cropStyle={source.type === "camera" ? getCameraCropStyle(source) : undefined}
          />
        ) : frame ? (
          <img
            src={frame.startsWith("data:") ? frame : `data:image/jpeg;base64,${frame}`}
            alt={source.name}
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          /* Placeholder when no frame available */
          <div
            className={`w-full h-full flex flex-col items-center justify-center gap-2 ${
              isSelected ? "bg-blue-500/10" : "bg-neutral-900/80"
            }`}
          >
            {/* Source type icon */}
            <div
              className={`p-3 rounded-lg ${
                isSelected ? "bg-blue-500/20 text-blue-400" : "bg-neutral-800 text-neutral-400"
              }`}
            >
              {getSourceIcon(source.type)}
            </div>

            {/* Source name */}
            <span className="text-xs text-neutral-400 font-medium px-2 text-center truncate max-w-full">
              {source.name}
            </span>

            {/* Loading/Error state */}
            {isCapturing && !frame && !stream && (
              <span className="text-[10px] text-neutral-500">Loading preview...</span>
            )}
            {captureError && (
              <span className="text-[10px] text-red-400 px-2 text-center">
                {captureError}
              </span>
            )}
          </div>
        )}

        {/* Overlay for selected state on frame/stream */}
        {(frame || stream) && isSelected && (
          <div className="absolute inset-0 bg-blue-500/10 pointer-events-none" />
        )}

        {/* Status indicators */}
        <div className="absolute top-1 right-1 flex items-center gap-1">
          {isCapturing && (
            <div className="p-1 rounded bg-green-600/80">
              <div className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
            </div>
          )}
          {!source.visible && (
            <div className="p-1 rounded bg-black/50">
              <EyeOff size={10} className="text-neutral-400" />
            </div>
          )}
          {source.locked && (
            <div className="p-1 rounded bg-black/50">
              <Lock size={10} className="text-neutral-400" />
            </div>
          )}
        </div>

        {/* Source name overlay when showing frame/stream */}
        {(frame || stream) && (
          <div className="absolute bottom-1 left-1 right-1">
            <div className="px-1.5 py-0.5 rounded bg-black/60 text-[10px] text-white truncate max-w-fit">
              {source.name}
            </div>
          </div>
        )}
      </div>

      {/* Resize handles - only show when selected and not locked */}
      {isSelected && !source.locked && (
        <>
          {RESIZE_HANDLES.map((handle) => (
            <ResizeHandleComponent
              key={handle}
              handle={handle}
              isActive={activeHandle === handle}
              onMouseDown={(e) => handleResizeStart(e, handle)}
            />
          ))}
        </>
      )}

      {/* Selection overlay with source info */}
      {isSelected && (
        <div className="absolute -top-6 left-0 right-0 flex items-center justify-between px-1">
          <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-600 text-[10px] text-white font-medium">
            {getSourceIcon(source.type)}
            <span className="ml-0.5">{source.name}</span>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleVisibility(source.id);
              }}
              className="p-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200 transition-colors"
              title={source.visible ? "Hide" : "Show"}
            >
              {source.visible ? <Eye size={10} /> : <EyeOff size={10} />}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleLock(source.id);
              }}
              className="p-1 rounded bg-neutral-800 hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200 transition-colors"
              title={source.locked ? "Unlock" : "Lock"}
            >
              {source.locked ? <Lock size={10} /> : <Unlock size={10} />}
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete(source.id);
              }}
              className="p-1 rounded bg-neutral-800 hover:bg-red-600 text-neutral-400 hover:text-white transition-colors"
              title="Delete"
            >
              <Trash2 size={10} />
            </button>
          </div>
        </div>
      )}

      {/* Camera crop controls — shown below selected camera sources */}
      {isSelected && source.type === "camera" && (
        <CameraCropControls source={source} />
      )}
    </div>
  );
}

// Resize handle component
interface ResizeHandleProps {
  handle: ResizeHandle;
  isActive: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
}

function ResizeHandleComponent({ handle, isActive, onMouseDown }: ResizeHandleProps) {
  const getPosition = (): React.CSSProperties => {
    const base = {
      position: "absolute" as const,
    };

    switch (handle) {
      case "top-left":
        return { ...base, top: -4, left: -4 };
      case "top":
        return { ...base, top: -4, left: "50%", transform: "translateX(-50%)" };
      case "top-right":
        return { ...base, top: -4, right: -4 };
      case "right":
        return { ...base, top: "50%", right: -4, transform: "translateY(-50%)" };
      case "bottom-right":
        return { ...base, bottom: -4, right: -4 };
      case "bottom":
        return { ...base, bottom: -4, left: "50%", transform: "translateX(-50%)" };
      case "bottom-left":
        return { ...base, bottom: -4, left: -4 };
      case "left":
        return { ...base, top: "50%", left: -4, transform: "translateY(-50%)" };
    }
  };

  return (
    <div
      className={`w-2 h-2 rounded-sm border ${
        isActive
          ? "bg-blue-500 border-blue-400"
          : "bg-white border-blue-500 hover:bg-blue-100"
      }`}
      style={{
        ...getPosition(),
        cursor: HANDLE_CURSORS[handle],
        zIndex: 100,
      }}
      onMouseDown={onMouseDown}
    />
  );
}

// ── Camera Crop Controls ──────────────────────────────────────────────────────

function CameraCropControls({ source }: { source: Source }) {
  const { activeSceneId } = useSceneStore();
  const updateSource = useSceneStore((s) => s.updateSource);

  const extra = source as unknown as Record<string, unknown>;
  const cropX = (extra.cropX as number) ?? 0;
  const cropY = (extra.cropY as number) ?? 0;
  const cropWidth = (extra.cropWidth as number) ?? 100;
  const cropHeight = (extra.cropHeight as number) ?? 100;

  const handleChange = (key: string, value: number) => {
    if (!activeSceneId) return;
    updateSource(activeSceneId, source.id, { [key]: value } as Partial<Source>);
  };

  return (
    <div
      className="absolute left-0 right-0 bg-neutral-900/95 border border-neutral-700 rounded-b p-2 space-y-1.5 z-50"
      style={{ top: "100%" }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1 text-[10px] text-neutral-400 font-medium uppercase tracking-wider">
        <Crop size={10} /> Camera Crop
      </div>
      <CropSlider label="X" value={cropX} min={0} max={50} onChange={(v) => handleChange("cropX", v)} />
      <CropSlider label="Y" value={cropY} min={0} max={50} onChange={(v) => handleChange("cropY", v)} />
      <CropSlider label="W" value={cropWidth} min={20} max={100} onChange={(v) => handleChange("cropWidth", v)} />
      <CropSlider label="H" value={cropHeight} min={20} max={100} onChange={(v) => handleChange("cropHeight", v)} />
    </div>
  );
}

function CropSlider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-neutral-500 w-3 shrink-0">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={1}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-1 accent-blue-500"
      />
      <span className="text-[10px] text-neutral-300 w-8 text-right tabular-nums font-mono">
        {Math.round(value)}%
      </span>
    </div>
  );
}

export default memo(SourceOverlay);
