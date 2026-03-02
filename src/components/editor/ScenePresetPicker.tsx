import { SCENE_PRESETS } from "@/lib/scenePresets";
import type { ScenePreset } from "@/lib/scenePresets";

interface ScenePresetPickerProps {
  activePresetId?: string;
  onSelect: (presetId: string) => void;
  disabled?: boolean;
}

export default function ScenePresetPicker({
  activePresetId,
  onSelect,
  disabled,
}: ScenePresetPickerProps) {
  return (
    <div className="flex items-center gap-1">
      {SCENE_PRESETS.map((preset) => (
        <PresetButton
          key={preset.id}
          preset={preset}
          isActive={preset.id === activePresetId}
          onClick={() => onSelect(preset.id)}
          disabled={disabled}
        />
      ))}
    </div>
  );
}

function PresetButton({
  preset,
  isActive,
  onClick,
  disabled,
}: {
  preset: ScenePreset;
  isActive: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  const cam = preset.camera;
  const sw = preset.screenWidthPercent;

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
        isActive
          ? "bg-blue-600/20 text-blue-400 border border-blue-500/50"
          : "bg-neutral-800/60 text-neutral-400 border border-transparent hover:bg-neutral-800 hover:text-neutral-200"
      } ${disabled ? "opacity-40 pointer-events-none" : ""}`}
    >
      {/* Mini icon */}
      <span className="relative w-5 h-3.5 rounded-[2px] bg-neutral-700/80 overflow-hidden shrink-0">
        {/* Screen area */}
        {sw > 0 && (
          <span
            className="absolute bg-neutral-500 rounded-[1px]"
            style={{
              left: "8%",
              top: "10%",
              width: `${sw * 0.84}%`,
              height: "80%",
            }}
          />
        )}
        {/* Camera area */}
        {cam && (
          <span
            className="absolute bg-blue-400"
            style={{
              left: `${cam.x * 0.84 + 8}%`,
              top: `${cam.y * 0.8 + 10}%`,
              width: `${cam.width * 0.84}%`,
              height: `${cam.height * 0.8}%`,
              borderRadius:
                cam.shape === "circle"
                  ? "50%"
                  : cam.shape === "rounded"
                  ? `${cam.borderRadius ?? 10}%`
                  : "1px",
            }}
          />
        )}
      </span>
      {preset.name}
    </button>
  );
}
