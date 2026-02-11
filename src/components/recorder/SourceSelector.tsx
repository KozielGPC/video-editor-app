import { useEffect } from "react";
import * as Select from "@radix-ui/react-select";
import { Monitor, Camera, Mic, ChevronDown, Check } from "lucide-react";
import { useMediaSources } from "@/hooks/useMediaSources";
import { useRecorderStore } from "@/stores/recorderStore";

interface SourceSelectProps {
  icon: React.ReactNode;
  label: string;
  value: string | null;
  onChange: (value: string | null) => void;
  items: { id: string; name: string }[];
  disabled?: boolean;
}

function SourceSelect({ icon, label, value, onChange, items, disabled }: SourceSelectProps) {
  const displayValue =
    value === null || value === "__none__"
      ? `No ${label}`
      : items.find((i) => i.id === value)?.name ?? label;

  return (
    <Select.Root
      value={value ?? "__none__"}
      onValueChange={(v) => onChange(v === "__none__" ? null : v)}
      disabled={disabled}
    >
      <Select.Trigger
        className="inline-flex items-center gap-2 px-3 py-2 rounded-full bg-neutral-800 border border-neutral-700 text-sm text-neutral-200 cursor-pointer hover:bg-neutral-700 hover:border-neutral-600 focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 max-w-[200px]"
      >
        <span className="text-neutral-400 shrink-0">{icon}</span>
        <Select.Value>
          <span className="truncate">{displayValue}</span>
        </Select.Value>
        <Select.Icon className="text-neutral-500 shrink-0">
          <ChevronDown size={14} />
        </Select.Icon>
      </Select.Trigger>

      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={6}
          className="z-50 min-w-[180px] overflow-hidden rounded-lg bg-neutral-800 border border-neutral-700 shadow-xl shadow-black/40"
        >
          <Select.Viewport className="p-1">
            <Select.Item
              value="__none__"
              className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-neutral-400 cursor-pointer outline-none data-[highlighted]:bg-neutral-700 data-[highlighted]:text-neutral-100"
            >
              <Select.ItemIndicator className="w-4 shrink-0">
                <Check size={14} />
              </Select.ItemIndicator>
              <Select.ItemText>None</Select.ItemText>
            </Select.Item>

            {items.length > 0 && (
              <Select.Separator className="h-px my-1 bg-neutral-700" />
            )}

            {items.map((item) => (
              <Select.Item
                key={item.id}
                value={item.id}
                className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-neutral-200 cursor-pointer outline-none data-[highlighted]:bg-neutral-700 data-[highlighted]:text-neutral-100"
              >
                <Select.ItemIndicator className="w-4 shrink-0">
                  <Check size={14} />
                </Select.ItemIndicator>
                <Select.ItemText>
                  <span className="truncate">{item.name}</span>
                </Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}

export default function SourceSelector() {
  const { screens, cameras, microphones, refresh } = useMediaSources();

  const selectedScreenId = useRecorderStore((s) => s.selectedScreenId);
  const selectedCameraId = useRecorderStore((s) => s.selectedCameraId);
  const selectedMicId = useRecorderStore((s) => s.selectedMicId);
  const selectScreen = useRecorderStore((s) => s.selectScreen);
  const selectCamera = useRecorderStore((s) => s.selectCamera);
  const selectMic = useRecorderStore((s) => s.selectMic);
  const recordingState = useRecorderStore((s) => s.recordingState);

  const isActive = recordingState !== "idle";

  useEffect(() => {
    if (screens.length > 0 && selectedScreenId === null) {
      selectScreen(screens[0].id);
    }
  }, [screens, selectedScreenId, selectScreen]);

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <SourceSelect
        icon={<Monitor size={16} />}
        label="Screen"
        value={selectedScreenId}
        onChange={(id) => {
          selectScreen(id);
          if (id !== null) {
            window.dispatchEvent(new CustomEvent("request-screen-stream"));
          }
        }}
        items={screens}
        disabled={isActive}
      />
      <SourceSelect
        icon={<Camera size={16} />}
        label="Camera"
        value={selectedCameraId}
        onChange={selectCamera}
        items={cameras}
        disabled={isActive}
      />
      <SourceSelect
        icon={<Mic size={16} />}
        label="Microphone"
        value={selectedMicId}
        onChange={selectMic}
        items={microphones}
        disabled={isActive}
      />
      <button
        onClick={refresh}
        disabled={isActive}
        className="ml-1 px-3 py-2 text-xs font-medium text-neutral-400 hover:text-neutral-200 rounded-full border border-neutral-700 hover:border-neutral-600 bg-neutral-800 transition-all duration-150 disabled:opacity-40 disabled:cursor-not-allowed"
      >
        Refresh
      </button>
    </div>
  );
}
