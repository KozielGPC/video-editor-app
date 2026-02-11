import { memo } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Video,
  Music,
  Layers,
  Volume2,
  VolumeX,
  Lock,
  Unlock,
} from "lucide-react";
import { useEditorStore } from "@/stores/editorStore";
import type { Track } from "@/types/project";
import TimelineClip from "./TimelineClip";

// ─── Constants ───────────────────────────────────────────────────────────────

export const HEADER_WIDTH = 150;
export const TRACK_HEIGHT = 64;

// ─── Track Type Config ───────────────────────────────────────────────────────

const trackConfig: Record<string, { icon: LucideIcon; bg: string }> = {
  video: { icon: Video, bg: "bg-blue-950/30" },
  audio: { icon: Music, bg: "bg-green-950/30" },
  overlay: { icon: Layers, bg: "bg-purple-950/30" },
};

// ─── Component ───────────────────────────────────────────────────────────────

interface TimelineTrackProps {
  track: Track;
  trackIndex: number;
}

function TimelineTrack({ track, trackIndex }: TimelineTrackProps) {
  const {
    selectedClipId,
    timelineZoom,
    toggleTrackMute,
    toggleTrackLock,
    selectTrack,
  } = useEditorStore();

  const config = trackConfig[track.type] ?? trackConfig.video;
  const TrackIcon = config.icon;
  const displayName =
    track.name ??
    `${track.type.charAt(0).toUpperCase() + track.type.slice(1)} ${trackIndex + 1}`;

  return (
    <div className="flex" style={{ height: TRACK_HEIGHT }}>
      {/* ── Track header (sticky left) ─────────────────────────────── */}
      <div
        className={`sticky left-0 z-10 border-r border-b border-neutral-700 flex flex-col justify-center
          px-2 gap-1 bg-neutral-900 ${track.locked ? "opacity-60" : ""}`}
        style={{ width: HEADER_WIDTH, minWidth: HEADER_WIDTH }}
        onClick={() => selectTrack(track.id)}
      >
        <div className="flex items-center gap-1.5">
          <TrackIcon size={13} className="text-neutral-400 flex-none" />
          <span className="text-[11px] font-medium text-neutral-200 truncate">
            {displayName}
          </span>
        </div>

        <div className="flex items-center gap-0.5">
          {/* Mute toggle */}
          <button
            className={`p-0.5 rounded transition-colors ${
              track.muted
                ? "text-red-400 hover:text-red-300"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
            onClick={(e) => {
              e.stopPropagation();
              toggleTrackMute(track.id);
            }}
            title={track.muted ? "Unmute" : "Mute"}
          >
            {track.muted ? <VolumeX size={13} /> : <Volume2 size={13} />}
          </button>

          {/* Lock toggle */}
          <button
            className={`p-0.5 rounded transition-colors ${
              track.locked
                ? "text-yellow-400 hover:text-yellow-300"
                : "text-neutral-500 hover:text-neutral-300"
            }`}
            onClick={(e) => {
              e.stopPropagation();
              toggleTrackLock(track.id);
            }}
            title={track.locked ? "Unlock" : "Lock"}
          >
            {track.locked ? <Lock size={13} /> : <Unlock size={13} />}
          </button>
        </div>
      </div>

      {/* ── Track content (clips area) ─────────────────────────────── */}
      <div
        className={`flex-1 relative border-b border-neutral-700/50 ${config.bg}`}
      >
        {/* Drop-zone grid-line pattern */}
        <div className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(90deg, #fff 0 1px, transparent 1px 100%)",
            backgroundSize: `${timelineZoom}px 100%`,
          }}
        />

        {/* Clips */}
        {track.clips.map((clip) => (
          <TimelineClip
            key={clip.id}
            clip={clip}
            track={track}
            timelineZoom={timelineZoom}
            isSelected={clip.id === selectedClipId}
          />
        ))}

        {/* Empty state */}
        {track.clips.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="text-[10px] text-neutral-600">
              Drop clips here
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default memo(TimelineTrack);
