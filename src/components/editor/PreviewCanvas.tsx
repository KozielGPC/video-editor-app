import { useRef, useState, useEffect, useMemo } from "react";
import {
  Film,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronsLeft,
  ChevronsRight,
  ZoomIn,
} from "lucide-react";
import { useEditorStore } from "@/stores/editorStore";
import { streamUrl } from "@/lib/stream";
import type { Effect } from "@/types/project";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTimecode(seconds: number, frameRate = 30): string {
  const m = Math.floor(Math.abs(seconds) / 60);
  const s = Math.floor(Math.abs(seconds) % 60);
  const f = Math.floor((Math.abs(seconds) % 1) * frameRate);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${f.toString().padStart(2, "0")}`;
}

/**
 * Compute zoom transform: ramp up at start, hold, ramp down at end.
 * Matches toggle behavior: first shortcut = zoom in, second = zoom out.
 */
function computeZoomTransform(
  effects: Effect[],
  clipTrackPos: number,
  playheadPos: number,
): { scale: number; originX: number; originY: number; isActive: boolean } {
  let scale = 1;
  let originX = 50;
  let originY = 50;
  let isActive = false;
  const RAMP = 0.15; // First/last 15% of duration for smooth ramp
  for (const e of effects) {
    if (e.type !== "zoom") continue;
    const effectStart = clipTrackPos + e.startTime;
    const effectEnd = effectStart + e.duration;
    if (playheadPos >= effectStart && playheadPos < effectEnd) {
      const progress = (playheadPos - effectStart) / e.duration;
      const targetScale = e.params.scale ?? 2;
      let mix: number;
      if (progress < RAMP) {
        mix = progress / RAMP; // Ramp up
      } else if (progress > 1 - RAMP) {
        mix = (1 - progress) / RAMP; // Ramp down
      } else {
        mix = 1; // Hold at max
      }
      scale = 1 + (targetScale - 1) * mix;
      originX = e.params.x ?? 50;
      originY = e.params.y ?? 50;
      isActive = true;
      break;
    }
  }
  return { scale, originX, originY, isActive };
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function PreviewCanvas() {
  const {
    project,
    playheadPosition,
    isPlaying,
    setPlayheadPosition,
    setIsPlaying,
    togglePlayback,
  } = useEditorStore();

  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef(0);

  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // ── Observe container size ──────────────────────────────────────────────

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setContainerSize({ width, height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── Find active video clip at playhead ──────────────────────────────────

  const activeVideo = useMemo(() => {
    if (!project) return null;
    for (const track of project.tracks) {
      if (track.type !== "video" || track.muted) continue;
      for (const clip of track.clips) {
        const dur = clip.sourceEnd - clip.sourceStart;
        const end = clip.trackPosition + dur;
        if (playheadPosition >= clip.trackPosition && playheadPosition < end) {
          const asset = project.assets.find((a) => a.id === clip.assetId);
          if (asset) {
            return {
              clip,
              asset,
              sourceTime: clip.sourceStart + (playheadPosition - clip.trackPosition),
            };
          }
        }
      }
    }
    return null;
  }, [project, playheadPosition]);

  // ── Compute letterboxed preview dims ────────────────────────────────────

  const TRANSPORT_HEIGHT = 48;

  const previewDims = useMemo(() => {
    if (!project || containerSize.width === 0 || containerSize.height === 0) {
      return { width: 0, height: 0 };
    }
    const availH = containerSize.height - TRANSPORT_HEIGHT;
    const pAspect = project.resolution.width / project.resolution.height;
    const cAspect = containerSize.width / Math.max(availH, 1);

    let w: number, h: number;
    if (pAspect > cAspect) {
      w = containerSize.width;
      h = w / pAspect;
    } else {
      h = availH;
      w = h * pAspect;
    }
    return { width: Math.round(w), height: Math.round(h) };
  }, [project, containerSize]);

  // ── Video source URL ────────────────────────────────────────────────────

  const videoSrc = useMemo(() => {
    if (!activeVideo) return "";
    return streamUrl(activeVideo.asset.path);
  }, [activeVideo?.asset.path]);

  // ── Seek video when not playing ─────────────────────────────────────────

  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !activeVideo || isPlaying) return;
    if (Math.abs(vid.currentTime - activeVideo.sourceTime) > 0.05) {
      vid.currentTime = activeVideo.sourceTime;
    }
  }, [activeVideo, isPlaying]);

  // ── Playback animation loop ─────────────────────────────────────────────

  useEffect(() => {
    if (!isPlaying) {
      cancelAnimationFrame(animFrameRef.current);
      videoRef.current?.pause();
      return;
    }

    const vid = videoRef.current;
    vid?.play().catch(() => {});

    const startWall = performance.now();
    const startPos = playheadPosition;

    const tick = () => {
      const elapsed = (performance.now() - startWall) / 1000;
      setPlayheadPosition(startPos + elapsed);
      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animFrameRef.current);
    // Intentionally limited deps – we only restart the loop when play state toggles
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying]);

  // ── Total duration for display ──────────────────────────────────────────

  const totalDuration = useMemo(() => {
    if (!project) return 0;
    return project.tracks.reduce(
      (max, t) =>
        t.clips.reduce((m, c) => {
          const end = c.trackPosition + (c.sourceEnd - c.sourceStart);
          return Math.max(m, end);
        }, max),
      0,
    );
  }, [project]);

  // ── Transport actions ───────────────────────────────────────────────────

  const skipToStart = () => {
    setIsPlaying(false);
    setPlayheadPosition(0);
  };
  const skipToEnd = () => {
    setIsPlaying(false);
    setPlayheadPosition(totalDuration);
  };
  const skipBack = () => setPlayheadPosition(Math.max(0, playheadPosition - 5));
  const skipForward = () => setPlayheadPosition(playheadPosition + 5);

  // ── No project ──────────────────────────────────────────────────────────

  if (!project) {
    return (
      <div className="h-full bg-neutral-950 flex items-center justify-center">
        <Film className="w-12 h-12 text-neutral-800" />
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div ref={containerRef} className="h-full bg-neutral-950 flex flex-col overflow-hidden">
      {/* Preview viewport */}
      <div className="flex-1 relative flex items-center justify-center min-h-0 bg-black/40">
        {activeVideo ? (
          <ZoomablePreview
            activeVideo={activeVideo}
            previewDims={previewDims}
            playheadPosition={playheadPosition}
            project={project}
            videoRef={videoRef}
            videoSrc={videoSrc}
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-neutral-700 gap-2">
            <Film size={48} />
            <span className="text-xs">No video at playhead</span>
          </div>
        )}
      </div>

      {/* Transport controls */}
      <div
        className="bg-neutral-900 border-t border-neutral-700 flex items-center justify-center gap-1 px-4 flex-none"
        style={{ height: TRANSPORT_HEIGHT }}
      >
        <TransportBtn onClick={skipToStart} title="Skip to Start">
          <SkipBack size={15} />
        </TransportBtn>
        <TransportBtn onClick={skipBack} title="Rewind 5s">
          <ChevronsLeft size={15} />
        </TransportBtn>

        <button
          onClick={togglePlayback}
          className="p-2 bg-neutral-800 hover:bg-neutral-700 rounded-full text-white transition-colors mx-1"
          title={isPlaying ? "Pause" : "Play"}
        >
          {isPlaying ? (
            <Pause size={16} />
          ) : (
            <Play size={16} className="ml-0.5" />
          )}
        </button>

        <TransportBtn onClick={skipForward} title="Forward 5s">
          <ChevronsRight size={15} />
        </TransportBtn>
        <TransportBtn onClick={skipToEnd} title="Skip to End">
          <SkipForward size={15} />
        </TransportBtn>

        <div className="ml-4 text-[11px] font-mono text-neutral-400 tabular-nums">
          <span className="text-neutral-200">
            {formatTimecode(playheadPosition, project.frameRate)}
          </span>
          <span className="mx-1">/</span>
          <span>{formatTimecode(totalDuration, project.frameRate)}</span>
        </div>
      </div>
    </div>
  );
}

// ── Zoomable preview ─────────────────────────────────────────────────────────

function ZoomablePreview({
  activeVideo,
  previewDims,
  playheadPosition,
  project,
  videoRef,
  videoSrc,
}: {
  activeVideo: { clip: import("@/types/project").Clip; asset: import("@/types/project").Asset; sourceTime: number };
  previewDims: { width: number; height: number };
  playheadPosition: number;
  project: import("@/types/project").Project;
  videoRef: React.RefObject<HTMLVideoElement>;
  videoSrc: string;
}) {
  const zoom = computeZoomTransform(
    activeVideo.clip.effects,
    activeVideo.clip.trackPosition,
    playheadPosition,
  );

  return (
    <div
      className="relative bg-black overflow-hidden rounded-sm"
      style={{ width: previewDims.width, height: previewDims.height }}
    >
      {/* Inner container that receives the zoom transform */}
      <div
        className="w-full h-full"
        style={{
          transform: zoom.isActive ? `scale(${zoom.scale})` : undefined,
          transformOrigin: zoom.isActive
            ? `${zoom.originX}% ${zoom.originY}%`
            : undefined,
          transition: "transform 0.05s linear",
        }}
      >
        <video
          ref={videoRef}
          src={videoSrc}
          className="w-full h-full object-contain"
          playsInline
          preload="auto"
        />

        {/* Overlay compositing layer */}
        {activeVideo.clip.overlays
          .filter(
            (o) =>
              playheadPosition >= activeVideo.clip.trackPosition + o.startTime &&
              playheadPosition <
                activeVideo.clip.trackPosition + o.startTime + o.duration,
          )
          .map((overlay, i) => (
            <div
              key={i}
              className="absolute pointer-events-none"
              style={{
                left: `${(overlay.position.x / project.resolution.width) * 100}%`,
                top: `${(overlay.position.y / project.resolution.height) * 100}%`,
                width: `${(overlay.size.width / project.resolution.width) * 100}%`,
                height: `${(overlay.size.height / project.resolution.height) * 100}%`,
                ...overlay.style,
              }}
            >
              {overlay.type === "text" && (
                <span className="text-white text-sm">{overlay.content}</span>
              )}
              {overlay.type === "image" && (
                <img
                  src={overlay.content}
                  alt=""
                  className="w-full h-full object-contain"
                />
              )}
            </div>
          ))}
      </div>

      {/* Zoom indicator badge */}
      {zoom.isActive && (
        <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-md bg-blue-600/80 text-white text-[10px] font-medium backdrop-blur-sm pointer-events-none">
          <ZoomIn size={11} />
          {zoom.scale.toFixed(2)}x
        </div>
      )}
    </div>
  );
}

// ── Tiny transport button ────────────────────────────────────────────────────

function TransportBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="p-1.5 text-neutral-400 hover:text-white transition-colors rounded hover:bg-neutral-800"
    >
      {children}
    </button>
  );
}
