import { useRef, useState, useEffect, useCallback, memo } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { useEditorStore } from "@/stores/editorStore";
import type { Clip, Track } from "@/types/project";
import { ZOOM_ASSET_ID } from "@/types/project";
import Waveform from "./Waveform";

interface TimelineClipProps {
  clip: Clip;
  track: Track;
  timelineZoom: number;
  isSelected: boolean;
}

function TimelineClip({
  clip,
  track,
  timelineZoom,
  isSelected,
}: TimelineClipProps) {
  const {
    project,
    selectClip,
    updateClip,
    removeClip,
    splitClipAtPlayhead,
    duplicateClip,
    _pushHistory,
  } = useEditorStore();

  const asset = project?.assets.find((a) => a.id === clip.assetId);
  const clipDuration = clip.sourceEnd - clip.sourceStart;
  const left = clip.trackPosition * timelineZoom;
  const width = clipDuration * timelineZoom;

  // ── Drag / Trim state ────────────────────────────────────────────────────

  const [isDragging, setIsDragging] = useState(false);
  const [isTrimming, setIsTrimming] = useState<"left" | "right" | null>(null);

  const dragOrigin = useRef({
    mouseX: 0,
    trackPosition: 0,
    sourceStart: 0,
    sourceEnd: 0,
  });

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      selectClip(clip.id, track.id);
    },
    [clip.id, track.id, selectClip],
  );

  const handleDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (track.locked || e.button !== 0) return;
      e.stopPropagation();
      selectClip(clip.id, track.id);
      _pushHistory();
      setIsDragging(true);
      dragOrigin.current = {
        mouseX: e.clientX,
        trackPosition: clip.trackPosition,
        sourceStart: clip.sourceStart,
        sourceEnd: clip.sourceEnd,
      };
    },
    [clip, track, selectClip, _pushHistory],
  );

  const handleTrimStart = useCallback(
    (side: "left" | "right", e: React.MouseEvent) => {
      if (track.locked) return;
      e.stopPropagation();
      e.preventDefault();
      selectClip(clip.id, track.id);
      _pushHistory();
      setIsTrimming(side);
      dragOrigin.current = {
        mouseX: e.clientX,
        trackPosition: clip.trackPosition,
        sourceStart: clip.sourceStart,
        sourceEnd: clip.sourceEnd,
      };
    },
    [clip, track, selectClip, _pushHistory],
  );

  // ── Mouse-move / mouse-up (window) ──────────────────────────────────────

  useEffect(() => {
    if (!isDragging && !isTrimming) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - dragOrigin.current.mouseX;
      const deltaTime = deltaX / timelineZoom;

      if (isDragging) {
        const newPosition = Math.max(
          0,
          dragOrigin.current.trackPosition + deltaTime,
        );
        updateClip(track.id, clip.id, { trackPosition: newPosition });
      } else if (isTrimming === "left") {
        const newSourceStart = Math.max(
          0,
          Math.min(
            dragOrigin.current.sourceEnd - 0.05,
            dragOrigin.current.sourceStart + deltaTime,
          ),
        );
        const positionDelta =
          newSourceStart - dragOrigin.current.sourceStart;
        updateClip(track.id, clip.id, {
          sourceStart: newSourceStart,
          trackPosition: dragOrigin.current.trackPosition + positionDelta,
        });
      } else if (isTrimming === "right") {
        const maxEnd = asset?.duration ?? dragOrigin.current.sourceEnd + 600;
        const newSourceEnd = Math.max(
          dragOrigin.current.sourceStart + 0.05,
          Math.min(maxEnd, dragOrigin.current.sourceEnd + deltaTime),
        );
        updateClip(track.id, clip.id, { sourceEnd: newSourceEnd });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsTrimming(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, isTrimming, timelineZoom, track.id, clip.id, updateClip, asset]);

  // ── Styles ───────────────────────────────────────────────────────────────

  const isZoomClip = clip.assetId === ZOOM_ASSET_ID;

  const typeColors: Record<string, string> = {
    video: "bg-blue-900/60 border-blue-600/70",
    audio: "bg-green-900/60 border-green-600/70",
    overlay: "bg-purple-900/60 border-purple-600/70",
    zoom: "bg-amber-900/60 border-amber-600/70",
  };
  const colorCls = isZoomClip ? typeColors.zoom : (typeColors[track.type] ?? typeColors.video);
  const selectedCls = isSelected ? "ring-2 ring-blue-500 ring-offset-0" : "";
  const lockedCls = track.locked ? "opacity-50 pointer-events-none" : "";

  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>
        <div
          className={`absolute top-1 bottom-1 rounded border ${colorCls} ${selectedCls} ${lockedCls}
            cursor-grab active:cursor-grabbing overflow-hidden group select-none transition-shadow`}
          style={{ left, width: Math.max(width, 6) }}
          onClick={handleClick}
          onMouseDown={handleDragStart}
        >
          {/* Left trim handle */}
          <div
            className="absolute left-0 top-0 bottom-0 w-1.5 cursor-col-resize z-10
              bg-white/0 hover:bg-white/20 active:bg-white/30 rounded-l"
            onMouseDown={(e) => handleTrimStart("left", e)}
          />

          {/* ── Content ──────────────────────────────────────────── */}
          <div className="px-2 py-0.5 h-full flex flex-col justify-between overflow-hidden pointer-events-none">
            <span className="text-[10px] font-medium text-neutral-200 truncate leading-tight">
              {isZoomClip
                ? `Zoom ${((clip.effects[0]?.params?.scale as number) ?? 1.5).toFixed(1)}x`
                : (asset?.name ?? "Unknown")}
            </span>

            {/* Audio waveform */}
            {track.type === "audio" && asset && width > 50 && (
              <div className="flex-1 min-h-0 mt-0.5">
                <Waveform
                  audioUrl={asset.path}
                  height={28}
                  width={Math.max(Math.round(width) - 16, 24)}
                />
              </div>
            )}

            {/* Video thumbnails */}
            {track.type === "video" &&
              asset?.thumbnails &&
              asset.thumbnails.length > 0 && (
                <div className="flex-1 min-h-0 flex overflow-hidden opacity-40 mt-0.5">
                  {asset.thumbnails.map((thumb, i) => (
                    <img
                      key={i}
                      src={thumb}
                      alt=""
                      className="h-full w-auto object-cover"
                      draggable={false}
                    />
                  ))}
                </div>
              )}

            {/* Effect indicators bar */}
            {track.type === "video" &&
              clip.effects.length > 0 &&
              clipDuration > 0 &&
              width > 40 && (
                <div className="absolute bottom-0 left-0 right-0 h-1.5 px-1 pb-0.5 pointer-events-none">
                  {clip.effects.map((effect, i) => {
                    const start = (effect.startTime / clipDuration) * 100;
                    const end = ((effect.startTime + effect.duration) / clipDuration) * 100;
                    const w = Math.max(4, end - start);
                    const isZoom = effect.type === "zoom";
                    const isAutoZoom = isZoom && effect.params.source === "auto";
                    return (
                      <div
                        key={i}
                        className="absolute bottom-0.5 rounded-sm h-1"
                        style={{
                          left: `${start}%`,
                          width: `${w}%`,
                          backgroundColor: isAutoZoom
                            ? "rgba(6, 182, 212, 0.8)"   // cyan for auto-zoom
                            : isZoom
                            ? "rgba(59, 130, 246, 0.8)"   // blue for manual zoom
                            : "rgba(251, 191, 36, 0.8)",  // amber for fades
                        }}
                        title={`${effect.type} ${effect.startTime.toFixed(1)}s–${(effect.startTime + effect.duration).toFixed(1)}s`}
                      />
                    );
                  })}
                </div>
              )}
          </div>

          {/* Right trim handle */}
          <div
            className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize z-10
              bg-white/0 hover:bg-white/20 active:bg-white/30 rounded-r"
            onMouseDown={(e) => handleTrimStart("right", e)}
          />
        </div>
      </ContextMenu.Trigger>

      {/* ── Context menu ───────────────────────────────────────────── */}
      <ContextMenu.Portal>
        <ContextMenu.Content className="min-w-[170px] bg-neutral-800 border border-neutral-700 rounded-lg p-1 shadow-2xl z-[100]">
          <ContextMenu.Item
            className="flex items-center px-3 py-1.5 text-sm text-neutral-200 rounded
              hover:bg-neutral-700 cursor-pointer outline-none data-[highlighted]:bg-neutral-700"
            onSelect={() => {
              selectClip(clip.id, track.id);
              splitClipAtPlayhead();
            }}
          >
            Split at Playhead
          </ContextMenu.Item>

          <ContextMenu.Item
            className="flex items-center px-3 py-1.5 text-sm text-neutral-200 rounded
              hover:bg-neutral-700 cursor-pointer outline-none data-[highlighted]:bg-neutral-700"
            onSelect={() => duplicateClip(track.id, clip.id)}
          >
            Duplicate
          </ContextMenu.Item>

          <ContextMenu.Separator className="h-px my-1 bg-neutral-700" />

          <ContextMenu.Item
            className="flex items-center px-3 py-1.5 text-sm text-red-400 rounded
              hover:bg-neutral-700 cursor-pointer outline-none data-[highlighted]:bg-neutral-700"
            onSelect={() => removeClip(track.id, clip.id)}
          >
            Delete
          </ContextMenu.Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

export default memo(TimelineClip);
