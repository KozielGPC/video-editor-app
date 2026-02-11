import { memo } from "react";
import * as Tooltip from "@radix-ui/react-tooltip";
import type { LucideIcon } from "lucide-react";
import {
  MousePointer,
  Scissors,
  Type,
  ZoomIn,
  Trash2,
  Undo2,
  Redo2,
  Plus,
  Download,
} from "lucide-react";
import { useEditorStore, type Tool } from "@/stores/editorStore";

// ─── Tool definitions ────────────────────────────────────────────────────────

const TOOLS: {
  id: Tool;
  icon: LucideIcon;
  label: string;
  shortcut: string;
}[] = [
  { id: "select", icon: MousePointer, label: "Select", shortcut: "V" },
  { id: "cut", icon: Scissors, label: "Cut", shortcut: "C" },
  { id: "text", icon: Type, label: "Text", shortcut: "T" },
  { id: "zoom", icon: ZoomIn, label: "Zoom", shortcut: "Z" },
];

// ─── Component ───────────────────────────────────────────────────────────────

function Toolbar() {
  const {
    tool,
    setTool,
    splitClipAtPlayhead,
    removeClip,
    selectedClipId,
    selectedTrackId,
    undo,
    redo,
  } = useEditorStore();

  const handleDelete = () => {
    if (selectedClipId && selectedTrackId) {
      removeClip(selectedTrackId, selectedClipId);
    }
  };

  const handleImport = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const result = await open({
        multiple: true,
        filters: [
          {
            name: "Media",
            extensions: [
              "mp4", "mov", "avi", "mkv", "webm",
              "mp3", "wav", "aac", "flac", "ogg",
              "png", "jpg", "jpeg", "gif", "webp",
            ],
          },
        ],
      });
      if (result) {
        console.log("Imported files:", result);
        // TODO: process imported files and add as assets
      }
    } catch (err) {
      console.error("Import failed:", err);
    }
  };

  return (
    <Tooltip.Provider delayDuration={300}>
      <div className="flex items-center gap-0.5 px-2 py-1 bg-neutral-900 border-b border-neutral-700 flex-none select-none">
        {/* ── Tool selector ──────────────────────────────────────── */}
        {TOOLS.map((t) => (
          <ToolBtn
            key={t.id}
            icon={t.icon}
            tooltip={`${t.label} (${t.shortcut})`}
            isActive={tool === t.id}
            onClick={() => setTool(t.id)}
          />
        ))}

        <Sep />

        {/* ── Actions ────────────────────────────────────────────── */}
        <ToolBtn
          icon={Scissors}
          tooltip="Split at Playhead (S)"
          onClick={splitClipAtPlayhead}
        />
        <ToolBtn
          icon={Trash2}
          tooltip="Delete (Del)"
          onClick={handleDelete}
          disabled={!selectedClipId}
        />

        <Sep />

        {/* ── Undo / Redo ────────────────────────────────────────── */}
        <ToolBtn icon={Undo2} tooltip="Undo (⌘Z)" onClick={undo} />
        <ToolBtn icon={Redo2} tooltip="Redo (⌘⇧Z)" onClick={redo} />

        <Sep />

        {/* ── Import ─────────────────────────────────────────────── */}
        <ToolBtn icon={Plus} tooltip="Import Media" onClick={handleImport} />

        <Sep />

        {/* ── Export ─────────────────────────────────────────────── */}
        <ToolBtn
          icon={Download}
          tooltip="Export"
          onClick={() => {
            // TODO: open export dialog
            console.log("Export");
          }}
        />
      </div>
    </Tooltip.Provider>
  );
}

// ─── Tool Button ─────────────────────────────────────────────────────────────

interface ToolBtnProps {
  icon: LucideIcon;
  tooltip: string;
  isActive?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

function ToolBtn({
  icon: Icon,
  tooltip,
  isActive = false,
  disabled = false,
  onClick,
}: ToolBtnProps) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          className={`flex items-center justify-center w-7 h-7 rounded transition-colors
            ${isActive ? "bg-blue-600 text-white" : "text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"}
            ${disabled ? "opacity-30 pointer-events-none" : ""}
          `}
          onClick={onClick}
          disabled={disabled}
        >
          <Icon size={15} />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className="bg-neutral-800 text-neutral-200 text-[11px] px-2 py-1 rounded
            shadow-lg border border-neutral-700 z-[200]"
          sideOffset={6}
        >
          {tooltip}
          <Tooltip.Arrow className="fill-neutral-800" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

// ─── Separator ───────────────────────────────────────────────────────────────

function Sep() {
  return <div className="w-px h-5 mx-1 bg-neutral-700" />;
}

export default memo(Toolbar);
