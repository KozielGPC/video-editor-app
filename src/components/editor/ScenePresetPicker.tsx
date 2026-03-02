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
    <div className="flex items-center gap-1.5 px-2 py-1.5">
      {SCENE_PRESETS.map((preset) => (
        <PresetThumbnail
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

function PresetThumbnail({
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
      title={preset.name}
      className={`relative w-12 h-8 rounded border-2 transition-all flex-shrink-0 overflow-hidden ${
        isActive
          ? "border-blue-500 bg-neutral-800"
          : "border-neutral-700 bg-neutral-900 hover:border-neutral-500"
      } ${disabled ? "opacity-40 pointer-events-none" : ""}`}
    >
      {/* Screen area */}
      {sw > 0 && (
        <div
          className="absolute bg-neutral-600 rounded-[1px]"
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
        <div
          className="absolute bg-blue-500"
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

      {/* Label */}
      <span className="absolute bottom-0 inset-x-0 text-center text-[6px] text-neutral-400 leading-tight truncate px-0.5">
        {preset.name}
      </span>
    </button>
  );
}
