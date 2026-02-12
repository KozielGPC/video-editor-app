import { useCallback, memo } from "react";
import {
  Monitor,
  Camera,
  Image,
  Type,
  AppWindow,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Trash2,
  ChevronUp,
  ChevronDown,
  Plus,
  GripVertical,
} from "lucide-react";
import { useActiveScene } from "@/hooks/useActiveScene";
import { useSourceActions } from "@/hooks/useSourceActions";
import { useSceneStore, type Source } from "@/stores/sceneStore";

interface SourceItemProps {
  source: Source;
  isSelected: boolean;
  onSelect: () => void;
  onToggleVisibility: () => void;
  onToggleLock: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}

function getSourceIcon(type: Source["type"]) {
  switch (type) {
    case "screen":
      return <Monitor size={14} />;
    case "camera":
      return <Camera size={14} />;
    case "window":
      return <AppWindow size={14} />;
    case "image":
      return <Image size={14} />;
    case "text":
      return <Type size={14} />;
    default:
      return <Monitor size={14} />;
  }
}

function SourceItem({
  source,
  isSelected,
  onSelect,
  onToggleVisibility,
  onToggleLock,
  onMoveUp,
  onMoveDown,
  onDelete,
}: SourceItemProps) {
  return (
    <div
      onClick={onSelect}
      className={`group flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all ${
        isSelected
          ? "bg-blue-600/20 border border-blue-500/50"
          : "bg-neutral-800/30 border border-transparent hover:bg-neutral-800/60 hover:border-neutral-700"
      }`}
    >
      {/* Drag handle */}
      <div className="opacity-30 group-hover:opacity-60 cursor-grab">
        <GripVertical size={12} className="text-neutral-500" />
      </div>

      {/* Icon */}
      <div
        className={`shrink-0 ${
          isSelected ? "text-blue-400" : "text-neutral-500"
        }`}
      >
        {getSourceIcon(source.type)}
      </div>

      {/* Name */}
      <span
        className={`flex-1 text-xs font-medium truncate ${
          isSelected ? "text-blue-300" : "text-neutral-300"
        } ${!source.visible ? "opacity-50" : ""}`}
      >
        {source.name}
      </span>

      {/* Status indicators */}
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        {/* Move up */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onMoveUp();
          }}
          className="p-1 rounded hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200 transition-colors"
          title="Move Up"
        >
          <ChevronUp size={12} />
        </button>

        {/* Move down */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onMoveDown();
          }}
          className="p-1 rounded hover:bg-neutral-700 text-neutral-400 hover:text-neutral-200 transition-colors"
          title="Move Down"
        >
          <ChevronDown size={12} />
        </button>

        {/* Visibility */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleVisibility();
          }}
          className={`p-1 rounded hover:bg-neutral-700 transition-colors ${
            source.visible
              ? "text-neutral-400 hover:text-neutral-200"
              : "text-yellow-500"
          }`}
          title={source.visible ? "Hide" : "Show"}
        >
          {source.visible ? <Eye size={12} /> : <EyeOff size={12} />}
        </button>

        {/* Lock */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleLock();
          }}
          className={`p-1 rounded hover:bg-neutral-700 transition-colors ${
            source.locked
              ? "text-orange-500"
              : "text-neutral-400 hover:text-neutral-200"
          }`}
          title={source.locked ? "Unlock" : "Lock"}
        >
          {source.locked ? <Lock size={12} /> : <Unlock size={12} />}
        </button>

        {/* Delete */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-1 rounded hover:bg-red-600 text-neutral-400 hover:text-white transition-colors"
          title="Delete"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Always visible status indicators */}
      {(!source.visible || source.locked) && (
        <div className="flex items-center gap-1 group-hover:hidden">
          {!source.visible && <EyeOff size={10} className="text-yellow-500" />}
          {source.locked && <Lock size={10} className="text-orange-500" />}
        </div>
      )}
    </div>
  );
}

interface SourceListProps {
  onAddSourceClick: () => void;
}

function SourceList({ onAddSourceClick }: SourceListProps) {
  const { sources, selectedSource } = useActiveScene();
  const selectedSourceId = useSceneStore((state) => state.selectedSourceId);
  const {
    selectSource,
    toggleVisibility,
    toggleLock,
    reorderSource,
    removeSource,
  } = useSourceActions();

  // Reverse sources so highest z-index is at top of list
  const sortedSources = [...sources].reverse();

  const handleMoveUp = useCallback(
    (sourceId: string) => {
      reorderSource(sourceId, "up");
    },
    [reorderSource]
  );

  const handleMoveDown = useCallback(
    (sourceId: string) => {
      reorderSource(sourceId, "down");
    },
    [reorderSource]
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between pb-2 mb-2 border-b border-neutral-800">
        <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
          Sources
        </span>
        <button
          onClick={onAddSourceClick}
          className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors"
        >
          <Plus size={12} />
          Add
        </button>
      </div>

      {/* Source list */}
      <div className="flex-1 overflow-y-auto space-y-1">
        {sortedSources.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="p-3 mb-2 rounded-full bg-neutral-800">
              <Monitor size={20} className="text-neutral-500" />
            </div>
            <p className="text-xs text-neutral-400 font-medium">No sources</p>
            <p className="text-[10px] text-neutral-500 mt-1">
              Click "Add" to add sources
            </p>
          </div>
        ) : (
          sortedSources.map((source) => (
            <SourceItem
              key={source.id}
              source={source}
              isSelected={source.id === selectedSourceId}
              onSelect={() => selectSource(source.id)}
              onToggleVisibility={() => toggleVisibility(source.id)}
              onToggleLock={() => toggleLock(source.id)}
              onMoveUp={() => handleMoveUp(source.id)}
              onMoveDown={() => handleMoveDown(source.id)}
              onDelete={() => removeSource(source.id)}
            />
          ))
        )}
      </div>

      {/* Footer with count */}
      {sortedSources.length > 0 && (
        <div className="pt-2 mt-2 border-t border-neutral-800">
          <p className="text-[10px] text-neutral-500 text-center">
            {sortedSources.length} source{sortedSources.length !== 1 ? "s" : ""}{" "}
            in scene
          </p>
        </div>
      )}
    </div>
  );
}

export default memo(SourceList);
