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
  Plus,
} from "lucide-react";
import { useActiveScene } from "@/hooks/useActiveScene";
import { useSourceActions } from "@/hooks/useSourceActions";
import { useSceneStore, type Source } from "@/stores/sceneStore";

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

/* ── Source row ─────────────────────────────────────────────── */

interface SourceItemProps {
  source: Source;
  isSelected: boolean;
  onSelect: () => void;
  onToggleVisibility: () => void;
  onToggleLock: () => void;
  onDelete: () => void;
}

function SourceItem({
  source,
  isSelected,
  onSelect,
  onToggleVisibility,
  onToggleLock,
  onDelete,
}: SourceItemProps) {
  return (
    <div
      onClick={onSelect}
      className={`flex items-center h-7 px-2 rounded-md cursor-pointer transition-colors ${
        isSelected
          ? "bg-blue-600/20 ring-1 ring-blue-500/40"
          : "bg-neutral-800/40 hover:bg-neutral-800"
      }`}
    >
      {/* Type icon */}
      <div
        className={`shrink-0 mr-1.5 ${
          isSelected ? "text-blue-400" : "text-neutral-500"
        }`}
      >
        {getSourceIcon(source.type)}
      </div>

      {/* Name — flex-1 so it uses available space, truncate if needed */}
      <span
        className={`flex-1 min-w-0 text-xs truncate mr-2 ${
          isSelected ? "text-neutral-100" : "text-neutral-300"
        } ${!source.visible ? "opacity-40" : ""}`}
      >
        {source.name}
      </span>

      {/* Action buttons — pushed to right edge */}
      <div className="flex items-center shrink-0 ml-auto">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleVisibility();
          }}
          className={`p-0.5 rounded transition-colors ${
            source.visible
              ? "text-neutral-500 hover:text-neutral-200"
              : "text-yellow-500 hover:text-yellow-400"
          }`}
          title={source.visible ? "Hide" : "Show"}
        >
          {source.visible ? <Eye size={12} /> : <EyeOff size={12} />}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleLock();
          }}
          className={`p-0.5 rounded transition-colors ${
            source.locked
              ? "text-orange-500 hover:text-orange-400"
              : "text-neutral-500 hover:text-neutral-200"
          }`}
          title={source.locked ? "Unlock" : "Lock"}
        >
          {source.locked ? <Lock size={12} /> : <Unlock size={12} />}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-0.5 rounded text-neutral-500 hover:text-red-400 transition-colors"
          title="Delete"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
}

/* ── Source list panel ──────────────────────────────────────── */

interface SourceListProps {
  onAddSourceClick: () => void;
}

function SourceList({ onAddSourceClick }: SourceListProps) {
  const { sources } = useActiveScene();
  const selectedSourceId = useSceneStore((state) => state.selectedSourceId);
  const { selectSource, toggleVisibility, toggleLock, removeSource } =
    useSourceActions();

  // Highest z-index first (front → back)
  const sortedSources = [...sources].reverse();

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-2.5 pb-1.5 mb-1 border-b border-neutral-800">
        <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">
          Sources
        </span>
        <button
          onClick={onAddSourceClick}
          className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded bg-blue-600 hover:bg-blue-500 text-white transition-colors"
        >
          <Plus size={12} />
          Add
        </button>
      </div>

      {/* List — vertical layout, one source per row */}
      <div className="flex-1 overflow-y-auto px-1.5 pt-1">
        {sortedSources.length === 0 ? (
          <div className="flex items-center justify-center py-4 text-xs text-neutral-500">
            No sources — click "Add"
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {sortedSources.map((source) => (
              <SourceItem
                key={source.id}
                source={source}
                isSelected={source.id === selectedSourceId}
                onSelect={() => selectSource(source.id)}
                onToggleVisibility={() => toggleVisibility(source.id)}
                onToggleLock={() => toggleLock(source.id)}
                onDelete={() => removeSource(source.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(SourceList);
