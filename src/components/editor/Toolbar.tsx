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
  Save,
} from "lucide-react";
import { useEditorStore, type Tool } from "@/stores/editorStore";
import { useUIStore } from "@/stores/uiStore";
import { probeMedia } from "@/lib/ffmpeg";

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
    isDirty,
    projectDir,
    saveProject,
  } = useEditorStore();

  const handleDelete = () => {
    if (selectedClipId && selectedTrackId) {
      removeClip(selectedTrackId, selectedClipId);
    }
  };

  const handleImport = async () => {
    const { project, createProjectFromRecording } = useEditorStore.getState();
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const result = await open({
        multiple: false,
        filters: [
          {
            name: "Media",
            extensions: [
              "mp4", "mov", "avi", "mkv", "webm", "m4v",
              "mp3", "wav", "aac", "flac", "ogg",
            ],
          },
        ],
      });
      if (!result) return;
      const filePath = typeof result === "string" ? result : result;
      const mediaInfo = await probeMedia(filePath);
      const durationSec = mediaInfo.duration_ms / 1000;

      if (!project) {
        // No project open — create one from the imported file
        createProjectFromRecording(filePath, durationSec);
      } else {
        // Project exists — add file as a new asset and clip
        const { v4: uuidv4 } = await import("uuid");
        const { addClip, _pushHistory } = useEditorStore.getState();
        const currentProject = useEditorStore.getState().project;
        if (!currentProject) return;

        _pushHistory();

        const assetId = uuidv4();
        const fileName = filePath.split("/").pop() ?? "Imported";
        const isAudio = ["mp3", "wav", "aac", "flac", "ogg"].some((ext) =>
          filePath.toLowerCase().endsWith(`.${ext}`),
        );

        const newAsset = {
          id: assetId,
          name: fileName,
          path: filePath,
          type: (isAudio ? "audio" : "video") as "video" | "audio",
          duration: durationSec,
          width: mediaInfo.width,
          height: mediaInfo.height,
        };

        // Find the appropriate track
        const trackType = isAudio ? "audio" : "video";
        const track = currentProject.tracks.find((t) => t.type === trackType);
        if (!track) return;

        // Place clip at the end of existing clips
        const trackEnd = track.clips.reduce((max, c) => {
          const end = c.trackPosition + (c.sourceEnd - c.sourceStart);
          return Math.max(max, end);
        }, 0);

        const newClip = {
          id: uuidv4(),
          assetId,
          trackPosition: trackEnd,
          sourceStart: 0,
          sourceEnd: durationSec,
          volume: 1,
          effects: [],
          overlays: [],
        };

        // Update project with new asset and add clip
        useEditorStore.setState({
          project: {
            ...currentProject,
            assets: [...currentProject.assets, newAsset],
          },
        });
        addClip(track.id, newClip);
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

        {/* ── Save ───────────────────────────────────────────────── */}
        <div className="relative">
          <ToolBtn
            icon={Save}
            tooltip={`Save Project (${"\u2318"}S)`}
            onClick={() => saveProject()}
            disabled={!projectDir}
          />
          {isDirty && projectDir && (
            <div className="absolute top-0.5 right-0.5 w-2 h-2 rounded-full bg-orange-400" />
          )}
        </div>

        {/* ── Export ─────────────────────────────────────────────── */}
        <ToolBtn
          icon={Download}
          tooltip="Export"
          onClick={() => useUIStore.getState().setShowExportDialog(true)}
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
