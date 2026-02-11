import Sidebar from "@/components/layout/Sidebar";
import RecorderView from "@/components/recorder/RecorderView";
import EditorView from "@/components/editor/EditorView";
import ExportDialog from "@/components/export/ExportDialog";
import { useUIStore } from "@/stores/uiStore";

export default function AppShell() {
  const activeView = useUIStore((s) => s.activeView);

  return (
    <div className="flex h-screen w-screen bg-neutral-950 text-neutral-100 overflow-hidden">
      <Sidebar />
      <main className="flex flex-1 flex-col min-w-0 min-h-0">
        {activeView === "recorder" && <RecorderView />}
        {activeView === "editor" && <EditorView />}
      </main>
      <ExportDialog />
    </div>
  );
}
