import { useState, useCallback, useRef, useEffect, memo } from "react";
import {
  Plus,
  MoreHorizontal,
  Edit2,
  Copy,
  Trash2,
  Check,
  X,
} from "lucide-react";
import { useSceneStore, type Scene } from "@/stores/sceneStore";
import { useSceneActions } from "@/hooks/useSourceActions";

interface SceneTabProps {
  scene: Scene;
  isActive: boolean;
  onActivate: () => void;
  onRename: (name: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  canDelete: boolean;
}

function SceneTab({
  scene,
  isActive,
  onActivate,
  onRename,
  onDuplicate,
  onDelete,
  canDelete,
}: SceneTabProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState(scene.name);
  const [showMenu, setShowMenu] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Close menu when clicking outside
  useEffect(() => {
    if (!showMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false);
      }
    };
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, [showMenu]);

  const handleStartEdit = useCallback(() => {
    setEditName(scene.name);
    setIsEditing(true);
    setShowMenu(false);
  }, [scene.name]);

  const handleSaveEdit = useCallback(() => {
    const trimmed = editName.trim();
    if (trimmed && trimmed !== scene.name) {
      onRename(trimmed);
    }
    setIsEditing(false);
  }, [editName, scene.name, onRename]);

  const handleCancelEdit = useCallback(() => {
    setEditName(scene.name);
    setIsEditing(false);
  }, [scene.name]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleSaveEdit();
      } else if (e.key === "Escape") {
        handleCancelEdit();
      }
    },
    [handleSaveEdit, handleCancelEdit]
  );

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setShowMenu(true);
  }, []);

  const handleMenuClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setShowMenu((prev) => !prev);
  }, []);

  const handleDuplicate = useCallback(() => {
    onDuplicate();
    setShowMenu(false);
  }, [onDuplicate]);

  const handleDelete = useCallback(() => {
    onDelete();
    setShowMenu(false);
  }, [onDelete]);

  return (
    <div className="relative group">
      <div
        onClick={onActivate}
        onContextMenu={handleContextMenu}
        onDoubleClick={handleStartEdit}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg cursor-pointer transition-all ${
          isActive
            ? "bg-blue-600/20 border border-blue-500/50 text-blue-300"
            : "bg-neutral-800/50 border border-neutral-700 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-300 hover:border-neutral-600"
        }`}
      >
        {isEditing ? (
          <div className="flex items-center gap-1">
            <input
              ref={inputRef}
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleSaveEdit}
              className="w-24 px-1.5 py-0.5 text-xs bg-neutral-900 border border-neutral-600 rounded text-neutral-200 focus:outline-none focus:border-blue-500"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleSaveEdit();
              }}
              className="p-0.5 rounded hover:bg-neutral-700"
            >
              <Check size={12} className="text-green-400" />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleCancelEdit();
              }}
              className="p-0.5 rounded hover:bg-neutral-700"
            >
              <X size={12} className="text-neutral-400" />
            </button>
          </div>
        ) : (
          <>
            <span className="text-xs font-medium max-w-[100px] truncate">
              {scene.name}
            </span>
            <span className="text-[10px] text-neutral-500">
              ({scene.sources.length})
            </span>
            <button
              onClick={handleMenuClick}
              className="p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-neutral-700 transition-opacity"
            >
              <MoreHorizontal size={12} />
            </button>
          </>
        )}
      </div>

      {/* Context menu */}
      {showMenu && (
        <div
          ref={menuRef}
          className="absolute top-full left-0 mt-1 min-w-[140px] py-1 bg-neutral-900 border border-neutral-700 rounded-lg shadow-xl z-50"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={handleStartEdit}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 transition-colors"
          >
            <Edit2 size={12} />
            Rename
          </button>
          <button
            onClick={handleDuplicate}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-neutral-300 hover:bg-neutral-800 transition-colors"
          >
            <Copy size={12} />
            Duplicate
          </button>
          {canDelete && (
            <>
              <div className="h-px my-1 bg-neutral-700" />
              <button
                onClick={handleDelete}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-red-400 hover:bg-red-500/20 transition-colors"
              >
                <Trash2 size={12} />
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function SceneBar() {
  const scenes = useSceneStore((state) => state.scenes);
  const activeSceneId = useSceneStore((state) => state.activeSceneId);
  const { createScene, setActiveScene, renameScene, duplicateScene, deleteScene } =
    useSceneActions();

  const handleAddScene = useCallback(() => {
    const name = `Scene ${scenes.length + 1}`;
    const id = createScene(name);
    setActiveScene(id);
  }, [scenes.length, createScene, setActiveScene]);

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      {scenes.map((scene) => (
        <SceneTab
          key={scene.id}
          scene={scene}
          isActive={scene.id === activeSceneId}
          onActivate={() => setActiveScene(scene.id)}
          onRename={(name) => renameScene(scene.id, name)}
          onDuplicate={() => duplicateScene(scene.id)}
          onDelete={() => deleteScene(scene.id)}
          canDelete={scenes.length > 1}
        />
      ))}

      <button
        onClick={handleAddScene}
        className="flex items-center gap-1 px-2 py-1.5 rounded-lg border border-dashed border-neutral-700 text-neutral-500 hover:text-neutral-300 hover:border-neutral-600 hover:bg-neutral-800/50 transition-all"
        title="Add Scene"
      >
        <Plus size={14} />
        <span className="text-xs">Add Scene</span>
      </button>
    </div>
  );
}

export default memo(SceneBar);
