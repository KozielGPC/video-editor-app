import { useCallback, useRef, useState, useEffect, memo } from "react";
import {
  Layers,
  ChevronUp,
  ChevronDown,
  ChevronsUp,
  ChevronsDown,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Trash2,
  Copy,
} from "lucide-react";
import { useSceneStore, type Source, type AspectRatioPreset } from "@/stores/sceneStore";
import { useActiveScene } from "@/hooks/useActiveScene";
import { useSourceActions } from "@/hooks/useSourceActions";
import { useCaptureStream } from "@/hooks/useCaptureStream";
import SourceOverlay from "./SourceOverlay";
import ScenePresetPicker from "@/components/editor/ScenePresetPicker";

// Aspect ratio dimensions for display
const ASPECT_RATIOS: Record<AspectRatioPreset, { w: number; h: number } | null> = {
  "16:9": { w: 16, h: 9 },
  "9:16": { w: 9, h: 16 },
  "4:3": { w: 4, h: 3 },
  "1:1": { w: 1, h: 1 },
  custom: null,
};

interface ContextMenuState {
  x: number;
  y: number;
  source: Source;
}

function SceneCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // Get active scene data
  const { sources, selectedSource, hasActiveScene } = useActiveScene();
  const selectedSourceId = useSceneStore((state) => state.selectedSourceId);
  const canvasSettings = useSceneStore((state) => state.canvasSettings);
  const setAspectRatio = useSceneStore((state) => state.setAspectRatio);

  // Capture streaming for live preview
  const { frames, streams, status } = useCaptureStream(sources);

  // Source actions
  const {
    selectSource,
    moveSource,
    resizeSource,
    removeSource,
    updateSource,
    addSource,
    reorderSource,
    toggleVisibility,
    toggleLock,
  } = useSourceActions();

  // Scene preset support
  const applyScenePreset = useSceneStore((state) => state.applyScenePreset);
  const hasCamera = sources.some((s) => s.type === "camera");

  // Sort sources by z-index for rendering
  const sortedSources = [...sources].sort((a, b) => a.zIndex - b.zIndex);

  // Calculate canvas dimensions based on aspect ratio
  const aspectRatio = ASPECT_RATIOS[canvasSettings.aspectRatio];
  const aspectRatioValue = aspectRatio ? aspectRatio.w / aspectRatio.h : 16 / 9;

  // ── Observe container and compute exact letterboxed canvas size ──
  // Uses the same approach as the editor's PreviewCanvas so the camera
  // overlay proportions are identical regardless of window size.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setContainerSize({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const canvasDims = (() => {
    if (containerSize.width === 0 || containerSize.height === 0) {
      return { width: 0, height: 0 };
    }
    const cAspect = containerSize.width / containerSize.height;
    let w: number, h: number;
    if (aspectRatioValue > cAspect) {
      w = containerSize.width;
      h = w / aspectRatioValue;
    } else {
      h = containerSize.height;
      w = h * aspectRatioValue;
    }
    return { width: Math.round(w), height: Math.round(h) };
  })();

  // Deselect when clicking canvas background
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === canvasRef.current) {
        selectSource(null);
        setContextMenu(null);
      }
    },
    [selectSource]
  );

  // Context menu for sources
  const handleSourceContextMenu = useCallback(
    (e: React.MouseEvent, source: Source) => {
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        source,
      });
    },
    []
  );

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => setContextMenu(null);
    if (contextMenu) {
      window.addEventListener("click", handleClick);
      return () => window.removeEventListener("click", handleClick);
    }
  }, [contextMenu]);

  // Toggle visibility
  const handleToggleVisibility = useCallback(
    (id: string) => {
      toggleVisibility(id);
    },
    [toggleVisibility]
  );

  // Toggle lock
  const handleToggleLock = useCallback(
    (id: string) => {
      toggleLock(id);
    },
    [toggleLock]
  );

  // Duplicate source
  const handleDuplicateSource = useCallback(
    (source: Source) => {
      addSource({
        type: source.type,
        sourceId: source.sourceId,
        name: `${source.name} (copy)`,
        x: Math.min(source.x + 5, 100 - source.width),
        y: Math.min(source.y + 5, 100 - source.height),
        width: source.width,
        height: source.height,
        visible: source.visible,
        locked: false,
        aspectRatio: source.aspectRatio,
      });
    },
    [addSource]
  );

  // Handle move
  const handleMove = useCallback(
    (id: string, x: number, y: number) => {
      moveSource(id, x, y);
    },
    [moveSource]
  );

  // Handle resize
  const handleResize = useCallback(
    (id: string, width: number, height: number, x?: number, y?: number) => {
      resizeSource(id, width, height);
      // If x/y are provided, also update position
      if (x !== undefined && y !== undefined) {
        moveSource(id, x, y);
      }
    },
    [resizeSource, moveSource]
  );

  // Handle delete
  const handleDelete = useCallback(
    (id: string) => {
      removeSource(id);
    },
    [removeSource]
  );

  // Reorder actions for context menu
  const handleBringToFront = useCallback(
    (id: string) => {
      reorderSource(id, "top");
    },
    [reorderSource]
  );

  const handleSendToBack = useCallback(
    (id: string) => {
      reorderSource(id, "bottom");
    },
    [reorderSource]
  );

  const handleBringForward = useCallback(
    (id: string) => {
      reorderSource(id, "up");
    },
    [reorderSource]
  );

  const handleSendBackward = useCallback(
    (id: string) => {
      reorderSource(id, "down");
    },
    [reorderSource]
  );

  return (
    <div className="relative flex flex-col h-full">
      {/* Toolbar — scene presets (left) + aspect ratio (right) */}
      <div className="flex items-center justify-between gap-2 pb-2 mb-2 border-b border-neutral-800">
        {hasCamera ? (
          <ScenePresetPicker onSelect={applyScenePreset} />
        ) : (
          <div />
        )}

        {/* Aspect ratio selector */}
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-xs text-neutral-500">Ratio:</span>
          <select
            value={canvasSettings.aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value as AspectRatioPreset)}
            className="px-2 py-1 text-xs bg-neutral-800 border border-neutral-700 rounded-lg text-neutral-300 focus:outline-none focus:border-blue-500"
          >
            <option value="16:9">16:9</option>
            <option value="9:16">9:16 (Vertical)</option>
            <option value="4:3">4:3</option>
            <option value="1:1">1:1 (Square)</option>
          </select>
        </div>
      </div>

      {/* Canvas container */}
      <div
        ref={containerRef}
        className="relative flex-1 flex items-center justify-center bg-neutral-950 rounded-xl border border-neutral-800 overflow-hidden"
      >
        {/* Canvas — exact pixel dimensions computed via ResizeObserver,
             matching the editor's letterboxing so overlays look identical */}
        <div
          ref={canvasRef}
          className="relative bg-neutral-900 rounded-lg shadow-2xl overflow-visible"
          style={{
            width: canvasDims.width,
            height: canvasDims.height,
          }}
          onClick={handleCanvasClick}
        >
          {/* Grid overlay */}
          {canvasSettings.showGrid && <GridOverlay gridSize={canvasSettings.gridSize} />}

          {/* Center guides */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute left-1/2 top-0 bottom-0 w-px bg-neutral-700/30" />
            <div className="absolute top-1/2 left-0 right-0 h-px bg-neutral-700/30" />
          </div>

          {/* Sources */}
          {sortedSources.map((source) => {
            const sourceStatus = status.get(source.id);
            return (
              <SourceOverlay
                key={source.id}
                source={source}
                isSelected={selectedSourceId === source.id}
                containerRef={canvasRef as React.RefObject<HTMLDivElement>}
                onSelect={selectSource}
                onMove={handleMove}
                onResize={handleResize}
                onDelete={handleDelete}
                onToggleVisibility={handleToggleVisibility}
                onToggleLock={handleToggleLock}
                onContextMenu={handleSourceContextMenu}
                snapToEdges={canvasSettings.snapToEdges}
                frame={frames.get(source.id)}
                stream={streams.get(source.id)}
                isCapturing={sourceStatus?.isCapturing}
                captureError={sourceStatus?.error}
              />
            );
          })}

          {/* Empty state */}
          {sources.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-neutral-500">
              <Layers size={40} strokeWidth={1.5} />
              <div className="text-center">
                <p className="text-sm font-medium">No sources added</p>
                <p className="text-xs text-neutral-600 mt-1">
                  Click "Add" in the sidebar to add sources
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Context menu */}
        {contextMenu && (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            source={contextMenu.source}
            onBringToFront={() => handleBringToFront(contextMenu.source.id)}
            onSendToBack={() => handleSendToBack(contextMenu.source.id)}
            onBringForward={() => handleBringForward(contextMenu.source.id)}
            onSendBackward={() => handleSendBackward(contextMenu.source.id)}
            onToggleVisibility={() => handleToggleVisibility(contextMenu.source.id)}
            onToggleLock={() => handleToggleLock(contextMenu.source.id)}
            onDuplicate={() => handleDuplicateSource(contextMenu.source)}
            onDelete={() => handleDelete(contextMenu.source.id)}
            onClose={() => setContextMenu(null)}
          />
        )}
      </div>
    </div>
  );
}

// Grid overlay component
function GridOverlay({ gridSize }: { gridSize: number }) {
  const lines = [];
  for (let i = gridSize; i < 100; i += gridSize) {
    lines.push(
      <div
        key={`v-${i}`}
        className="absolute top-0 bottom-0 w-px bg-neutral-700/20"
        style={{ left: `${i}%` }}
      />,
      <div
        key={`h-${i}`}
        className="absolute left-0 right-0 h-px bg-neutral-700/20"
        style={{ top: `${i}%` }}
      />
    );
  }
  return <div className="absolute inset-0 pointer-events-none">{lines}</div>;
}

// Context menu component
interface ContextMenuProps {
  x: number;
  y: number;
  source: Source;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onToggleVisibility: () => void;
  onToggleLock: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClose: () => void;
}

function ContextMenu({
  x,
  y,
  source,
  onBringToFront,
  onSendToBack,
  onBringForward,
  onSendBackward,
  onToggleVisibility,
  onToggleLock,
  onDuplicate,
  onDelete,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Adjust position to keep menu on screen
  useEffect(() => {
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      if (rect.right > window.innerWidth) {
        menuRef.current.style.left = `${x - rect.width}px`;
      }
      if (rect.bottom > window.innerHeight) {
        menuRef.current.style.top = `${y - rect.height}px`;
      }
    }
  }, [x, y]);

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[180px] py-1 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl"
      style={{ left: x, top: y }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="px-3 py-1.5 text-xs text-neutral-400 font-medium border-b border-neutral-800">
        {source.name}
      </div>

      {/* Layer controls */}
      <div className="py-1 border-b border-neutral-800">
        <ContextMenuItem icon={<ChevronsUp size={14} />} label="Bring to Front" onClick={onBringToFront} />
        <ContextMenuItem icon={<ChevronUp size={14} />} label="Bring Forward" onClick={onBringForward} />
        <ContextMenuItem icon={<ChevronDown size={14} />} label="Send Backward" onClick={onSendBackward} />
        <ContextMenuItem icon={<ChevronsDown size={14} />} label="Send to Back" onClick={onSendToBack} />
      </div>

      {/* Visibility & lock */}
      <div className="py-1 border-b border-neutral-800">
        <ContextMenuItem
          icon={source.visible ? <EyeOff size={14} /> : <Eye size={14} />}
          label={source.visible ? "Hide" : "Show"}
          onClick={onToggleVisibility}
        />
        <ContextMenuItem
          icon={source.locked ? <Unlock size={14} /> : <Lock size={14} />}
          label={source.locked ? "Unlock" : "Lock"}
          onClick={onToggleLock}
        />
      </div>

      {/* Actions */}
      <div className="py-1">
        <ContextMenuItem icon={<Copy size={14} />} label="Duplicate" onClick={onDuplicate} />
        <ContextMenuItem
          icon={<Trash2 size={14} />}
          label="Delete"
          onClick={onDelete}
          variant="danger"
        />
      </div>
    </div>
  );
}

interface ContextMenuItemProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  variant?: "default" | "danger";
}

function ContextMenuItem({ icon, label, onClick, variant = "default" }: ContextMenuItemProps) {
  return (
    <button
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
        variant === "danger"
          ? "text-red-400 hover:bg-red-500/20"
          : "text-neutral-300 hover:bg-neutral-800"
      }`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {icon}
      {label}
    </button>
  );
}

export default memo(SceneCanvas);
