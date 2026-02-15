import { useState } from "react";
import * as Tabs from "@radix-ui/react-tabs";
import * as Slider from "@radix-ui/react-slider";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  Volume2,
  VolumeX,
  Plus,
  Trash2,
  ZoomIn,
  ZoomOut,
  Sparkles,
  Type,
  Image,
  ChevronDown,
  ChevronRight,
  Clock,
  Move,
  Maximize2,
  Loader2,
  Check,
  AlertCircle,
  Info,
} from "lucide-react";
import { useEditorStore } from "@/stores/editorStore";
import { removeSilence } from "@/lib/ffmpeg";
import type { Segment } from "@/lib/ffmpeg";
import type { Effect, Overlay } from "@/types/project";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtTime(s: number): string {
  return `${s.toFixed(2)}s`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Inspector() {
  const {
    project,
    selectedClipId,
    selectedTrackId,
    updateClip,
    addEffect,
    updateEffect,
    removeEffect,
    addOverlay,
    removeOverlay,
    _pushHistory,
  } = useEditorStore();

  const selectedTrack = project?.tracks.find((t) => t.id === selectedTrackId);
  const selectedClip = selectedTrack?.clips.find(
    (c) => c.id === selectedClipId,
  );
  const asset = project?.assets.find((a) => a.id === selectedClip?.assetId);

  // ── Empty state ─────────────────────────────────────────────────────────

  if (!selectedClip || !selectedTrack) {
    return (
      <div className="h-full bg-neutral-900 border-l border-neutral-700 flex items-center justify-center p-6">
        <p className="text-neutral-500 text-sm text-center leading-relaxed">
          Select a clip to edit its properties
        </p>
      </div>
    );
  }

  const clipDuration = selectedClip.sourceEnd - selectedClip.sourceStart;

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="h-full bg-neutral-900 border-l border-neutral-700 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2 border-b border-neutral-700 flex-none">
        <h2 className="text-xs font-semibold text-neutral-300 uppercase tracking-wider">
          Inspector
        </h2>
      </div>

      <Tabs.Root defaultValue="clip" className="flex-1 flex flex-col min-h-0">
        {/* Tab triggers */}
        <Tabs.List className="flex border-b border-neutral-700 px-1 flex-none">
          {["clip", "audio", "effects", "overlay"].map((tab) => (
            <Tabs.Trigger
              key={tab}
              value={tab}
              className="flex-1 px-2 py-1.5 text-[11px] font-medium text-neutral-500
                data-[state=active]:text-blue-400 data-[state=active]:border-b-2
                data-[state=active]:border-blue-500 hover:text-neutral-300
                transition-colors capitalize outline-none"
            >
              {tab}
            </Tabs.Trigger>
          ))}
        </Tabs.List>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {/* ── Clip tab ─────────────────────────────────────────── */}
          <Tabs.Content value="clip" className="p-3 space-y-3 outline-none">
            <Section label="Source">
              <PropRow label="File">{asset?.name ?? "—"}</PropRow>
              <PropRow label="Type">{asset?.type ?? "—"}</PropRow>
              {asset?.width && asset?.height && (
                <PropRow label="Resolution">
                  {asset.width}×{asset.height}
                </PropRow>
              )}
              <PropRow label="Asset Duration">
                {asset ? fmtTime(asset.duration) : "—"}
              </PropRow>
            </Section>

            <Section label="Timeline">
              <PropRow label="Position">
                {fmtTime(selectedClip.trackPosition)}
              </PropRow>
              <PropRow label="Duration">{fmtTime(clipDuration)}</PropRow>
            </Section>

            <Section label="Trim">
              <PropRow label="In Point">
                {fmtTime(selectedClip.sourceStart)}
              </PropRow>
              <PropRow label="Out Point">
                {fmtTime(selectedClip.sourceEnd)}
              </PropRow>
            </Section>
          </Tabs.Content>

          {/* ── Audio tab ────────────────────────────────────────── */}
          <Tabs.Content value="audio" className="p-3 space-y-4 outline-none">
            <Section label="Volume">
              <div className="flex items-center gap-2 mt-1">
                <button
                  className="text-neutral-400 hover:text-neutral-200 transition-colors"
                  onClick={() => {
                    _pushHistory();
                    updateClip(selectedTrack.id, selectedClip.id, {
                      volume: selectedClip.volume === 0 ? 100 : 0,
                    });
                  }}
                >
                  {selectedClip.volume === 0 ? (
                    <VolumeX size={14} />
                  ) : (
                    <Volume2 size={14} />
                  )}
                </button>

                <Slider.Root
                  className="relative flex items-center flex-1 h-5 touch-none select-none"
                  value={[selectedClip.volume]}
                  min={0}
                  max={200}
                  step={1}
                  onValueChange={([v]) =>
                    updateClip(selectedTrack.id, selectedClip.id, { volume: v })
                  }
                  onValueCommit={() => _pushHistory()}
                >
                  <Slider.Track className="relative flex-1 h-1 rounded-full bg-neutral-700">
                    <Slider.Range className="absolute h-full rounded-full bg-blue-500" />
                  </Slider.Track>
                  <Slider.Thumb className="block w-3 h-3 rounded-full bg-white shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </Slider.Root>

                <span className="text-[11px] text-neutral-300 w-10 text-right tabular-nums">
                  {selectedClip.volume}%
                </span>
              </div>
            </Section>

            <SilenceDetection />
          </Tabs.Content>

          {/* ── Effects tab ──────────────────────────────────────── */}
          <Tabs.Content value="effects" className="p-3 space-y-3 outline-none">
            <Section label="Effects">
              {selectedClip.effects.length === 0 && (
                <p className="text-[11px] text-neutral-600 py-2">
                  No effects applied. Add a zoom or fade effect below.
                </p>
              )}
              {selectedClip.effects.map((effect, i) => (
                <EffectRow
                  key={i}
                  index={i}
                  effect={effect}
                  clipDuration={clipDuration}
                  onUpdate={(patch) =>
                    updateEffect(selectedTrack.id, selectedClip.id, i, patch)
                  }
                  onRemove={() =>
                    removeEffect(selectedTrack.id, selectedClip.id, i)
                  }
                />
              ))}

              <AddEffectButton
                clipDuration={clipDuration}
                clipTrackPosition={selectedClip.trackPosition}
                onAdd={(effect) =>
                  addEffect(selectedTrack.id, selectedClip.id, effect)
                }
              />
            </Section>

            {/* Summary info */}
            {selectedClip.effects.length > 0 && (
              <div className="text-[10px] text-neutral-600 pt-1 border-t border-neutral-800">
                {selectedClip.effects.filter((e) => e.type === "zoom").length} zoom
                {" / "}
                {selectedClip.effects.filter((e) => e.type.startsWith("fade")).length} fade effects
              </div>
            )}
          </Tabs.Content>

          {/* ── Overlay tab ──────────────────────────────────────── */}
          <Tabs.Content value="overlay" className="p-3 space-y-3 outline-none">
            <Section label="Overlays">
              {selectedClip.overlays.length === 0 && (
                <p className="text-[11px] text-neutral-600 py-1">
                  No overlays added
                </p>
              )}
              {selectedClip.overlays.map((overlay, i) => (
                <OverlayRow
                  key={i}
                  overlay={overlay}
                  onRemove={() =>
                    removeOverlay(selectedTrack.id, selectedClip.id, i)
                  }
                />
              ))}

              <AddOverlayButton
                onAdd={(overlay) =>
                  addOverlay(selectedTrack.id, selectedClip.id, overlay)
                }
              />
            </Section>
          </Tabs.Content>
        </div>
      </Tabs.Root>
    </div>
  );
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Section({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="text-[10px] font-semibold text-neutral-500 uppercase tracking-wider mb-1.5">
        {label}
      </h3>
      <div className="space-y-0.5">{children}</div>
    </div>
  );
}

function PropRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-[11px] text-neutral-500">{label}</span>
      <span className="text-[11px] text-neutral-200 font-mono">{children}</span>
    </div>
  );
}

// ── Effect Row ───────────────────────────────────────────────────────────────

function EffectRow({
  index,
  effect,
  clipDuration,
  onUpdate,
  onRemove,
}: {
  index: number;
  effect: Effect;
  clipDuration: number;
  onUpdate: (patch: Partial<Effect>) => void;
  onRemove: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const labels: Record<string, string> = {
    zoom: "Zoom",
    fade_in: "Fade In",
    fade_out: "Fade Out",
  };
  const icons: Record<string, React.ReactNode> = {
    zoom: <ZoomIn size={12} className="text-blue-400" />,
    fade_in: <Sparkles size={12} className="text-amber-400" />,
    fade_out: <Sparkles size={12} className="text-purple-400" />,
  };
  const isZoom = effect.type === "zoom";
  const scale = effect.params.scale ?? 1.3;
  const posX = effect.params.x ?? 50;
  const posY = effect.params.y ?? 50;

  return (
    <div className="bg-neutral-800 rounded overflow-hidden border border-neutral-700/50">
      {/* Header – always visible */}
      <div className="flex items-center justify-between py-1.5 px-2 group">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
        >
          {isExpanded ? (
            <ChevronDown size={11} className="text-neutral-500 shrink-0" />
          ) : (
            <ChevronRight size={11} className="text-neutral-500 shrink-0" />
          )}
          {icons[effect.type] ?? <Sparkles size={12} />}
          <span className="text-[11px] text-neutral-200 font-medium">
            {labels[effect.type] ?? effect.type}
          </span>
          <span className="text-[10px] text-neutral-500 ml-auto mr-2 tabular-nums">
            {fmtTime(effect.startTime)} — {fmtTime(effect.startTime + effect.duration)}
          </span>
        </button>
        <button
          onClick={onRemove}
          className="text-neutral-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all shrink-0"
          title="Remove effect"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Expanded editor */}
      {isExpanded && (
        <div className="px-3 pb-3 pt-1 space-y-2.5 border-t border-neutral-700/50">
          {/* Timing */}
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-[10px] text-neutral-400 font-medium uppercase tracking-wider">
              <Clock size={10} /> Timing
            </div>
            <EffectSlider
              label="Start"
              value={effect.startTime}
              min={0}
              max={Math.max(clipDuration - effect.duration, 0)}
              step={0.05}
              format={(v) => `${v.toFixed(2)}s`}
              onChange={(v) => onUpdate({ startTime: v })}
            />
            <EffectSlider
              label="Duration"
              value={effect.duration}
              min={0.1}
              max={Math.max(clipDuration - effect.startTime, 0.1)}
              step={0.05}
              format={(v) => `${v.toFixed(2)}s`}
              onChange={(v) => onUpdate({ duration: v })}
            />
          </div>

          {/* Zoom-specific params */}
          {isZoom && (
            <div className="space-y-1">
              <div className="flex items-center gap-1 text-[10px] text-neutral-400 font-medium uppercase tracking-wider">
                <Maximize2 size={10} /> Scale
              </div>
              <EffectSlider
                label="Scale"
                value={scale}
                min={0.5}
                max={3.0}
                step={0.05}
                format={(v) => `${v.toFixed(2)}x`}
                onChange={(v) => onUpdate({ params: { ...effect.params, scale: v } })}
              />

              <div className="flex items-center gap-1 text-[10px] text-neutral-400 font-medium uppercase tracking-wider mt-2">
                <Move size={10} /> Focus Point
              </div>
              <EffectSlider
                label="X"
                value={posX}
                min={0}
                max={100}
                step={1}
                format={(v) => `${Math.round(v)}%`}
                onChange={(v) => onUpdate({ params: { ...effect.params, x: v } })}
              />
              <EffectSlider
                label="Y"
                value={posY}
                min={0}
                max={100}
                step={1}
                format={(v) => `${Math.round(v)}%`}
                onChange={(v) => onUpdate({ params: { ...effect.params, y: v } })}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Effect Slider ────────────────────────────────────────────────────────────

function EffectSlider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-neutral-500 w-10 shrink-0">{label}</span>
      <Slider.Root
        className="relative flex items-center flex-1 h-4 touch-none select-none"
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([v]) => onChange(v)}
      >
        <Slider.Track className="relative flex-1 h-[3px] rounded-full bg-neutral-700">
          <Slider.Range className="absolute h-full rounded-full bg-blue-500" />
        </Slider.Track>
        <Slider.Thumb className="block w-2.5 h-2.5 rounded-full bg-white shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </Slider.Root>
      <span className="text-[10px] text-neutral-300 w-12 text-right tabular-nums font-mono shrink-0">
        {format(value)}
      </span>
    </div>
  );
}

// ── Add Effect ───────────────────────────────────────────────────────────────

function AddEffectButton({
  clipDuration,
  clipTrackPosition,
  onAdd,
}: {
  clipDuration: number;
  clipTrackPosition: number;
  onAdd: (e: Effect) => void;
}) {
  // Read playheadPosition lazily from the store snapshot (not a subscription —
  // avoids re-rendering this component 12× per second during playback).
  const computeStart = (): number => {
    const pos = useEditorStore.getState().playheadPosition;
    const offset = Math.max(0, pos - clipTrackPosition);
    return Math.min(offset, Math.max(clipDuration - 1, 0));
  };
  const [defaultStart, setDefaultStart] = useState(computeStart);
  // Refresh when the dropdown opens
  const handleOpenChange = (open: boolean) => {
    if (open) setDefaultStart(computeStart());
  };

  const presets: { label: string; icon: React.ReactNode; type: Effect["type"]; params: Record<string, number> }[] = [
    { label: "Zoom In", icon: <ZoomIn size={13} />, type: "zoom", params: { scale: 1.3, x: 50, y: 50 } },
    { label: "Zoom Out", icon: <ZoomOut size={13} />, type: "zoom", params: { scale: 0.8, x: 50, y: 50 } },
    { label: "Fade In", icon: <Sparkles size={13} className="text-amber-400" />, type: "fade_in", params: {} },
    { label: "Fade Out", icon: <Sparkles size={13} className="text-purple-400" />, type: "fade_out", params: {} },
  ];

  return (
    <DropdownMenu.Root onOpenChange={handleOpenChange}>
      <DropdownMenu.Trigger asChild>
        <button className="flex items-center gap-1.5 text-[11px] text-blue-400 hover:text-blue-300 mt-2 transition-colors font-medium">
          <Plus size={12} /> Add Effect
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="min-w-[160px] bg-neutral-800 border border-neutral-700 rounded-lg p-1 shadow-2xl z-[100]"
          sideOffset={5}
        >
          <div className="px-2 py-1 text-[10px] text-neutral-500 font-medium uppercase tracking-wider">
            Insert at {fmtTime(defaultStart)}
          </div>
          {presets.map((p) => (
            <DropdownMenu.Item
              key={p.label}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-neutral-200 rounded
                hover:bg-neutral-700 cursor-pointer outline-none data-[highlighted]:bg-neutral-700"
              onSelect={() =>
                onAdd({
                  type: p.type,
                  startTime: defaultStart,
                  duration: 1,
                  params: p.params,
                })
              }
            >
              {p.icon}
              {p.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

// ── Overlay Row ──────────────────────────────────────────────────────────────

function OverlayRow({
  overlay,
  onRemove,
}: {
  overlay: Overlay;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center justify-between py-1 px-2 bg-neutral-800 rounded group">
      <div className="min-w-0">
        <span className="text-[11px] text-neutral-200 font-medium capitalize">
          {overlay.type}
        </span>
        <span className="text-[10px] text-neutral-500 ml-2 truncate">
          {overlay.content.slice(0, 24)}
        </span>
        <div className="text-[10px] text-neutral-600">
          pos ({overlay.position.x}, {overlay.position.y}) • {overlay.size.width}×
          {overlay.size.height}
        </div>
      </div>
      <button
        onClick={onRemove}
        className="text-neutral-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all flex-none"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

// ── Add Overlay ──────────────────────────────────────────────────────────────

function AddOverlayButton({ onAdd }: { onAdd: (o: Overlay) => void }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button className="flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300 mt-2 transition-colors">
          <Plus size={12} /> Add Overlay
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="min-w-[140px] bg-neutral-800 border border-neutral-700 rounded-lg p-1 shadow-2xl z-[100]"
          sideOffset={5}
        >
          <DropdownMenu.Item
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-neutral-200 rounded
              hover:bg-neutral-700 cursor-pointer outline-none data-[highlighted]:bg-neutral-700"
            onSelect={() =>
              onAdd({
                type: "text",
                position: { x: 100, y: 100 },
                size: { width: 400, height: 60 },
                content: "New Text",
                startTime: 0,
                duration: 3,
                style: { color: "#ffffff", fontSize: "24px" },
              })
            }
          >
            <Type size={13} /> Text
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-neutral-200 rounded
              hover:bg-neutral-700 cursor-pointer outline-none data-[highlighted]:bg-neutral-700"
            onSelect={() =>
              onAdd({
                type: "image",
                position: { x: 50, y: 50 },
                size: { width: 200, height: 200 },
                content: "",
                startTime: 0,
                duration: 5,
              })
            }
          >
            <Image size={13} /> Image
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

// ─── Silence Detection Section ───────────────────────────────────────────────

const DEFAULT_SILENCE_THRESHOLD_DB = -50;
const DEFAULT_MIN_SILENCE_DURATION_MS = 200;
const DEFAULT_PADDING_MS = 100;

type SilenceStatus = "idle" | "extracting" | "detecting" | "done" | "error";

function SilenceDetection() {
  const { project, selectedClipId, selectedTrackId, applySilenceRemoval } =
    useEditorStore();

  const [threshold, setThreshold] = useState(DEFAULT_SILENCE_THRESHOLD_DB);
  const [minDuration, setMinDuration] = useState(DEFAULT_MIN_SILENCE_DURATION_MS);
  const [padding, setPadding] = useState(DEFAULT_PADDING_MS);
  const [status, setStatus] = useState<SilenceStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [segmentCount, setSegmentCount] = useState(0);

  const selectedTrack = project?.tracks.find((t) => t.id === selectedTrackId);
  const selectedClip = selectedTrack?.clips.find((c) => c.id === selectedClipId);
  const asset = project?.assets.find((a) => a.id === selectedClip?.assetId);
  const hasAsset = !!asset?.path;

  const handleRemoveSilence = async () => {
    if (!asset) return;
    setStatus("extracting");
    setError(null);
    setSegmentCount(0);
    try {
      setStatus("detecting");
      const segments = await removeSilence(
        asset.path,
        threshold,
        minDuration,
        padding,
      );
      setSegmentCount(segments.length);
      applySilenceRemoval(segments);
      setStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStatus("error");
    }
  };

  const isProcessing = status === "extracting" || status === "detecting";

  return (
    <Section label="Silence Removal">
      {/* Threshold */}
      <div className="space-y-1 mt-1">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-neutral-500">Threshold</span>
          <span className="text-[11px] text-neutral-300 font-mono tabular-nums">
            {threshold} dB
          </span>
        </div>
        <Slider.Root
          className="relative flex items-center w-full h-5 touch-none select-none"
          value={[threshold]}
          min={-60}
          max={-20}
          step={1}
          onValueChange={([v]) => setThreshold(v)}
        >
          <Slider.Track className="relative flex-1 h-1 rounded-full bg-neutral-700">
            <Slider.Range className="absolute h-full rounded-full bg-blue-500" />
          </Slider.Track>
          <Slider.Thumb className="block w-3 h-3 rounded-full bg-white shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </Slider.Root>
      </div>

      {/* Min Duration */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-neutral-500">Min Duration</span>
          <span className="text-[11px] text-neutral-300 font-mono tabular-nums">
            {minDuration}ms
          </span>
        </div>
        <Slider.Root
          className="relative flex items-center w-full h-5 touch-none select-none"
          value={[minDuration]}
          min={100}
          max={2000}
          step={50}
          onValueChange={([v]) => setMinDuration(v)}
        >
          <Slider.Track className="relative flex-1 h-1 rounded-full bg-neutral-700">
            <Slider.Range className="absolute h-full rounded-full bg-blue-500" />
          </Slider.Track>
          <Slider.Thumb className="block w-3 h-3 rounded-full bg-white shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </Slider.Root>
      </div>

      {/* Padding */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-neutral-500">Padding</span>
          <span className="text-[11px] text-neutral-300 font-mono tabular-nums">
            {padding}ms
          </span>
        </div>
        <Slider.Root
          className="relative flex items-center w-full h-5 touch-none select-none"
          value={[padding]}
          min={0}
          max={500}
          step={10}
          onValueChange={([v]) => setPadding(v)}
        >
          <Slider.Track className="relative flex-1 h-1 rounded-full bg-neutral-700">
            <Slider.Range className="absolute h-full rounded-full bg-blue-500" />
          </Slider.Track>
          <Slider.Thumb className="block w-3 h-3 rounded-full bg-white shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </Slider.Root>
      </div>

      {/* Error feedback */}
      {status === "error" && error && (
        <div className="flex items-start gap-1.5 text-[11px] text-red-400 bg-red-950/30 rounded p-2 mt-2 border border-red-900/50">
          <AlertCircle size={13} className="shrink-0 mt-px" />
          <span className="break-all">{error}</span>
        </div>
      )}

      {/* Success feedback */}
      {status === "done" && (
        <div className="text-[11px] bg-emerald-950/30 rounded p-2 mt-2 border border-emerald-900/50 space-y-0.5">
          <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
            <Check size={13} />
            Silence removed — {segmentCount} speech segments applied to timeline
          </div>
          <p className="text-neutral-500 pl-[19px]">
            Original file untouched. Use Export to render the final video.
          </p>
        </div>
      )}

      {/* Processing feedback — animated progress bar */}
      {isProcessing && (
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2 text-[11px] text-blue-400">
            <Loader2 size={13} className="animate-spin shrink-0" />
            <span>
              {status === "extracting"
                ? "Extracting audio…"
                : "Detecting silence…"}
            </span>
          </div>
          {/* Indeterminate progress bar */}
          <div className="h-1.5 w-full bg-neutral-800 rounded-full overflow-hidden">
            <div className="h-full bg-blue-500 rounded-full animate-[indeterminate_1.5s_ease-in-out_infinite] w-1/3" />
          </div>
          <p className="text-[10px] text-neutral-600">
            Analysing audio — the original video is not modified
          </p>
        </div>
      )}

      {/* Action button */}
      <div className="mt-2">
        <button
          onClick={handleRemoveSilence}
          disabled={!hasAsset || isProcessing}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-[11px] font-medium
            bg-blue-600 hover:bg-blue-500 active:bg-blue-700
            text-white rounded transition-colors shadow-lg shadow-blue-600/20
            disabled:opacity-40 disabled:pointer-events-none"
        >
          {isProcessing ? (
            <>
              <Loader2 size={12} className="animate-spin" />
              Detecting silence…
            </>
          ) : (
            "Remove Silent Parts"
          )}
        </button>
      </div>

      {/* Hint when no asset */}
      {!hasAsset && (
        <p className="text-[10px] text-neutral-600 mt-1.5">
          Select a clip with an audio source to remove silence
        </p>
      )}
    </Section>
  );
}
