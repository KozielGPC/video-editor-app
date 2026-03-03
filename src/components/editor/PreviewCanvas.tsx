import { useRef, useState, useEffect, useMemo, useCallback } from "react";
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
import type { Clip, Asset, Effect, Project, CameraOverlayInfo } from "@/types/project";
import { ZOOM_ASSET_ID } from "@/types/project";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTimecode(seconds: number, frameRate = 30): string {
  const m = Math.floor(Math.abs(seconds) / 60);
  const s = Math.floor(Math.abs(seconds) % 60);
  const f = Math.floor((Math.abs(seconds) % 1) * frameRate);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${f.toString().padStart(2, "0")}`;
}

/**
 * Hermite smoothstep: 3t² - 2t³ (clamped to 0-1)
 */
function smoothstep(t: number): number {
  const clamped = Math.max(0, Math.min(1, t));
  return 3 * clamped * clamped - 2 * clamped * clamped * clamped;
}

/**
 * Apply an easing function to a 0-1 progress value.
 */
function applyEasing(t: number, easing: string): number {
  const clamped = Math.max(0, Math.min(1, t));
  switch (easing) {
    case "ease-in":
      return clamped * clamped * clamped;
    case "ease-out":
      return 1 - Math.pow(1 - clamped, 3);
    case "linear":
      return clamped;
    default: // ease-in-out (smoothstep)
      return smoothstep(clamped);
  }
}

/**
 * Collect zoom effects from the zoom track that are active at a given playhead position.
 * Returns them as Effect[] with absolute timeline positions converted to clip-relative.
 */
function getZoomTrackEffects(project: Project, playheadPos: number): Effect[] {
  const zoomTrack = project.tracks.find((t) => t.type === "zoom" && !t.muted);
  if (!zoomTrack) return [];

  for (const clip of zoomTrack.clips) {
    if (clip.assetId !== ZOOM_ASSET_ID) continue;
    const dur = clip.sourceEnd - clip.sourceStart;
    const clipEnd = clip.trackPosition + dur;
    if (playheadPos >= clip.trackPosition && playheadPos < clipEnd) {
      // Return the zoom effect with startTime relative to the zoom clip's track position
      return clip.effects.filter((e) => e.type === "zoom").map((e) => ({
        ...e,
        // Convert: effect is already at startTime=0 relative to zoom clip,
        // we need it relative to clipTrackPos=0 for the compute function
        startTime: clip.trackPosition + e.startTime,
        duration: e.duration,
      }));
    }
  }
  return [];
}

/**
 * Interpolate x,y from keyframed positions based on elapsed time within the effect.
 * Falls back to static x,y when no positions are available.
 */
function interpolatePosition(
  positions: Array<{ t: number; x: number; y: number }>,
  elapsed: number,
  fallbackX: number,
  fallbackY: number,
): { x: number; y: number } {
  if (!positions || positions.length === 0) return { x: fallbackX, y: fallbackY };
  if (positions.length === 1) return { x: positions[0].x, y: positions[0].y };

  // Before first keyframe
  if (elapsed <= positions[0].t) return { x: positions[0].x, y: positions[0].y };
  // After last keyframe
  const last = positions[positions.length - 1];
  if (elapsed >= last.t) return { x: last.x, y: last.y };

  // Find surrounding keyframes and linearly interpolate
  for (let i = 0; i < positions.length - 1; i++) {
    const a = positions[i];
    const b = positions[i + 1];
    if (elapsed >= a.t && elapsed <= b.t) {
      const frac = b.t > a.t ? (elapsed - a.t) / (b.t - a.t) : 0;
      return {
        x: a.x + (b.x - a.x) * frac,
        y: a.y + (b.y - a.y) * frac,
      };
    }
  }
  return { x: fallbackX, y: fallbackY };
}

/**
 * Compute zoom transform with smooth easing transitions.
 *
 * Three phases: ramp-in → hold → ramp-out, using configurable easing
 * and ramp durations from effect.params (defaults: 0.3s, ease-in-out).
 * Matches the FFmpeg export filter behavior exactly.
 *
 * Checks zoom track first, then falls back to embedded clip effects.
 */
function computeZoomTransform(
  effects: Effect[],
  clipTrackPos: number,
  playheadPos: number,
  project?: Project | null,
): { scale: number; originX: number; originY: number; isActive: boolean } {
  let scale = 1;
  let originX = 50;
  let originY = 50;
  let isActive = false;

  // Collect zoom effects from both zoom track (absolute positions) and embedded effects
  const zoomTrackEffects = project ? getZoomTrackEffects(project, playheadPos) : [];

  // Check zoom track effects first (they use absolute timeline positions)
  for (const e of zoomTrackEffects) {
    const effectStart = e.startTime; // already absolute
    const effectEnd = effectStart + e.duration;
    if (playheadPos >= effectStart && playheadPos < effectEnd) {
      const targetScale = (e.params.scale as number) ?? 2;
      const rampIn = (e.params.rampIn as number) ?? 0.3;
      const rampOut = (e.params.rampOut as number) ?? 0.3;
      const easing = (e.params.easing as string) ?? "ease-in-out";
      const dur = e.duration;
      const rampInClamped = Math.min(rampIn, dur / 2);
      const rampOutClamped = Math.min(rampOut, dur / 2);
      const elapsed = playheadPos - effectStart;
      const rampInEnd = rampInClamped;
      const rampOutStart = dur - rampOutClamped;
      let mix: number;
      if (elapsed < rampInEnd) {
        mix = applyEasing(rampInClamped > 0 ? elapsed / rampInClamped : 1, easing);
      } else if (elapsed >= rampOutStart) {
        mix = 1 - applyEasing(rampOutClamped > 0 ? (elapsed - rampOutStart) / rampOutClamped : 1, easing);
      } else {
        mix = 1;
      }
      scale = 1 + (targetScale - 1) * mix;

      // Interpolate position from keyframes if available
      const positions = Array.isArray(e.params.positions) ? e.params.positions as Array<{ t: number; x: number; y: number }> : undefined;
      const pos = interpolatePosition(
        positions ?? [],
        elapsed,
        (e.params.x as number) ?? 50,
        (e.params.y as number) ?? 50,
      );
      originX = pos.x;
      originY = pos.y;
      isActive = true;
      return { scale, originX, originY, isActive };
    }
  }

  // Fallback: check embedded clip effects (backward compat)
  for (const e of effects) {
    if (e.type !== "zoom") continue;
    const effectStart = clipTrackPos + e.startTime;
    const effectEnd = effectStart + e.duration;
    if (playheadPos >= effectStart && playheadPos < effectEnd) {
      const targetScale = (e.params.scale as number) ?? 2;
      const rampIn = (e.params.rampIn as number) ?? 0.3;
      const rampOut = (e.params.rampOut as number) ?? 0.3;
      const easing = (e.params.easing as string) ?? "ease-in-out";

      // Clamp ramp durations
      const dur = e.duration;
      const rampInClamped = Math.min(rampIn, dur / 2);
      const rampOutClamped = Math.min(rampOut, dur / 2);

      const elapsed = playheadPos - effectStart;
      const rampInEnd = rampInClamped;
      const rampOutStart = dur - rampOutClamped;

      let mix: number;
      if (elapsed < rampInEnd) {
        // Ramp-in phase
        const progress = rampInClamped > 0 ? elapsed / rampInClamped : 1;
        mix = applyEasing(progress, easing);
      } else if (elapsed >= rampOutStart) {
        // Ramp-out phase
        const progress = rampOutClamped > 0 ? (elapsed - rampOutStart) / rampOutClamped : 1;
        mix = 1 - applyEasing(progress, easing);
      } else {
        // Hold phase
        mix = 1;
      }

      scale = 1 + (targetScale - 1) * mix;

      // Interpolate position from keyframes if available
      const positions = Array.isArray(e.params.positions) ? e.params.positions as Array<{ t: number; x: number; y: number }> : undefined;
      const pos = interpolatePosition(
        positions ?? [],
        elapsed,
        (e.params.x as number) ?? 50,
        (e.params.y as number) ?? 50,
      );
      originX = pos.x;
      originY = pos.y;
      isActive = true;
      break;
    }
  }
  return { scale, originX, originY, isActive };
}

/** A clip ready for playback with its resolved asset and pre-computed end. */
interface PlaybackClip {
  clip: Clip;
  asset: Asset;
  clipEnd: number; // trackPosition + duration (timeline end)
}

/** CSS for the hidden decode-only video elements. */
const HIDDEN_VIDEO_STYLE: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  opacity: 0,
  pointerEvents: "none",
  top: 0,
  left: 0,
};

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

  // Canvas = the only visible rendering surface.
  // Two hidden <video> elements act as frame decoders — one active, one standby.
  // ctx.drawImage(vid) copies the decoded frame to the canvas each animation
  // frame. At clip boundaries the standby (already pre-seeked) is drawn instead,
  // giving a truly gapless visual transition with zero play() latency.
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRefA = useRef<HTMLVideoElement>(null);
  const videoRefB = useRef<HTMLVideoElement>(null);
  /** Which decoder element is currently active: 'A' or 'B'. */
  const activeElRef = useRef<"A" | "B">("A");
  const containerRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef(0);

  /** Current zoom state — written by ZoomablePreview, read by drawFrame. */
  const zoomRef = useRef<{ scale: number; originX: number; originY: number; isActive: boolean }>({
    scale: 1, originX: 50, originY: 50, isActive: false,
  });

  /** Return the video element for a given key. */
  const getVid = (key: "A" | "B"): HTMLVideoElement | null =>
    key === "A" ? videoRefA.current : videoRefB.current;

  /**
   * Paint a video element's current frame onto the canvas.
   * When zoom is active, crops the source frame so the canvas always
   * renders at full resolution — no CSS upscaling artifacts.
   */
  const drawFrame = useCallback((vidOverride?: HTMLVideoElement | null) => {
    const canvas = canvasRef.current;
    const vid = vidOverride ?? (activeElRef.current === "A" ? videoRefA.current : videoRefB.current);
    if (!canvas || !vid || vid.readyState < 2) return; // HAVE_CURRENT_DATA
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const z = zoomRef.current;
    if (z.isActive && z.scale > 1) {
      // Crop: draw only the visible portion of the video at full canvas resolution
      const vw = vid.videoWidth;
      const vh = vid.videoHeight;
      const visW = vw / z.scale;
      const visH = vh / z.scale;
      const cx = (z.originX / 100) * vw;
      const cy = (z.originY / 100) * vh;
      const sx = Math.max(0, Math.min(cx - visW / 2, vw - visW));
      const sy = Math.max(0, Math.min(cy - visH / 2, vh - visH));
      ctx.drawImage(vid, sx, sy, visW, visH, 0, 0, canvas.width, canvas.height);
    } else {
      ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
    }
  }, []);

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

  // ── Playback state (persists across animation frames, bypasses React) ───

  const playbackRef = useRef<{
    clips: PlaybackClip[];
    currentIdx: number;
    preSeekDone: boolean;
  } | null>(null);

  /** Throttle React state updates during playback. */
  const PLAYBACK_THROTTLE_MS = 80; // ~12 fps for React UI updates
  const lastStateUpdateRef = useRef(0);

  // ── Seek video when scrubbing (not playing) + draw to canvas ───────────

  useEffect(() => {
    if (isPlaying) return;
    const vid = getVid(activeElRef.current);
    if (!vid || !activeVideo) return;
    const targetTime = activeVideo.sourceTime;
    const needsSeek = Math.abs(vid.currentTime - targetTime) > 0.05;
    if (needsSeek) {
      vid.currentTime = targetTime;
      vid.addEventListener("seeked", () => drawFrame(), { once: true });
    }
    // Draw immediately (shows last decoded frame; seeked callback refreshes)
    drawFrame();
  }, [activeVideo, isPlaying, drawFrame]);

  // ── Playback animation loop ─────────────────────────────────────────────
  // Two hidden <video> decoders play natively.  Every animation frame we
  // blit the active decoder's current frame to the canvas via drawImage().
  // At clip boundaries we instantly blit the standby decoder's pre-seeked
  // frame — the transition is a simple pixel copy (~0 ms), not a play()
  // call which carries 50-100 ms audio-pipeline startup latency.

  const stopPlayback = useCallback(() => {
    setIsPlaying(false);
  }, [setIsPlaying]);

  /** How far (seconds) before a clip boundary we pre-seek the standby. */
  const PRE_SEEK_WINDOW = 0.8;

  useEffect(() => {
    if (!isPlaying) {
      cancelAnimationFrame(animFrameRef.current);
      const vid = getVid(activeElRef.current);
      if (vid) { vid.pause(); vid.muted = true; }
      playbackRef.current = null;
      drawFrame(); // freeze the canvas on the stopped frame
      return;
    }
    const vid = getVid(activeElRef.current);
    if (!vid || !project) return;
    // Build a sorted list of clips from video tracks only
    const clips: PlaybackClip[] = [];
    for (const track of project.tracks) {
      if (track.type !== "video" || track.muted) continue;
      for (const clip of track.clips) {
        const asset = project.assets.find((a) => a.id === clip.assetId);
        if (asset) {
          clips.push({
            clip,
            asset,
            clipEnd: clip.trackPosition + (clip.sourceEnd - clip.sourceStart),
          });
        }
      }
    }
    clips.sort((a, b) => a.clip.trackPosition - b.clip.trackPosition);
    if (clips.length === 0) {
      stopPlayback();
      return;
    }
    // Find clip at the current playhead position
    let idx = clips.findIndex(
      (c) => playheadPosition >= c.clip.trackPosition && playheadPosition < c.clipEnd,
    );
    if (idx < 0) idx = 0;
    playbackRef.current = { clips, currentIdx: idx, preSeekDone: false };
    lastStateUpdateRef.current = 0; // force immediate first update
    // Active decoder: unmuted, plays audio + video
    vid.muted = false;
    const initialSrc = streamUrl(clips[idx].asset.path);
    if (!vid.src || vid.dataset.assetPath !== clips[idx].asset.path) {
      vid.src = initialSrc;
      vid.dataset.assetPath = clips[idx].asset.path;
    }
    // Standby decoder: muted, idle
    const standby = getVid(activeElRef.current === "A" ? "B" : "A");
    if (standby) standby.muted = true;
    // Seek to the correct source position and start
    const initialSourceTime =
      clips[idx].clip.sourceStart + (playheadPosition - clips[idx].clip.trackPosition);
    vid.currentTime = Math.max(clips[idx].clip.sourceStart, initialSourceTime);
    vid.play().catch(() => {});
    const tick = () => {
      const pb = playbackRef.current;
      if (!pb) return;
      const c = pb.clips[pb.currentIdx];
      if (!c) {
        setPlayheadPosition(totalDuration);
        stopPlayback();
        return;
      }
      const activeVid = getVid(activeElRef.current)!;
      // Blit the active decoder's frame to the canvas every tick
      drawFrame();
      // While the browser is seeking, keep polling (canvas shows last frame)
      if (activeVid.seeking) {
        animFrameRef.current = requestAnimationFrame(tick);
        return;
      }
      const srcTime = activeVid.currentTime;
      // ── Pre-seek the standby decoder before the boundary ───────────
      const timeToEnd = c.clip.sourceEnd - srcTime;
      if (timeToEnd < PRE_SEEK_WINDOW && !pb.preSeekDone) {
        const nextIdx = pb.currentIdx + 1;
        if (nextIdx < pb.clips.length) {
          const standbyKey = activeElRef.current === "A" ? "B" : "A";
          const standbyVid = getVid(standbyKey);
          if (standbyVid) {
            const next = pb.clips[nextIdx];
            if (standbyVid.dataset.assetPath !== next.asset.path) {
              standbyVid.src = streamUrl(next.asset.path);
              standbyVid.dataset.assetPath = next.asset.path;
            }
            standbyVid.currentTime = next.clip.sourceStart;
          }
          pb.preSeekDone = true;
        }
      }
      // ── Clip boundary: instant visual swap via canvas blit ─────────
      if (srcTime >= c.clip.sourceEnd - 0.016) {
        const nextIdx = pb.currentIdx + 1;
        if (nextIdx >= pb.clips.length) {
          setPlayheadPosition(totalDuration);
          stopPlayback();
          return;
        }
        const standbyKey = activeElRef.current === "A" ? "B" : "A";
        const standbyVid = getVid(standbyKey);
        // ** GAPLESS: blit the standby's pre-decoded frame to the canvas **
        // This is a raw pixel copy — zero latency, no play() startup cost.
        if (standbyVid) drawFrame(standbyVid);
        // Tear down old decoder
        activeVid.pause();
        activeVid.muted = true;
        // Activate new decoder
        activeElRef.current = standbyKey;
        if (standbyVid) {
          standbyVid.muted = false;
          standbyVid.play().catch(() => {});
        }
        pb.currentIdx = nextIdx;
        pb.preSeekDone = false;
        // Force a state update at the boundary
        setPlayheadPosition(pb.clips[nextIdx].clip.trackPosition);
        lastStateUpdateRef.current = performance.now();
        animFrameRef.current = requestAnimationFrame(tick);
        return;
      }
      // ── Normal frame: throttle React state updates ─────────────────
      const now = performance.now();
      if (now - lastStateUpdateRef.current >= PLAYBACK_THROTTLE_MS) {
        lastStateUpdateRef.current = now;
        const newPos = c.clip.trackPosition + (srcTime - c.clip.sourceStart);
        setPlayheadPosition(Math.max(0, newPos));
      }
      animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(animFrameRef.current);
      playbackRef.current = null;
    };
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
            canvasRef={canvasRef}
            videoRefA={videoRefA}
            videoRefB={videoRefB}
            videoSrc={videoSrc}
            isPlaying={isPlaying}
            zoomRef={zoomRef}
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
  canvasRef,
  videoRefA,
  videoRefB,
  videoSrc,
  isPlaying,
  zoomRef,
}: {
  activeVideo: { clip: import("@/types/project").Clip; asset: import("@/types/project").Asset; sourceTime: number };
  previewDims: { width: number; height: number };
  playheadPosition: number;
  project: import("@/types/project").Project;
  canvasRef: React.RefObject<HTMLCanvasElement>;
  videoRefA: React.RefObject<HTMLVideoElement>;
  videoRefB: React.RefObject<HTMLVideoElement>;
  videoSrc: string;
  isPlaying: boolean;
  zoomRef: React.MutableRefObject<{ scale: number; originX: number; originY: number; isActive: boolean }>;
}) {
  const zoom = computeZoomTransform(
    activeVideo.clip.effects,
    activeVideo.clip.trackPosition,
    playheadPosition,
    project,
  );

  // Write zoom state to the ref so drawFrame() can crop at full resolution
  zoomRef.current = zoom;

  // For split layouts (camera height === 100%), constrain screen canvas width
  const cam = project.cameraOverlay;
  const camVisible = cam && !cam.hidden;
  const isSplitLayout = camVisible && cam.height >= 99;
  const screenWidthPercent = isSplitLayout ? (100 - cam.width) : 100;

  return (
    <div
      className="relative bg-black overflow-hidden rounded-sm"
      style={{ width: previewDims.width, height: previewDims.height }}
    >
      {/* Inner container — zoom is now handled inside drawFrame() at full resolution */}
      <div
        className="relative h-full"
        style={{ width: `${screenWidthPercent}%` }}
      >
        {/* Canvas — the sole visible rendering surface.
            In split layouts (screen + camera side-by-side) the container is narrower
            than the video aspect ratio, so we use object-cover to fill the space
            (matching the recorder's SourceOverlay behaviour). */}
        <canvas
          ref={canvasRef}
          width={project.resolution.width}
          height={project.resolution.height}
          className="w-full h-full"
          style={{ objectFit: isSplitLayout ? "cover" : "contain" }}
        />

        {/* Hidden video decoders — never visible, used only as frame sources
            for drawImage(). Keeping them in the DOM (tiny, transparent) ensures
            the browser's hardware decoder stays active. */}
        <video
          ref={videoRefA}
          src={videoSrc}
          style={HIDDEN_VIDEO_STYLE}
          playsInline
          preload="auto"
        />
        <video
          ref={videoRefB}
          style={HIDDEN_VIDEO_STYLE}
          playsInline
          preload="auto"
        />

        {/* Overlay compositing layer (always on top) */}
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
                zIndex: 5,
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

      {/* Camera overlay — rendered OUTSIDE the zoom div so zoom doesn't affect it */}
      {project.cameraOverlay && !project.cameraOverlay.hidden && (
        <CameraOverlayElement
          cameraOverlay={project.cameraOverlay}
          sourceTime={activeVideo.sourceTime}
          isPlaying={isPlaying}
        />
      )}

      {/* Zoom indicator badge */}
      {zoom.isActive && (
        <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-md bg-blue-600/80 text-white text-[10px] font-medium backdrop-blur-sm pointer-events-none z-10">
          <ZoomIn size={11} />
          {zoom.scale.toFixed(2)}x
        </div>
      )}
    </div>
  );
}

/** Camera overlay video element — positioned absolutely, NOT affected by zoom. */
function CameraOverlayElement({
  cameraOverlay,
  sourceTime,
  isPlaying,
}: {
  cameraOverlay: CameraOverlayInfo;
  sourceTime: number;
  isPlaying: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Sync camera video time when scrubbing
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || isPlaying) return;
    const cameraTime = Math.max(0, sourceTime + cameraOverlay.syncOffset);
    if (Math.abs(vid.currentTime - cameraTime) > 0.05) {
      vid.currentTime = cameraTime;
    }
  }, [sourceTime, isPlaying, cameraOverlay.syncOffset]);

  // Play/pause in sync with main video
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    if (isPlaying) {
      const cameraTime = Math.max(0, sourceTime + cameraOverlay.syncOffset);
      vid.currentTime = cameraTime;
      vid.play().catch(() => {});
    } else {
      vid.pause();
    }
  }, [isPlaying, sourceTime, cameraOverlay.syncOffset]);

  const cropX = cameraOverlay.cropX ?? 0;
  const cropY = cameraOverlay.cropY ?? 0;
  const cropW = cameraOverlay.cropWidth ?? 100;
  const cropH = cameraOverlay.cropHeight ?? 100;

  // Scale video to show only cropped region filling the container
  const scaleX = 100 / cropW;
  const scaleY = 100 / cropH;
  const offsetX = -(cropX * 100) / cropW;
  const offsetY = -(cropY * 100) / cropH;

  let borderRadius = "0";
  if (cameraOverlay.shape === "circle") borderRadius = "50%";
  else if (cameraOverlay.shape === "rounded")
    borderRadius = `${cameraOverlay.borderRadius ?? 20}%`;

  return (
    <div
      className="absolute pointer-events-none overflow-hidden"
      style={{
        left: `${cameraOverlay.x}%`,
        top: `${cameraOverlay.y}%`,
        width: `${cameraOverlay.width}%`,
        height: `${cameraOverlay.height}%`,
        borderRadius,
        border:
          cameraOverlay.borderWidth && cameraOverlay.borderWidth > 0
            ? `${cameraOverlay.borderWidth}px solid ${cameraOverlay.borderColor ?? "#fff"}`
            : undefined,
        boxShadow: cameraOverlay.shadow
          ? "0 4px 20px rgba(0,0,0,0.5)"
          : undefined,
        zIndex: 10,
      }}
    >
      <video
        ref={videoRef}
        src={streamUrl(cameraOverlay.path)}
        style={{
          width: `${scaleX * 100}%`,
          height: `${scaleY * 100}%`,
          marginLeft: `${offsetX}%`,
          marginTop: `${offsetY}%`,
          objectFit: "cover",
        }}
        playsInline
        muted
        preload="auto"
      />
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
