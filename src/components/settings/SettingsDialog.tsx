import { useState, useCallback, useEffect } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tabs from "@radix-ui/react-tabs";
import { X, Keyboard, Video, RotateCcw } from "lucide-react";
import { useUIStore } from "@/stores/uiStore";
import {
  useSettingsStore,
  type ShortcutId,
  type ShortcutConfig,
} from "@/stores/settingsStore";
import { keyEventToAccelerator, acceleratorToLabel } from "@/lib/shortcut";

function ShortcutInput({
  shortcut,
  onChange,
}: {
  shortcut: ShortcutConfig;
  onChange: (acc: string) => void;
}) {
  const [isRecording, setIsRecording] = useState(false);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isRecording) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setIsRecording(false);
        return;
      }
      const acc = keyEventToAccelerator(e);
      if (acc !== "None") {
        onChange(acc);
        setIsRecording(false);
      }
    },
    [isRecording, onChange],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const displayValue = isRecording ? "Press key..." : shortcut.accelerator;

  return (
    <button
      type="button"
      onClick={() => setIsRecording(true)}
      className={`w-full px-3 py-2 text-left text-sm font-mono rounded-lg border transition-colors
        ${isRecording ? "border-blue-500 bg-blue-500/10" : "border-neutral-600 bg-neutral-800/50 hover:border-neutral-500"}`}
    >
      {acceleratorToLabel(displayValue)}
    </button>
  );
}

export default function SettingsDialog() {
  const showSettings = useUIStore((s) => s.showSettings);
  const setSettingsOpen = useUIStore((s) => s.setSettingsOpen);
  const { shortcuts, setShortcut, resetShortcuts, setWebcamLayout, resetWebcamLayout } =
    useSettingsStore();

  return (
    <Dialog.Root open={showSettings} onOpenChange={setSettingsOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[200]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] max-h-[85vh]
            bg-neutral-900 border border-neutral-700 rounded-xl shadow-2xl z-[201] flex flex-col overflow-hidden"
        >
          <Dialog.Description className="sr-only">
            Configure application shortcuts and recorder settings.
          </Dialog.Description>

          <div className="flex items-center justify-between px-6 py-4 border-b border-neutral-700">
            <Dialog.Title className="text-lg font-semibold text-neutral-100">
              Settings
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="p-2 rounded-lg text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800 transition-colors"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </Dialog.Close>
          </div>

          <Tabs.Root defaultValue="shortcuts" className="flex-1 flex flex-col min-h-0">
            <Tabs.List className="flex border-b border-neutral-700 px-4">
              <Tabs.Trigger
                value="shortcuts"
                className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-neutral-400
                  data-[state=active]:text-blue-400 data-[state=active]:border-b-2
                  data-[state=active]:border-blue-500 hover:text-neutral-300 transition-colors outline-none"
              >
                <Keyboard size={16} />
                Shortcuts
              </Tabs.Trigger>
              <Tabs.Trigger
                value="recorder"
                className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-neutral-400
                  data-[state=active]:text-blue-400 data-[state=active]:border-b-2
                  data-[state=active]:border-blue-500 hover:text-neutral-300 transition-colors outline-none"
              >
                <Video size={16} />
                Recorder
              </Tabs.Trigger>
            </Tabs.List>

            <div className="flex-1 overflow-y-auto p-6">
              <Tabs.Content value="shortcuts" className="outline-none space-y-4">
                <p className="text-sm text-neutral-500">
                  Click a shortcut to change it. Press any key combination. Escape cancels.
                </p>
                <div className="space-y-3">
                  {shortcuts.map((sc) => (
                    <div
                      key={sc.id}
                      className="flex items-center justify-between gap-4"
                    >
                      <span className="text-sm text-neutral-400 min-w-[140px]">
                        {sc.label}
                      </span>
                      <ShortcutInput
                        shortcut={sc}
                        onChange={(acc) => setShortcut(sc.id as ShortcutId, acc)}
                      />
                    </div>
                  ))}
                </div>
                <button
                  onClick={resetShortcuts}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-400
                    hover:text-neutral-200 hover:bg-neutral-800 rounded-lg transition-colors"
                >
                  <RotateCcw size={14} />
                  Reset to defaults
                </button>
              </Tabs.Content>

              <Tabs.Content value="recorder" className="outline-none space-y-4">
                <p className="text-sm text-neutral-500">
                  Webcam position and size can be adjusted by dragging in the recorder preview.
                </p>
                <button
                  onClick={resetWebcamLayout}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-400
                    hover:text-neutral-200 hover:bg-neutral-800 rounded-lg transition-colors"
                >
                  <RotateCcw size={14} />
                  Reset webcam to default (bottom-right)
                </button>
              </Tabs.Content>
            </div>
          </Tabs.Root>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
