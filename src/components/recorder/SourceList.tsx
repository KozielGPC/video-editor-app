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
      className={`flex items-center h-8 px-2.5 rounded cursor-pointer transition-colors ${
        isSelected
          ? "bg-blue-600/20"
          : "hover:bg-neutral-800/60"
      }`}
    >
      {/* Type icon */}
      <div
        className={`shrink-0 mr-2 ${
          isSelected ? "text-blue-400" : "text-neutral-500"
        }`}
      >
        {getSourceIcon(source.type)}
      </div>

      {/* Name */}
      <span
        className={`flex-1 text-[13px] truncate mr-2 ${
          isSelected ? "text-neutral-100" : "text-neutral-300"
        } ${!source.visible ? "opacity-40" : ""}`}
      >
        {source.name}
      </span>

      {/* Action buttons — always visible */}
      <div className="flex items-center shrink-0">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleVisibility();
          }}
          className={`p-1 rounded transition-colors ${
            source.visible
              ? "text-neutral-500 hover:text-neutral-200"
              : "text-yellow-500 hover:text-yellow-400"
          }`}
          title={source.visible ? "Hide" : "Show"}
        >
          {source.visible ? <Eye size={14} /> : <EyeOff size={14} />}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleLock();
          }}
          className={`p-1 rounded transition-colors ${
            source.locked
              ? "text-orange-500 hover:text-orange-400"
              : "text-neutral-500 hover:text-neutral-200"
          }`}
          title={source.locked ? "Unlock" : "Lock"}
        >
          {source.locked ? <Lock size={14} /> : <Unlock size={14} />}
        </button>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="p-1 rounded text-neutral-500 hover:text-red-400 transition-colors"
          title="Delete"
        >
          <Trash2 size={14} />
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

      {/* List */}
      <div className="flex-1 overflow-y-auto space-y-px">
        {sortedSources.length === 0 ? (
          <div className="flex items-center justify-center py-4 text-xs text-neutral-500">
            No sources — click "Add"
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
              onDelete={() => removeSource(source.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

export default memo(SourceList);
