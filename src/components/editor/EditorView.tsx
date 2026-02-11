import { useRef, useState, useEffect, useCallback } from "react";
import { Film, FolderOpen } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useEditorStore } from "@/stores/editorStore";
import PreviewCanvas from "./PreviewCanvas";
import Inspector from "./Inspector";
import Timeline from "./Timeline";
import Toolbar from "./Toolbar";

// ─── Component ───────────────────────────────────────────────────────────────

export default function EditorView() {
  const {
    project,
    selectedClipId,
    selectedTrackId,
    togglePlayback,
    splitClipAtPlayhead,
    removeClip,
    undo,
    redo,
    setTool,
    createNewProject,
  } = useEditorStore();

  const containerRef = useRef<HTMLDivElement>(null);

  // Panel sizes (percentages)
  const [topHeight, setTopHeight] = useState(60);
  const [previewWidth, setPreviewWidth] = useState(70);

  // ── Keyboard shortcuts ──────────────────────────────────────────────────

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement)?.isContentEditable) {
        return;
      }

      const meta = e.metaKey || e.ctrlKey;

      switch (e.code) {
        case "Space":
          e.preventDefault();
          togglePlayback();
          break;

        case "KeyS":
          if (!meta) {
            e.preventDefault();
            splitClipAtPlayhead();
          }
          break;

        case "Delete":
        case "Backspace":
          if (selectedClipId && selectedTrackId) {
            e.preventDefault();
            removeClip(selectedTrackId, selectedClipId);
          }
          break;

        case "KeyZ":
          if (meta) {
            e.preventDefault();
            e.shiftKey ? redo() : undo();
          }
          break;

        // Tool shortcuts
        case "KeyV":
          if (!meta) setTool("select");
          break;
        case "KeyC":
          if (!meta) setTool("cut");
          break;
        case "KeyT":
          if (!meta) setTool("text");
          break;
        // "Z" without meta = zoom tool
        // handled above when meta is held
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    togglePlayback,
    splitClipAtPlayhead,
    removeClip,
    selectedClipId,
    selectedTrackId,
    undo,
    redo,
    setTool,
  ]);

  // ── Resizable dividers ──────────────────────────────────────────────────

  const handleResizeStart = useCallback(
    (direction: "vertical" | "horizontal") => (e: React.MouseEvent) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;

      document.body.style.cursor =
        direction === "vertical" ? "row-resize" : "col-resize";
      document.body.style.userSelect = "none";

      const onMove = (ev: MouseEvent) => {
        const rect = container.getBoundingClientRect();
        if (direction === "vertical") {
          const pct = ((ev.clientY - rect.top) / rect.height) * 100;
          setTopHeight(Math.min(80, Math.max(25, pct)));
        } else {
          const pct = ((ev.clientX - rect.left) / rect.width) * 100;
          setPreviewWidth(Math.min(85, Math.max(30, pct)));
        }
      };

      const onUp = () => {
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);
      };

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [],
  );

  // ── Open video file as a new project ─────────────────────────────────────

  const { createProjectFromRecording } = useEditorStore();

  const handleOpenVideoFile = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "Video",
            extensions: ["mp4", "mov", "mkv", "avi", "webm", "m4v"],
          },
        ],
      });
      if (selected) {
        const filePath = typeof selected === "string" ? selected : selected;
        createProjectFromRecording(filePath);
      }
    } catch (err) {
      console.error("Failed to open file:", err);
    }
  }, [createProjectFromRecording]);

  // ── No-project state ────────────────────────────────────────────────────

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-neutral-950 select-none gap-4">
        <div className="w-20 h-20 rounded-2xl bg-neutral-900 flex items-center justify-center mb-2">
          <Film className="w-10 h-10 text-neutral-600" />
        </div>
        <h2 className="text-xl font-semibold text-neutral-200">
          No Project Open
        </h2>
        <p className="text-neutral-500 text-sm max-w-xs text-center leading-relaxed">
          Create a new project or open a video file to start editing.
        </p>
        <div className="flex gap-3 mt-2">
          <button
            onClick={() => createNewProject("Untitled Project")}
            className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg
              text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          >
            New Project
          </button>
          <button
            onClick={handleOpenVideoFile}
            className="flex items-center gap-2 px-5 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200
              rounded-lg text-sm border border-neutral-700 transition-colors
              focus:outline-none focus:ring-2 focus:ring-neutral-500/50"
          >
            <FolderOpen size={16} />
            Open Video File
          </button>
        </div>
      </div>
    );
  }

  // ── Main layout ─────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-screen bg-neutral-950 select-none overflow-hidden"
    >
      {/* ── Top section: Preview + Inspector ──────────────────────── */}
      <div
        className="flex min-h-0"
        style={{ flex: `0 0 ${topHeight}%` }}
      >
        {/* Preview */}
        <div className="min-w-0 overflow-hidden" style={{ width: `${previewWidth}%` }}>
          <PreviewCanvas />
        </div>

        {/* Horizontal resize divider */}
        <div
          className="w-1 flex-none bg-neutral-800 hover:bg-blue-500/70 cursor-col-resize transition-colors"
          onMouseDown={handleResizeStart("horizontal")}
        />

        {/* Inspector */}
        <div className="min-w-0 flex-1 overflow-hidden">
          <Inspector />
        </div>
      </div>

      {/* ── Vertical resize divider ──────────────────────────────── */}
      <div
        className="h-1 flex-none bg-neutral-800 hover:bg-blue-500/70 cursor-row-resize transition-colors"
        onMouseDown={handleResizeStart("vertical")}
      />

      {/* ── Bottom section: Toolbar + Timeline ───────────────────── */}
      <div className="flex flex-col min-h-0 flex-1">
        <Toolbar />
        <div className="flex-1 min-h-0">
          <Timeline />
        </div>
      </div>
    </div>
  );
}
